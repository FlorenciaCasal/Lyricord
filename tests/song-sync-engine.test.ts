import assert from "node:assert/strict";
import test from "node:test";
import { SongSyncEngine } from "../mobile/src/data/songs/sync/SongSyncEngine.ts";
import type {
  ApplyRemoteSongResult,
  LocalSongSyncRecord,
  RemoteSongSyncRecord,
  SongSyncApi,
  SongSyncPushChange,
  SongSyncPushOperation,
  SongSyncPushResult,
  SongSyncStore,
} from "../mobile/src/data/songs/sync/types.ts";

const OWNER_1 = "user_1";
const OWNER_2 = "user_2";
const BASE_TIME = "2026-10-08T10:00:00.000Z";

function localSong(values: Partial<LocalSongSyncRecord> & Pick<LocalSongSyncRecord, "id" | "title" | "content">) {
  return {
    remoteId: null,
    versionGroupId: values.id,
    ownerUserId: OWNER_1,
    remoteVersionGroupId: null,
    syncStatus: "local_only" as const,
    syncError: null,
    lastSyncedAt: null,
    remoteUpdatedAt: null,
    lastSyncedHash: null,
    deletedAt: null,
    artist: null,
    key: null,
    notes: null,
    versionName: "Principal",
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    ...values,
  } satisfies LocalSongSyncRecord;
}

function remoteSong(values: Partial<RemoteSongSyncRecord> & Pick<RemoteSongSyncRecord, "id" | "title" | "content">) {
  return {
    clientId: null,
    artist: null,
    key: null,
    versionName: "Principal",
    versionGroupId: null,
    notes: null,
    deletedAt: null,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    ...values,
  } satisfies RemoteSongSyncRecord;
}

function sameContent(local: LocalSongSyncRecord, remote: RemoteSongSyncRecord) {
  return (
    local.title === remote.title &&
    local.artist === remote.artist &&
    local.key === remote.key &&
    local.versionName === remote.versionName &&
    local.content === remote.content &&
    local.notes === remote.notes &&
    local.deletedAt === remote.deletedAt
  );
}

class InMemorySyncStore implements SongSyncStore {
  readonly rows = new Map<string, LocalSongSyncRecord>();
  private downloadSequence = 0;
  private recoverySequence = 0;

  constructor(rows: LocalSongSyncRecord[] = []) {
    for (const row of rows) this.rows.set(row.id, { ...row });
  }

