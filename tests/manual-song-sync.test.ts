import assert from "node:assert/strict";
import test from "node:test";
import {
  createManualSongSyncController,
  isSafeDevelopmentApiUrl,
  ManualSongSyncUnavailableError,
  shouldShowManualSongSyncControl,
  type SongSyncRunner,
} from "../mobile/src/data/songs/sync/ManualSongSyncController.ts";
import type { SongSyncRunResult } from "../mobile/src/data/songs/sync/types.ts";

const LOCAL_API = "http://192.168.1.61:3000";
const EMPTY_PREVIEW = {
  pendingTotal: 0,
  newCount: 0,
  changedCount: 0,
  deletedCount: 0,
  errorCount: 0,
  versionCount: 0,
  anonymousExcludedCount: 0,
};
const previewReader = {
  async getPreview() {
    return EMPTY_PREVIEW;
  },
};

function result(ownerUserId: string): SongSyncRunResult {
  return {
    ownerUserId,
    startedAt: "2026-11-12T10:00:00.000Z",
    completedAt: "2026-11-12T10:00:01.000Z",
    pushed: 1,
    pulled: 2,
    conflicts: [],
    itemErrors: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

test("manual sync control is available only in development with a private API URL", () => {
  assert.equal(isSafeDevelopmentApiUrl(LOCAL_API), true);
  assert.equal(isSafeDevelopmentApiUrl("http://localhost:3000"), true);
  assert.equal(isSafeDevelopmentApiUrl("https://www.lyricord.com.ar"), false);
  assert.equal(shouldShowManualSongSyncControl(true, LOCAL_API), true);
  assert.equal(shouldShowManualSongSyncControl(false, LOCAL_API), false);
  assert.equal(shouldShowManualSongSyncControl(true, "https://www.lyricord.com.ar"), false);
});

test("manual sync rejects unauthenticated execution without calling the engine", async () => {
  let calls = 0;
  const engine: SongSyncRunner = {
    async sync(ownerUserId) {
      calls += 1;
      return result(ownerUserId);
    },
  };
  const controller = createManualSongSyncController({ engine, previewReader, apiUrl: LOCAL_API, isDevelopment: true });

  await assert.rejects(() => controller.run(null), ManualSongSyncUnavailableError);
  assert.equal(calls, 0);
});

test("manual sync passes only the authenticated account id", async () => {
  const owners: string[] = [];
  const engine: SongSyncRunner = {
    async sync(ownerUserId) {
      owners.push(ownerUserId);
      return result(ownerUserId);
    },
  };
  const controller = createManualSongSyncController({ engine, previewReader, apiUrl: LOCAL_API, isDevelopment: true });

  assert.equal((await controller.run(" user_1 ")).ownerUserId, "user_1");
  assert.equal((await controller.run("user_2")).ownerUserId, "user_2");
  assert.deepEqual(owners, ["user_1", "user_2"]);
});

test("manual sync coalesces simultaneous executions", async () => {
  const pending = deferred<SongSyncRunResult>();
  let calls = 0;
  const engine: SongSyncRunner = {
    sync() {
      calls += 1;
      return pending.promise;
    },
  };
  const controller = createManualSongSyncController({ engine, previewReader, apiUrl: LOCAL_API, isDevelopment: true });

  const first = controller.run("user_1");
  const second = controller.run("user_1");
  assert.equal(first, second);
  assert.equal(calls, 1);
  await assert.rejects(() => controller.run("user_2"), ManualSongSyncUnavailableError);
  assert.equal(calls, 1);

  pending.resolve(result("user_1"));
  await first;
  assert.equal(controller.isRunning(), false);
});

test("manual sync keeps retry available after a network failure", async () => {
  let calls = 0;
  const engine: SongSyncRunner = {
    async sync(ownerUserId) {
      calls += 1;
      if (calls === 1) throw new Error("network unavailable");
      return result(ownerUserId);
    },
  };
  const controller = createManualSongSyncController({ engine, previewReader, apiUrl: LOCAL_API, isDevelopment: true });

  await assert.rejects(() => controller.run("user_1"), /network unavailable/);
  assert.equal(controller.isRunning(), false);
  assert.equal((await controller.run("user_1")).ownerUserId, "user_1");
  assert.equal(calls, 2);
});

test("production and unsafe endpoints reject execution even with a user", async () => {
  let calls = 0;
  const engine: SongSyncRunner = {
    async sync(ownerUserId) {
      calls += 1;
      return result(ownerUserId);
    },
  };

  const production = createManualSongSyncController({ engine, previewReader, apiUrl: LOCAL_API, isDevelopment: false });
  const unsafe = createManualSongSyncController({ engine, previewReader, apiUrl: "https://www.lyricord.com.ar", isDevelopment: true });
  await assert.rejects(() => production.run("user_1"), ManualSongSyncUnavailableError);
  await assert.rejects(() => unsafe.run("user_1"), ManualSongSyncUnavailableError);
  assert.equal(calls, 0);
});

test("local preview reads only for the authenticated owner and never runs sync", async () => {
  const previewOwners: string[] = [];
  let syncCalls = 0;
  const engine: SongSyncRunner = {
    async sync(ownerUserId) {
      syncCalls += 1;
      return result(ownerUserId);
    },
  };
  const reader = {
    async getPreview(ownerUserId: string) {
      previewOwners.push(ownerUserId);
      return { ...EMPTY_PREVIEW, pendingTotal: 2 };
    },
  };
  const controller = createManualSongSyncController({
    engine,
    previewReader: reader,
    apiUrl: LOCAL_API,
    isDevelopment: true,
  });

  assert.equal((await controller.preview(" user_1 ")).pendingTotal, 2);
  await assert.rejects(() => controller.preview(null), ManualSongSyncUnavailableError);
  assert.deepEqual(previewOwners, ["user_1"]);
  assert.equal(syncCalls, 0);
});

test("local preview is unavailable in production or with an unsafe endpoint", async () => {
  const engine: SongSyncRunner = { async sync(ownerUserId) { return result(ownerUserId); } };
  let reads = 0;
  const reader = {
    async getPreview() {
      reads += 1;
      return EMPTY_PREVIEW;
    },
  };
  const production = createManualSongSyncController({ engine, previewReader: reader, apiUrl: LOCAL_API, isDevelopment: false });
  const unsafe = createManualSongSyncController({
    engine,
    previewReader: reader,
    apiUrl: "https://www.lyricord.com.ar",
    isDevelopment: true,
  });

  await assert.rejects(() => production.preview("user_1"), ManualSongSyncUnavailableError);
  await assert.rejects(() => unsafe.preview("user_1"), ManualSongSyncUnavailableError);
  assert.equal(reads, 0);
});
