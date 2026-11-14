import assert from "node:assert/strict";
import test from "node:test";
import { createAutoSyncSongRepository } from "../mobile/src/data/songs/AutoSyncSongRepository.ts";
import {
  AutomaticSongSyncCoordinator,
  shouldRefreshSyncPreview,
} from "../mobile/src/data/songs/sync/AutomaticSongSyncCoordinator.ts";
import { SongSyncOwnerSession, SongSyncSessionChangedError } from "../mobile/src/data/songs/sync/SongSyncSession.ts";
import type { SongSyncRunResult } from "../mobile/src/data/songs/sync/types.ts";
import type { SongRepository } from "../mobile/src/data/songs/SongRepository.ts";
import type { SongDetail, SongFormValues } from "../mobile/src/types.ts";
import { ApiRequestError, isTransientApiError } from "../mobile/src/api/errors.ts";

const OWNER_1 = "user_1";
const OWNER_2 = "user_2";
const EMPTY_PREVIEW = {
  pendingTotal: 0, newCount: 0, changedCount: 0, deletedCount: 0,
  errorCount: 0, versionCount: 0, anonymousExcludedCount: 4,
};

function result(ownerUserId: string, issues = false): SongSyncRunResult {
  return {
    ownerUserId,
    startedAt: "2026-11-13T10:00:00.000Z",
    completedAt: "2026-11-13T10:00:01.000Z",
    pushed: 0,
    pulled: 1,
    conflicts: issues ? [{ localId: "local", remoteId: "remote", message: "conflict", remote: null }] : [],
    itemErrors: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

class FakeScheduler {
  private sequence = 0;
  readonly tasks = new Map<number, () => void>();

  setTimeout = (task: () => void) => {
    const id = ++this.sequence;
    this.tasks.set(id, task);
    return id as unknown as ReturnType<typeof setTimeout>;
  };

  clearTimeout = (handle: ReturnType<typeof setTimeout>) => {
    this.tasks.delete(handle as unknown as number);
  };

  runNext() {
    const next = this.tasks.entries().next().value as [number, () => void] | undefined;
    if (!next) return false;
    this.tasks.delete(next[0]);
    next[1]();
    return true;
  }
}

function setup(options: {
  run?: (owner: string, call: number) => Promise<SongSyncRunResult>;
  pending?: number;
  transientError?: (error: unknown) => boolean;
} = {}) {
  const scheduler = new FakeScheduler();
  const ownerSession = new SongSyncOwnerSession();
  let apiOwner: string | null = null;
  let calls = 0;
  const owners: string[] = [];
  const engine = {
    async sync(owner: string) {
      calls += 1;
      owners.push(owner);
      return options.run ? options.run(owner, calls) : result(owner);
    },
  };
  const coordinator = new AutomaticSongSyncCoordinator({
    engine,
    ownerSession,
    isApiSessionOwner: (owner) => apiOwner === owner,
    previewReader: { async getPreview() { return { ...EMPTY_PREVIEW, pendingTotal: options.pending ?? 0 }; } },
    scheduler,
    debounceMs: 1,
    retryDelays: [1, 2, 3],
    transientError: options.transientError,
  });
  return {
    coordinator,
    scheduler,
    get calls() { return calls; },
    owners,
    authenticate(owner: string | null) { apiOwner = owner; coordinator.setOwner(owner); },
    setApiOwner(owner: string | null) { apiOwner = owner; },
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("login or restored session performs a pull even without local pending changes", async () => {
  const subject = setup();
  subject.authenticate(OWNER_1);
  subject.scheduler.runNext();
  await flush();
  assert.equal(subject.calls, 1);
  assert.deepEqual(subject.owners, [OWNER_1]);
  assert.deepEqual(subject.coordinator.getState(), { status: "idle" });
});

test("guest mutations and anonymous songs never start automatic sync", async () => {
  const subject = setup({ pending: 4 });
  subject.coordinator.requestSync("local-change");
  subject.coordinator.setConnected(false);
  subject.coordinator.setConnected(true);
  await flush();
  assert.equal(subject.calls, 0);
});

test("nearby local mutations are debounced into one synchronization", async () => {
  const subject = setup();
  subject.authenticate(OWNER_1);
  subject.scheduler.runNext();
  await flush();
  subject.coordinator.requestSync("local-change");
  subject.coordinator.requestSync("local-change");
  subject.coordinator.requestSync("local-change");
  assert.equal(subject.scheduler.tasks.size, 1);
  subject.scheduler.runNext();
  await flush();
  assert.equal(subject.calls, 2);
});

test("a mutation during an active run schedules at most one follow-up", async () => {
  const first = deferred<SongSyncRunResult>();
  const subject = setup({ run: (owner, call) => call === 1 ? first.promise : Promise.resolve(result(owner)) });
  subject.authenticate(OWNER_1);
  subject.scheduler.runNext();
  await flush();
  subject.coordinator.requestSync("local-change");
  subject.coordinator.requestSync("foreground", true);
  first.resolve(result(OWNER_1));
  await flush();
  assert.equal(subject.scheduler.tasks.size, 1);
  subject.scheduler.runNext();
  await flush();
  assert.equal(subject.calls, 2);
});

test("connectivity recovery triggers sync but going offline does not", async () => {
  const subject = setup({ pending: 1 });
  subject.authenticate(OWNER_1);
  subject.scheduler.runNext();
  await flush();
  subject.coordinator.setConnected(false);
  await flush();
  assert.deepEqual(subject.coordinator.getState(), { status: "offline", pending: 1 });
  subject.coordinator.setConnected(true);
  subject.scheduler.runNext();
  await flush();
  assert.equal(subject.calls, 2);
});

test("a positive connectivity event retries sync even when the offline event was missed", async () => {
  const subject = setup({ pending: 1 });
  subject.authenticate(OWNER_1);
  subject.scheduler.runNext();
  await flush();

  subject.coordinator.setConnected(true);
  assert.equal(subject.scheduler.tasks.size, 1);
  subject.scheduler.runNext();
  await flush();
  assert.equal(subject.calls, 2);
});

test("DEV preview refreshes when an automatic synchronization finishes", () => {
  assert.equal(shouldRefreshSyncPreview("idle", "syncing"), false);
  assert.equal(shouldRefreshSyncPreview("syncing", "idle"), true);
  assert.equal(shouldRefreshSyncPreview("syncing", "pending"), true);
  assert.equal(shouldRefreshSyncPreview("pending", "pending"), false);
});

test("foreground and explicit ownership linking request an immediate sync", async () => {
  const subject = setup();
  subject.authenticate(OWNER_1);
  subject.scheduler.runNext();
  await flush();
  subject.coordinator.requestSync("foreground", true);
  subject.scheduler.runNext();
  await flush();
  subject.coordinator.requestSync("ownership-linked", true);
  subject.scheduler.runNext();
  await flush();
  assert.equal(subject.calls, 3);
});

test("library focus requests an immediate pull and shares the active run", async () => {
  const active = deferred<SongSyncRunResult>();
  const subject = setup({ run: (owner, call) => call === 1 ? active.promise : Promise.resolve(result(owner)) });
  subject.authenticate(OWNER_1);
  subject.scheduler.runNext();
  await flush();

  subject.coordinator.requestSync("library-focus", true);
  subject.coordinator.requestSync("library-focus", true);
  assert.equal(subject.calls, 1);

  active.resolve(result(OWNER_1));
  await flush();
  assert.equal(subject.scheduler.tasks.size, 1);
  subject.scheduler.runNext();
  await flush();
  assert.equal(subject.calls, 2);
});

test("API error classification retries only network, timeout, throttling and server failures", () => {
  assert.equal(isTransientApiError(new TypeError("Network request failed")), true);
  assert.equal(isTransientApiError(new ApiRequestError("timeout", { status: 408, retryable: true })), true);
  assert.equal(isTransientApiError(new ApiRequestError("throttled", { status: 429, retryable: true })), true);
  assert.equal(isTransientApiError(new ApiRequestError("server", { status: 503, retryable: true })), true);
  assert.equal(isTransientApiError(new ApiRequestError("invalid", { status: 400 })), false);
  assert.equal(isTransientApiError(new ApiRequestError("SESSION_EXPIRED", { code: "SESSION_EXPIRED" })), false);
});

test("transient failures retry with a finite budget", async () => {
  const subject = setup({
    run: async () => { throw new Error("network down"); },
    pending: 1,
    transientError: () => true,
  });
  subject.authenticate(OWNER_1);
  for (let index = 0; index < 4; index += 1) {
    assert.equal(subject.scheduler.runNext(), true);
    await flush();
  }
  assert.equal(subject.calls, 4);
  assert.equal(subject.scheduler.tasks.size, 0);
  assert.deepEqual(subject.coordinator.getState(), { status: "error", pending: 1 });
});

test("permanent failures and conflicts do not start retry loops", async () => {
  const permanent = setup({ run: async () => { throw new Error("invalid"); }, transientError: () => false });
  permanent.authenticate(OWNER_1);
  permanent.scheduler.runNext();
  await flush();
  assert.equal(permanent.scheduler.tasks.size, 0);

  const conflict = setup({ run: async (owner) => result(owner, true), pending: 1 });
  conflict.authenticate(OWNER_1);
  conflict.scheduler.runNext();
  await flush();
  assert.equal(conflict.scheduler.tasks.size, 0);
  assert.deepEqual(conflict.coordinator.getState(), { status: "attention", pending: 1 });
});

test("logout and account switch invalidate the previous run and never apply it as the new owner", async () => {
  const oldRun = deferred<SongSyncRunResult>();
  const subject = setup({ run: (owner, call) => call === 1 ? oldRun.promise : Promise.resolve(result(owner)) });
  subject.authenticate(OWNER_1);
  subject.scheduler.runNext();
  await flush();
  subject.setApiOwner(OWNER_2);
  subject.coordinator.setOwner(OWNER_2);
  oldRun.resolve(result(OWNER_1));
  await flush();
  assert.deepEqual(subject.coordinator.getState(), { status: "idle" });
  subject.scheduler.runNext();
  await flush();
  assert.deepEqual(subject.owners, [OWNER_1, OWNER_2]);
  await assert.rejects(() => subject.coordinator.sync(OWNER_1), SongSyncSessionChangedError);
  subject.setApiOwner(null);
  subject.coordinator.setOwner(null);
  subject.coordinator.requestSync("foreground", true);
  assert.equal(subject.scheduler.tasks.size, 0);
});

test("manual and automatic requests share the same active run", async () => {
  const pending = deferred<SongSyncRunResult>();
  const subject = setup({ run: () => pending.promise });
  subject.authenticate(OWNER_1);
  subject.scheduler.runNext();
  await flush();
  const manual = subject.coordinator.sync(OWNER_1);
  assert.equal(subject.calls, 1);
  pending.resolve(result(OWNER_1));
  assert.equal((await manual).ownerUserId, OWNER_1);
});

test("repository decorator notifies only after successful local mutations", async () => {
  let notifications = 0;
  const song: SongDetail = {
    id: "local_1", title: "Song", artist: null, key: null, versionName: null,
    content: "C", notes: null, updatedAt: "2026-11-13T10:00:00.000Z",
  };
  const values: SongFormValues = { title: "Song", artist: "", key: "", versionName: "", content: "C", notes: "" };
  let failUpdate = false;
  const base: SongRepository = {
    async listSongs() { return []; },
    async getSong() { return song; },
    async createSong() { return song; },
    async updateSong() { if (failUpdate) throw new Error("local failure"); return song; },
    async deleteSong() {},
    async listVersions() { return []; },
    async createVersion() { return song; },
  };
  const repository = createAutoSyncSongRepository(base, () => { notifications += 1; });
  await repository.createSong(values);
  await repository.updateSong(song.id, values);
  await repository.createVersion(song.id, values);
  await repository.deleteSong(song.id);
  assert.equal(notifications, 4);
  failUpdate = true;
  await assert.rejects(() => repository.updateSong(song.id, values));
  assert.equal(notifications, 4);
});