  async listPending(ownerUserId: string) {
    return Array.from(this.rows.values())
      .filter(
        (row) =>
          row.ownerUserId === ownerUserId &&
          ["local_only", "dirty", "deleted", "error"].includes(row.syncStatus),
      )
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.id.localeCompare(right.id))
      .map((row) => ({ ...row }));
  }

  async findByLocalId(ownerUserId: string, localId: string) {
    const row = this.rows.get(localId);
    return row?.ownerUserId === ownerUserId ? { ...row } : null;
  }

  async findByRemoteId(ownerUserId: string, remoteId: string) {
    const row = Array.from(this.rows.values()).find(
      (candidate) => candidate.ownerUserId === ownerUserId && candidate.remoteId === remoteId,
    );
    return row ? { ...row } : null;
  }

  async listVersionGroup(ownerUserId: string, principalLocalId: string) {
    return Array.from(this.rows.values())
      .filter((row) => row.ownerUserId === ownerUserId && row.versionGroupId === principalLocalId)
      .map((row) => ({ ...row }));
  }

  async acknowledgePush(
    ownerUserId: string,
    localId: string,
    expectedLocalUpdatedAt: string,
    remote: RemoteSongSyncRecord,
    syncedAt: string,
  ) {
    const row = this.rows.get(localId);
    if (!row || row.ownerUserId !== ownerUserId) return;
    if (row.updatedAt !== expectedLocalUpdatedAt) {
      this.rows.set(localId, {
        ...row,
        remoteId: remote.id,
        remoteVersionGroupId: remote.versionGroupId,
        remoteUpdatedAt: remote.updatedAt,
        lastSyncedAt: syncedAt,
        syncStatus: "dirty",
        syncError: null,
      });
      return;
    }
    this.rows.set(localId, {
      ...row,
      remoteId: remote.id,
      remoteVersionGroupId: remote.versionGroupId,
      remoteUpdatedAt: remote.updatedAt,
      lastSyncedAt: syncedAt,
      syncStatus: "synced",
      syncError: null,
      deletedAt: remote.deletedAt,
      title: remote.title,
      artist: remote.artist,
      key: remote.key,
      versionName: remote.versionName,
      content: remote.content,
      notes: remote.notes,
      updatedAt: remote.updatedAt,
    });
  }

  async markConflict(ownerUserId: string, localId: string, message: string) {
    const row = this.rows.get(localId);
    if (row?.ownerUserId === ownerUserId) this.rows.set(localId, { ...row, syncStatus: "conflict", syncError: message });
  }

  async markError(ownerUserId: string, localId: string, message: string) {
    const row = this.rows.get(localId);
    if (row?.ownerUserId === ownerUserId) this.rows.set(localId, { ...row, syncStatus: "error", syncError: message });
  }

  async acknowledgeGroupDeletion(
    ownerUserId: string,
    expectedLocals: Array<{ id: string; updatedAt: string; remoteId: string }>,
    remotes: RemoteSongSyncRecord[],
    syncedAt: string,
  ) {
    const remoteById = new Map(remotes.map((remote) => [remote.id, remote]));
    for (const expected of expectedLocals) {
      const local = this.rows.get(expected.id);
      const remote = remoteById.get(expected.remoteId);
      if (!local || local.ownerUserId !== ownerUserId || local.updatedAt !== expected.updatedAt || !remote?.deletedAt) {
        throw new Error("GROUP_ACK_CONFLICT");
      }
    }
    for (const expected of expectedLocals) {
      await this.acknowledgePush(ownerUserId, expected.id, expected.updatedAt, remoteById.get(expected.remoteId)!, syncedAt);
    }
  }

  async markGroupConflict(ownerUserId: string, localIds: string[], message: string) {
    for (const localId of localIds) await this.markConflict(ownerUserId, localId, message);
  }

  async recordRemoteDeletionConflict(
    ownerUserId: string,
    localId: string,
    expectedLocalUpdatedAt: string,
    remote: RemoteSongSyncRecord,
  ) {
    const row = this.rows.get(localId);
    if (!row || row.ownerUserId !== ownerUserId || row.updatedAt !== expectedLocalUpdatedAt || !remote.deletedAt) return false;
    await this.markConflict(ownerUserId, localId, "Esta canción ya fue eliminada desde otro dispositivo.");
    return true;
  }

  async recordLocalDeletionConflict(
    ownerUserId: string,
    localIds: string[],
    _principalLocalId: string,
    remotes: RemoteSongSyncRecord[],
  ) {
    if (remotes.length === 0 || remotes.some((remote) => remote.deletedAt !== null)) return false;
    for (const localId of localIds) {
      const row = this.rows.get(localId);
      if (!row || row.ownerUserId !== ownerUserId || row.deletedAt === null) return false;
    }
    await this.markGroupConflict(ownerUserId, localIds, "La canción cambió antes de eliminarse.");
    return true;
  }

  async recoverEditConflict(
    ownerUserId: string,
    localId: string,
    expectedLocalUpdatedAt: string,
    remote: RemoteSongSyncRecord,
    syncedAt: string,
  ) {
    const local = this.rows.get(localId);
    if (
      !local ||
      local.ownerUserId !== ownerUserId ||
      local.updatedAt !== expectedLocalUpdatedAt ||
      (local.remoteId !== null && local.remoteId !== remote.id) ||
      (local.remoteId === null && remote.clientId !== local.id) ||
      local.deletedAt !== null ||
      remote.deletedAt !== null
    ) {
      return "conflict" as const;
    }

    const isPrincipal = local.versionGroupId === local.id;
    const principal = isPrincipal ? local : this.rows.get(local.versionGroupId);
    if (!principal || principal.ownerUserId !== ownerUserId || principal.deletedAt !== null) return "conflict" as const;
    if (
      (isPrincipal && remote.versionGroupId !== null) ||
      (!isPrincipal && (!principal.remoteId || remote.versionGroupId !== principal.remoteId))
    ) {
      return "conflict" as const;
    }

    const remoteState = {
      ...local,
      remoteId: remote.id,
      remoteVersionGroupId: remote.versionGroupId,
      syncStatus: "synced" as const,
      syncError: null,
      lastSyncedAt: syncedAt,
      remoteUpdatedAt: remote.updatedAt,
      deletedAt: remote.deletedAt,
      title: remote.title,
      artist: remote.artist,
      key: remote.key,
      versionName: remote.versionName,
      content: remote.content,
      notes: remote.notes,
      updatedAt: remote.updatedAt,
    };
    if (sameContent(local, remote)) {
      this.rows.set(local.id, remoteState);
      return "unchanged" as const;
    }

    const recoveredId = `recovered_${++this.recoverySequence}`;
    this.rows.set(recoveredId, {
      ...local,
      id: recoveredId,
      remoteId: null,
      versionGroupId: principal.id,
      remoteVersionGroupId: isPrincipal ? remote.id : remote.versionGroupId,
      syncStatus: "local_only",
      syncError: null,
      lastSyncedAt: null,
      remoteUpdatedAt: null,
      lastSyncedHash: null,
      versionName: isPrincipal
        ? "Copia recuperada"
        : local.versionName && local.versionName !== "Principal"
          ? `${local.versionName} (copia recuperada)`
          : "Copia recuperada",
      createdAt: syncedAt,
      updatedAt: syncedAt,
    });
    this.rows.set(local.id, remoteState);
    return "recovered" as const;
  }

  async applyRemote(
    ownerUserId: string,
    remote: RemoteSongSyncRecord,
    syncedAt: string,
  ): Promise<ApplyRemoteSongResult> {
    const existing =
      (await this.findByRemoteId(ownerUserId, remote.id)) ??
      (remote.clientId ? await this.findByLocalId(ownerUserId, remote.clientId) : null);

    if (!existing) {
      let id = remote.clientId ?? `download_${++this.downloadSequence}`;
      while (this.rows.has(id)) id = `download_${++this.downloadSequence}`;
      this.rows.set(id, localSong({
        id,
        remoteId: remote.id,
        ownerUserId,
        remoteVersionGroupId: remote.versionGroupId,
        syncStatus: "synced",
        title: remote.title,
        artist: remote.artist,
        key: remote.key,
        versionName: remote.versionName,
        content: remote.content,
        notes: remote.notes,
        deletedAt: remote.deletedAt,
        createdAt: remote.createdAt,
        updatedAt: remote.updatedAt,
        remoteUpdatedAt: remote.updatedAt,
        lastSyncedAt: syncedAt,
      }));
      return "inserted";
    }

    if (existing.syncStatus === "synced") {
      if (existing.remoteUpdatedAt === remote.updatedAt && sameContent(existing, remote)) return "unchanged";
      this.rows.set(existing.id, {
        ...existing,
        remoteId: remote.id,
        remoteVersionGroupId: remote.versionGroupId,
        syncStatus: "synced",
        syncError: null,
        lastSyncedAt: syncedAt,
        remoteUpdatedAt: remote.updatedAt,
        deletedAt: remote.deletedAt,
        title: remote.title,
        artist: remote.artist,
        key: remote.key,
        versionName: remote.versionName,
        content: remote.content,
        notes: remote.notes,
        updatedAt: remote.updatedAt,
      });
      return "updated";
    }

    if (existing.syncStatus === "local_only" && !existing.remoteId && sameContent(existing, remote)) {
      await this.acknowledgePush(ownerUserId, existing.id, existing.updatedAt, remote, syncedAt);
      return "updated";
    }

    if (["dirty", "deleted", "error", "local_only"].includes(existing.syncStatus) && existing.remoteUpdatedAt === remote.updatedAt) {
      return "unchanged";
    }

    const recovery = await this.recoverEditConflict(
      ownerUserId,
      existing.id,
      existing.updatedAt,
      remote,
      syncedAt,
    );
    if (recovery !== "conflict") return recovery;
    await this.markConflict(ownerUserId, existing.id, "La canción tiene cambios locales y remotos.");
    return "conflict";
  }

  async reconcileVersionGroups(ownerUserId: string) {
    for (const row of this.rows.values()) {
      if (row.ownerUserId !== ownerUserId || !row.remoteVersionGroupId) continue;
      const principal = Array.from(this.rows.values()).find(
        (candidate) => candidate.ownerUserId === ownerUserId && candidate.remoteId === row.remoteVersionGroupId,
      );
      if (principal) this.rows.set(row.id, { ...row, versionGroupId: principal.id });
    }
  }
}

class InMemorySyncApi implements SongSyncApi {
  readonly songs = new Map<string, RemoteSongSyncRecord>();
  readonly pushedClientIds: string[] = [];
  pushCalls = 0;
  pullCalls = 0;
  groupDeleteCalls = 0;
  failAfterApplyingPushes = 0;
  private sequence = 0;

  constructor(songs: RemoteSongSyncRecord[] = []) {
    for (const song of songs) this.songs.set(song.id, { ...song });
  }

  async pull() {
    this.pullCalls += 1;
    return {
      songs: Array.from(this.songs.values()).map((song) => ({ ...song })),
      serverTime: this.nextTime(),
      nextCursor: null,
    };
  }

  async push(changes: SongSyncPushOperation[]) {
    this.pushCalls += 1;
    const results = changes.map((change) => "operation" in change
      ? this.applyGroupDeletion(change)
      : this.applyChange(change));
    if (this.failAfterApplyingPushes > 0) {
      this.failAfterApplyingPushes -= 1;
      throw new Error("NETWORK_LOST_AFTER_PUSH");
    }
    return { results, serverTime: this.nextTime() };
  }

  editRemote(id: string, values: Partial<RemoteSongSyncRecord>) {
    const current = this.songs.get(id);
    if (!current) throw new Error(`Missing remote song ${id}`);
    this.songs.set(id, { ...current, ...values, updatedAt: values.updatedAt ?? this.nextTime() });
  }

  private applyChange(change: SongSyncPushChange): SongSyncPushResult {
    this.pushedClientIds.push(change.clientId);
    const existing =
      (change.id ? this.songs.get(change.id) : null) ??
      Array.from(this.songs.values()).find((song) => song.clientId === change.clientId);

    if (existing) {
      if (change.deletedAt) {
        if (existing.deletedAt) return { clientId: existing.clientId, id: existing.id, status: "unchanged", song: { ...existing } };
        if (change.baseUpdatedAt && change.baseUpdatedAt !== existing.updatedAt) return this.conflict(change, existing);
        const deleted = { ...existing, deletedAt: change.deletedAt, updatedAt: this.nextTime() };
        this.songs.set(deleted.id, deleted);
        return { clientId: deleted.clientId, id: deleted.id, status: "deleted", song: { ...deleted } };
      }
      if (!change.baseUpdatedAt) {
        if (this.sameChange(existing, change)) {
          return { clientId: existing.clientId, id: existing.id, status: "unchanged", song: { ...existing } };
        }
        return this.conflict(change, existing);
      }
      if (change.baseUpdatedAt !== existing.updatedAt) return this.conflict(change, existing);
      const updated = this.fromChange(existing.id, existing.createdAt, change, existing.clientId ?? change.clientId);
      this.songs.set(updated.id, updated);
      return { clientId: updated.clientId, id: updated.id, status: "updated", song: { ...updated } };
    }

    if (change.id) {
      return { clientId: change.clientId, id: change.id, status: "error", error: { code: "NOT_FOUND", message: "Not found" } };
    }

    const id = `remote_${++this.sequence}`;
    const created = this.fromChange(id, this.nextTime(), change, change.clientId);
    this.songs.set(id, created);
    return { clientId: created.clientId, id, status: "created", song: { ...created } };
  }

  private applyGroupDeletion(change: Extract<SongSyncPushOperation, { operation: "deleteGroup" }>): SongSyncPushResult {
    this.groupDeleteCalls += 1;
    const rows = Array.from(this.songs.values()).filter(
      (song) => song.id === change.principalId || song.versionGroupId === change.principalId,
    );
    const memberById = new Map(change.members.map((member) => [member.id, member]));
    const active = rows.filter((song) => !song.deletedAt);
    const invalid =
      !rows.some((song) => song.id === change.principalId) ||
      active.some((song) => !memberById.has(song.id)) ||
      active.some((song) => song.updatedAt !== memberById.get(song.id)?.baseUpdatedAt);
    if (invalid) {
      return {
        clientId: change.principalClientId,
        id: change.principalId,
        status: "conflict",
        songs: rows.map((song) => ({ ...song })),
        error: { code: "CONFLICT", message: "Group changed" },
      };
    }
    if (active.length === 0) {
      return {
        clientId: change.principalClientId,
        id: change.principalId,
        status: "unchanged",
        songs: rows.map((song) => ({ ...song })),
      };
    }
    const deletedAt = change.deletedAt;
    const deleted = rows.map((song) => {
      if (song.deletedAt) return song;
      const next = { ...song, deletedAt, updatedAt: this.nextTime() };
      this.songs.set(next.id, next);
      return next;
    });
    return {
      clientId: change.principalClientId,
      id: change.principalId,
      status: "deleted",
      songs: deleted.map((song) => ({ ...song })),
    };
  }

  private fromChange(id: string, createdAt: string, change: SongSyncPushChange, clientId: string) {
    const group = change.versionGroupId ?? (change.versionGroupClientId
      ? Array.from(this.songs.values()).find((song) => song.clientId === change.versionGroupClientId)?.id ?? null
      : null);
    return remoteSong({
      id,
      clientId,
      title: change.title,
      artist: change.artist,
      key: change.key,
      versionName: change.versionName,
      versionGroupId: group,
      content: change.content,
      notes: change.notes,
      deletedAt: change.deletedAt,
      createdAt,
      updatedAt: this.nextTime(),
    });
  }

  private conflict(change: SongSyncPushChange, existing: RemoteSongSyncRecord): SongSyncPushResult {
    return {
      clientId: change.clientId,
      id: existing.id,
      status: "conflict",
      song: { ...existing },
      error: { code: "CONFLICT", message: "Remote changed" },
    };
  }

  private sameChange(existing: RemoteSongSyncRecord, change: SongSyncPushChange) {
    return (
      existing.title === change.title &&
      existing.artist === change.artist &&
      existing.key === change.key &&
      existing.versionName === change.versionName &&
      existing.content === change.content &&
      existing.notes === change.notes &&
      existing.deletedAt === change.deletedAt
    );
  }

  private nextTime() {
    this.sequence += 1;
    return new Date(Date.parse(BASE_TIME) + this.sequence * 1000).toISOString();
  }
}

function engine(api: SongSyncApi, store: SongSyncStore) {
  let tick = 0;
  return new SongSyncEngine({
    api,
    store,
    now: () => new Date(Date.parse(BASE_TIME) + ++tick * 100),
  });
}

test("SongSyncEngine creates remotely once and repeated sync stays idempotent", async () => {
  const store = new InMemorySyncStore([localSong({ id: "local_1", title: "Local", content: "C G" })]);
  const api = new InMemorySyncApi();
  const sync = engine(api, store);

  await sync.sync(OWNER_1);
  await sync.sync(OWNER_1);

  assert.equal(api.songs.size, 1);
  assert.equal(store.rows.size, 1);
  assert.equal(store.rows.get("local_1")?.syncStatus, "synced");
  assert.ok(store.rows.get("local_1")?.remoteId);
});

test("SongSyncEngine downloads web songs without duplicates", async () => {
  const remote = remoteSong({ id: "web_1", title: "Web", content: "D A", clientId: null });
  const store = new InMemorySyncStore();
  const api = new InMemorySyncApi([remote]);
  const sync = engine(api, store);

  await sync.sync(OWNER_1);
  await sync.sync(OWNER_1);

  assert.equal(store.rows.size, 1);
  assert.equal(Array.from(store.rows.values())[0].remoteId, "web_1");
});

test("SongSyncEngine safely retries when the first push response is lost", async () => {
  const store = new InMemorySyncStore([localSong({ id: "local_retry", title: "Retry", content: "E B" })]);
  const api = new InMemorySyncApi();
  api.failAfterApplyingPushes = 1;
  const sync = engine(api, store);

  await assert.rejects(() => sync.sync(OWNER_1), /NETWORK_LOST_AFTER_PUSH/);
  assert.equal(api.songs.size, 1);
  assert.equal(store.rows.get("local_retry")?.syncStatus, "local_only");

  await sync.sync(OWNER_1);
  assert.equal(api.songs.size, 1);
  assert.equal(store.rows.get("local_retry")?.syncStatus, "synced");
});

test("SongSyncEngine uploads local edits and downloads remote edits", async () => {
  const remote = remoteSong({ id: "remote_edit", clientId: "local_edit", title: "Song", content: "C", updatedAt: BASE_TIME });
  const local = localSong({
    id: "local_edit",
    remoteId: remote.id,
    remoteUpdatedAt: remote.updatedAt,
    syncStatus: "dirty",
    title: "Song",
    content: "C G",
  });
  const store = new InMemorySyncStore([local]);
  const api = new InMemorySyncApi([remote]);
  const sync = engine(api, store);

  await sync.sync(OWNER_1);
  assert.equal(api.songs.get("remote_edit")?.content, "C G");
  assert.equal(store.rows.get("local_edit")?.syncStatus, "synced");

  api.editRemote("remote_edit", { content: "F C" });
  await sync.sync(OWNER_1);
  assert.equal(store.rows.get("local_edit")?.content, "F C");
});

test("SongSyncEngine recovers a push conflict without overwriting either copy", async () => {
  const remote = remoteSong({ id: "remote_conflict", clientId: "local_conflict", title: "Song", content: "Remote", updatedAt: "2026-10-08T10:00:05.000Z" });
  const local = localSong({
    id: "local_conflict",
    remoteId: remote.id,
    remoteUpdatedAt: BASE_TIME,
    syncStatus: "dirty",
    title: "Song",
    content: "Local",
  });
  const store = new InMemorySyncStore([local]);
  const api = new InMemorySyncApi([remote]);

  const sync = engine(api, store);
  const result = await sync.sync(OWNER_1);

  assert.equal(store.rows.get("local_conflict")?.content, "Remote");
  assert.equal(store.rows.get("local_conflict")?.syncStatus, "synced");
  const recovered = Array.from(store.rows.values()).find((row) => row.content === "Local");
  assert.equal(recovered?.versionGroupId, "local_conflict");
  assert.equal(recovered?.versionName, "Copia recuperada");
  assert.equal(recovered?.syncStatus, "local_only");
  assert.equal(api.songs.get("remote_conflict")?.content, "Remote");
  assert.equal(result.conflicts.length, 0);

  await sync.sync(OWNER_1);
  await sync.sync(OWNER_1);
  assert.equal(api.songs.size, 2);
  assert.equal(Array.from(store.rows.values()).filter((row) => row.versionName === "Copia recuperada").length, 1);
});

test("SongSyncEngine recovers an existing pull conflict on the next sync", async () => {
  const remote = remoteSong({
    id: "remote_pull_conflict",
    clientId: "local_pull_conflict",
    title: "Song",
    content: "Remote pull",
    updatedAt: "2026-10-08T10:00:05.000Z",
  });
  const local = localSong({
    id: "local_pull_conflict",
    remoteId: remote.id,
    remoteUpdatedAt: BASE_TIME,
    syncStatus: "conflict",
    title: "Song",
    content: "Local pull",
  });
  const store = new InMemorySyncStore([local]);
  const api = new InMemorySyncApi([remote]);

  const result = await engine(api, store).sync(OWNER_1);

  assert.equal(result.conflicts.length, 0);
  assert.equal(store.rows.get(local.id)?.content, "Remote pull");
  assert.equal(store.rows.get(local.id)?.syncStatus, "synced");
  const recovered = Array.from(store.rows.values()).find((row) => row.content === "Local pull");
  assert.equal(recovered?.versionGroupId, local.id);
  assert.equal(recovered?.syncStatus, "local_only");
});

test("SongSyncEngine propagates local tombstones and remote tombstones", async () => {
  const firstRemote = remoteSong({ id: "remote_delete", clientId: "local_delete", title: "Delete", content: "G", updatedAt: BASE_TIME });
  const local = localSong({
    id: "local_delete",
    remoteId: firstRemote.id,
    remoteUpdatedAt: firstRemote.updatedAt,
    syncStatus: "deleted",
    deletedAt: "2026-10-08T10:01:00.000Z",
    title: "Delete",
    content: "G",
  });
  const store = new InMemorySyncStore([local]);
  const api = new InMemorySyncApi([firstRemote]);

  await engine(api, store).sync(OWNER_1);
  assert.ok(api.songs.get("remote_delete")?.deletedAt);
  assert.ok(store.rows.get("local_delete")?.deletedAt);
  assert.equal(store.rows.get("local_delete")?.syncStatus, "synced");

  api.songs.set("remote_only_delete", remoteSong({
    id: "remote_only_delete",
    title: "Deleted elsewhere",
    content: "A",
    deletedAt: "2026-10-08T10:02:00.000Z",
  }));
  await engine(api, store).sync(OWNER_1);
  const downloaded = Array.from(store.rows.values()).find((row) => row.remoteId === "remote_only_delete");
  assert.ok(downloaded?.deletedAt);
});

test("SongSyncEngine keeps edit-delete conflicts pending without recovered copies", async () => {
  const remotelyEdited = remoteSong({
    id: "remote_edit_vs_delete",
    clientId: "local_delete",
    title: "Delete conflict",
    content: "Remote edit",
    updatedAt: "2026-10-08T10:02:00.000Z",
  });
  const remotelyDeleted = remoteSong({
    id: "remote_delete_vs_edit",
    clientId: "local_edit",
    title: "Edit conflict",
    content: "Old remote",
    deletedAt: "2026-10-08T10:02:00.000Z",
    updatedAt: "2026-10-08T10:02:00.000Z",
  });
  const localDelete = localSong({
    id: "local_delete",
    remoteId: remotelyEdited.id,
    remoteUpdatedAt: BASE_TIME,
    syncStatus: "deleted",
    deletedAt: "2026-10-08T10:01:00.000Z",
    title: "Delete conflict",
    content: "Old local",
  });
  const localEdit = localSong({
    id: "local_edit",
    remoteId: remotelyDeleted.id,
    remoteUpdatedAt: BASE_TIME,
    syncStatus: "dirty",
    title: "Edit conflict",
    content: "Local edit",
  });
  const store = new InMemorySyncStore([localDelete, localEdit]);
  const api = new InMemorySyncApi([remotelyEdited, remotelyDeleted]);

  const result = await engine(api, store).sync(OWNER_1);

  assert.equal(store.rows.size, 2);
  assert.equal(store.rows.get(localDelete.id)?.syncStatus, "conflict");
  assert.equal(store.rows.get(localDelete.id)?.deletedAt, localDelete.deletedAt);
  assert.equal(store.rows.get(localEdit.id)?.syncStatus, "conflict");
  assert.equal(store.rows.get(localEdit.id)?.content, "Local edit");
  assert.ok(result.conflicts.length >= 2);
});

test("SongSyncEngine retries a deleted version group without duplicates or resurrection", async () => {
  const remotePrincipal = remoteSong({
    id: "remote_group_principal",
    clientId: "local_group_principal",
    title: "Grupo",
    content: "C",
  });
  const remoteVersion = remoteSong({
    id: "remote_group_version",
    clientId: "local_group_version",
    versionGroupId: remotePrincipal.id,
    versionName: "En D",
    title: "Grupo",
    content: "D",
  });
  const deletedAt = "2026-10-08T10:05:00.000Z";
  const principal = localSong({
    id: "local_group_principal",
    remoteId: remotePrincipal.id,
    remoteUpdatedAt: remotePrincipal.updatedAt,
    syncStatus: "deleted",
    deletedAt,
    title: "Grupo",
    content: "C",
  });
  const version = localSong({
    id: "local_group_version",
    remoteId: remoteVersion.id,
    versionGroupId: principal.id,
    remoteVersionGroupId: remotePrincipal.id,
    remoteUpdatedAt: remoteVersion.updatedAt,
    syncStatus: "deleted",
    deletedAt,
    versionName: "En D",
    title: "Grupo",
    content: "D",
  });
  const store = new InMemorySyncStore([principal, version]);
  const api = new InMemorySyncApi([remotePrincipal, remoteVersion]);
  const sync = engine(api, store);

  await sync.sync(OWNER_1);
  await sync.sync(OWNER_1);

  assert.equal(api.songs.size, 2);
  assert.equal(api.songs.get(remotePrincipal.id)?.deletedAt, deletedAt);
  assert.equal(api.songs.get(remoteVersion.id)?.deletedAt, deletedAt);
  assert.equal(store.rows.get(principal.id)?.syncStatus, "synced");
  assert.equal(store.rows.get(version.id)?.syncStatus, "synced");
  assert.equal(store.rows.get(principal.id)?.deletedAt, deletedAt);
  assert.equal(store.rows.get(version.id)?.deletedAt, deletedAt);
  assert.equal(api.groupDeleteCalls, 1);
  assert.deepEqual(api.pushedClientIds, []);
});

test("SongSyncEngine retries an atomic group deletion after the response is lost", async () => {
  const remotePrincipal = remoteSong({
    id: "remote_lost_group_principal",
    clientId: "local_lost_group_principal",
    title: "Grupo",
    content: "C",
  });
  const remoteVersion = remoteSong({
    id: "remote_lost_group_version",
    clientId: "local_lost_group_version",
    versionGroupId: remotePrincipal.id,
    versionName: "En D",
    title: "Grupo",
    content: "D",
  });
  const deletedAt = "2026-10-08T10:06:00.000Z";
  const principal = localSong({
    id: "local_lost_group_principal",
    remoteId: remotePrincipal.id,
    remoteUpdatedAt: remotePrincipal.updatedAt,
    syncStatus: "deleted",
    deletedAt,
    title: "Grupo",
    content: "C",
  });
  const version = localSong({
    id: "local_lost_group_version",
    remoteId: remoteVersion.id,
    versionGroupId: principal.id,
    remoteVersionGroupId: remotePrincipal.id,
    remoteUpdatedAt: remoteVersion.updatedAt,
    syncStatus: "deleted",
    deletedAt,
    versionName: "En D",
    title: "Grupo",
    content: "D",
  });
  const store = new InMemorySyncStore([principal, version]);
  const api = new InMemorySyncApi([remotePrincipal, remoteVersion]);
  api.failAfterApplyingPushes = 1;
  const sync = engine(api, store);

  await assert.rejects(() => sync.sync(OWNER_1), /NETWORK_LOST_AFTER_PUSH/);
  assert.equal(api.songs.get(remotePrincipal.id)?.deletedAt, deletedAt);
  assert.equal(api.songs.get(remoteVersion.id)?.deletedAt, deletedAt);
  assert.equal(store.rows.get(principal.id)?.syncStatus, "deleted");
  assert.equal(store.rows.get(version.id)?.syncStatus, "deleted");

  await sync.sync(OWNER_1);

  assert.equal(api.songs.size, 2);
  assert.equal(api.groupDeleteCalls, 2);
  assert.deepEqual(api.pushedClientIds, []);
  assert.equal(store.rows.get(principal.id)?.syncStatus, "synced");
  assert.equal(store.rows.get(version.id)?.syncStatus, "synced");
});

test("SongSyncEngine sends principals before versions and preserves groups", async () => {
  const principal = localSong({ id: "principal", title: "Song", content: "C", updatedAt: "2026-10-08T10:00:02.000Z" });
  const version = localSong({
    id: "version",
    versionGroupId: principal.id,
    versionName: "En D",
    title: "Song",
    content: "D",
    updatedAt: "2026-10-08T10:00:01.000Z",
  });
  const store = new InMemorySyncStore([version, principal]);
  const api = new InMemorySyncApi();

  await engine(api, store).sync(OWNER_1);

  assert.deepEqual(api.pushedClientIds.slice(0, 2), ["principal", "version"]);
  const remotePrincipal = Array.from(api.songs.values()).find((song) => song.clientId === "principal");
  const remoteVersion = Array.from(api.songs.values()).find((song) => song.clientId === "version");
  assert.equal(remoteVersion?.versionGroupId, remotePrincipal?.id);
  assert.equal(store.rows.get("version")?.versionGroupId, "principal");
});

test("SongSyncEngine isolates accounts and excludes anonymous songs", async () => {
  const ownerOne = localSong({ id: "owner_1", ownerUserId: OWNER_1, title: "One", content: "C" });
  const ownerTwo = localSong({ id: "owner_2", ownerUserId: OWNER_2, title: "Two", content: "D" });
  const anonymous = localSong({ id: "anonymous", ownerUserId: null, title: "Guest", content: "E" });
  const store = new InMemorySyncStore([ownerOne, ownerTwo, anonymous]);
  const api = new InMemorySyncApi();

  await engine(api, store).sync(OWNER_1);

  assert.deepEqual(api.pushedClientIds, ["owner_1"]);
  assert.equal(store.rows.get("owner_2")?.syncStatus, "local_only");
  assert.equal(store.rows.get("anonymous")?.syncStatus, "local_only");
  assert.equal(store.rows.get("anonymous")?.ownerUserId, null);
});

test("SongSyncEngine coalesces simultaneous runs for the same account", async () => {
  const store = new InMemorySyncStore([localSong({ id: "single", title: "Single", content: "F" })]);
  const api = new InMemorySyncApi();
  const sync = engine(api, store);

  const first = sync.sync(OWNER_1);
  const second = sync.sync(OWNER_1);

  assert.equal(first, second);
  await first;
  assert.equal(api.pushCalls, 1);
});

test("SongSyncEngine never applies a response after the authenticated owner changes", async () => {
  let resolvePull!: (value: Awaited<ReturnType<SongSyncApi["pull"]>>) => void;
  const pull = new Promise<Awaited<ReturnType<SongSyncApi["pull"]>>>((resolve) => { resolvePull = resolve; });
  let activeOwner = OWNER_1;
  const store = new InMemorySyncStore();
  const api: SongSyncApi = {
    async push() {
      throw new Error("push should not run");
    },
    async pull() {
      return pull;
    },
  };
  const sync = new SongSyncEngine({
    api,
    store,
    isOwnerActive: (owner) => owner === activeOwner,
  });

  const running = sync.sync(OWNER_1);
  await Promise.resolve();
  activeOwner = OWNER_2;
  resolvePull({
    songs: [remoteSong({ id: "remote_from_old_session", title: "Old", content: "C" })],
    nextCursor: null,
    serverTime: BASE_TIME,
  });

  await assert.rejects(running, /sesión cambió/i);
  assert.equal(store.rows.size, 0);
});
