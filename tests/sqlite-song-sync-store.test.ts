import assert from "node:assert/strict";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import test from "node:test";
import type {
  LocalSongDatabase,
  LocalSongDatabaseConnection,
} from "../mobile/src/data/songs/local/LocalSongDatabase.ts";
import {
  LOCAL_SONG_SCHEMA_V1,
  LOCAL_SONG_SCHEMA_V2,
  migrateLocalSongDatabase,
} from "../mobile/src/data/songs/local/migrations.ts";
import { LocalSongRepository } from "../mobile/src/data/songs/local/LocalSongRepository.ts";
import { SQLiteSongSyncStore } from "../mobile/src/data/songs/sync/SQLiteSongSyncStore.ts";
import type { RemoteSongSyncRecord } from "../mobile/src/data/songs/sync/types.ts";

const OWNER_1 = "user_1";
const OWNER_2 = "user_2";
const TIME = "2026-10-08T10:00:00.000Z";

class NodeLocalSongDatabase implements LocalSongDatabase {
  readonly sqlite = new DatabaseSync(":memory:");
  failRecoveryReplace = false;

  async execAsync(source: string) {
    this.sqlite.exec(source);
  }

  async runAsync(source: string, ...params: unknown[]) {
    if (this.failRecoveryReplace && /UPDATE local_songs[\s\S]*sync_status = 'synced'/i.test(source)) {
      throw new Error("SIMULATED_RECOVERY_REPLACE_FAILURE");
    }
    const result = this.sqlite.prepare(source).run(...params as SQLInputValue[]);
    return { changes: Number(result.changes) };
  }

  async getFirstAsync<T>(source: string, ...params: unknown[]) {
    return (this.sqlite.prepare(source).get(...params as SQLInputValue[]) as T | undefined) ?? null;
  }

  async getAllAsync<T>(source: string, ...params: unknown[]) {
    return this.sqlite.prepare(source).all(...params as SQLInputValue[]) as T[];
  }

  async transactionAsync<T>(task: (transaction: LocalSongDatabaseConnection) => Promise<T>) {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const result = await task(this);
      this.sqlite.exec("COMMIT");
      return result;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    this.sqlite.close();
  }
}

function remote(values: Partial<RemoteSongSyncRecord> & Pick<RemoteSongSyncRecord, "id" | "title" | "content">) {
  return {
    clientId: null,
    artist: null,
    key: null,
    versionName: "Principal",
    versionGroupId: null,
    notes: null,
    deletedAt: null,
    createdAt: TIME,
    updatedAt: TIME,
    ...values,
  } satisfies RemoteSongSyncRecord;
}

async function insertLocal(
  database: LocalSongDatabase,
  values: {
    id: string;
    ownerUserId: string | null;
    remoteId?: string | null;
    versionGroupId?: string;
    remoteVersionGroupId?: string | null;
    syncStatus?: string;
    deletedAt?: string | null;
    remoteUpdatedAt?: string | null;
    title?: string;
    content?: string;
    versionName?: string | null;
    updatedAt?: string;
  },
) {
  await database.runAsync(
    `INSERT INTO local_songs (
      id, remote_id, version_group_id, owner_user_id, remote_version_group_id,
      sync_status, sync_error, last_synced_at, remote_updated_at, last_synced_hash,
      deleted_at, title, artist, song_key, content, notes, version_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    values.id,
    values.remoteId ?? null,
    values.versionGroupId ?? values.id,
    values.ownerUserId,
    values.remoteVersionGroupId ?? null,
    values.syncStatus ?? "local_only",
    null,
    null,
    values.remoteUpdatedAt ?? null,
    null,
    values.deletedAt ?? null,
    values.title ?? "Local",
    null,
    null,
    values.content ?? "C G",
    null,
    values.versionName ?? "Principal",
    TIME,
    values.updatedAt ?? TIME,
  );
}

test("SQLiteSongSyncStore downloads idempotently over the real local schema", async () => {
  const database = new NodeLocalSongDatabase();
  try {
    await migrateLocalSongDatabase(database);
    const store = new SQLiteSongSyncStore(database);
    const song = remote({ id: "remote_web", title: "Web", content: "D A" });

    assert.equal(await store.applyRemote(OWNER_1, song, TIME), "inserted");
    assert.equal(await store.applyRemote(OWNER_1, song, TIME), "unchanged");

    const rows = await database.getAllAsync<{ id: string; owner_user_id: string; remote_id: string }>(
      `SELECT id, owner_user_id, remote_id FROM local_songs`,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].owner_user_id, OWNER_1);
    assert.equal(rows[0].remote_id, song.id);
  } finally {
    database.close();
  }
});

test("local SQLite migration v3 preserves v2 songs while adding persistent conflict storage", async () => {
  const database = new NodeLocalSongDatabase();
  try {
    await database.execAsync(LOCAL_SONG_SCHEMA_V1);
    await database.execAsync(LOCAL_SONG_SCHEMA_V2);
    await database.execAsync("PRAGMA user_version = 2");
    await insertLocal(database, { id: "existing_v2", ownerUserId: OWNER_1, title: "Persistida" });

    await migrateLocalSongDatabase(database);

    assert.equal((await database.getFirstAsync<{ user_version: number }>("PRAGMA user_version"))?.user_version, 3);
    assert.equal((await database.getFirstAsync<{ title: string }>(`SELECT title FROM local_songs WHERE id = ?`, "existing_v2"))?.title, "Persistida");
    assert.ok(await database.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'song_sync_deletion_conflicts'`,
    ));
  } finally {
    database.close();
  }
});

test("SQLiteSongSyncStore never attaches an anonymous or foreign row to the active account", async () => {
  const database = new NodeLocalSongDatabase();
  try {
    await migrateLocalSongDatabase(database);
    await insertLocal(database, { id: "shared_client", ownerUserId: null, title: "Guest" });
    await insertLocal(database, { id: "foreign", ownerUserId: OWNER_2, remoteId: "remote_foreign", title: "Foreign" });
    const store = new SQLiteSongSyncStore(database);

    await store.applyRemote(
      OWNER_1,
      remote({ id: "remote_owner_1", clientId: "shared_client", title: "Owned", content: "E B" }),
      TIME,
    );

    const guest = await database.getFirstAsync<{ owner_user_id: string | null; remote_id: string | null }>(
      `SELECT owner_user_id, remote_id FROM local_songs WHERE id = ?`,
      "shared_client",
    );
    const owned = await store.findByRemoteId(OWNER_1, "remote_owner_1");
    assert.equal(guest?.owner_user_id, null);
    assert.equal(guest?.remote_id, null);
    assert.ok(owned);
    assert.notEqual(owned?.id, "shared_client");
    assert.equal(await store.findByRemoteId(OWNER_1, "remote_foreign"), null);
  } finally {
    database.close();
  }
});

test("SQLiteSongSyncStore preview counts pending rows, versions and anonymous exclusions by owner", async () => {
  const database = new NodeLocalSongDatabase();
  try {
    await migrateLocalSongDatabase(database);
    await insertLocal(database, { id: "new_principal", ownerUserId: OWNER_1 });
    await insertLocal(database, {
      id: "new_version",
      ownerUserId: OWNER_1,
      versionGroupId: "new_principal",
      syncStatus: "error",
    });
    await insertLocal(database, {
      id: "changed",
      ownerUserId: OWNER_1,
      remoteId: "remote_changed",
      syncStatus: "dirty",
    });
    await insertLocal(database, {
      id: "deleted",
      ownerUserId: OWNER_1,
      remoteId: "remote_deleted",
      syncStatus: "deleted",
      deletedAt: TIME,
    });
    await insertLocal(database, { id: "synced", ownerUserId: OWNER_1, remoteId: "remote_synced", syncStatus: "synced" });
    await insertLocal(database, { id: "conflict", ownerUserId: OWNER_1, remoteId: "remote_conflict", syncStatus: "conflict" });
    await insertLocal(database, { id: "foreign", ownerUserId: OWNER_2, remoteId: "remote_foreign", syncStatus: "dirty" });
    await insertLocal(database, { id: "guest_principal", ownerUserId: null });
    await insertLocal(database, { id: "guest_version", ownerUserId: null, versionGroupId: "guest_principal" });
    await insertLocal(database, { id: "guest_deleted", ownerUserId: null, deletedAt: TIME, syncStatus: "deleted" });

    const store = new SQLiteSongSyncStore(database);
    assert.deepEqual(await store.getPreview(OWNER_1), {
      pendingTotal: 4,
      newCount: 2,
      changedCount: 1,
      deletedCount: 1,
      errorCount: 1,
      versionCount: 1,
      anonymousExcludedCount: 2,
    });
    assert.deepEqual(await store.getPreview(OWNER_2), {
      pendingTotal: 1,
      newCount: 0,
      changedCount: 1,
      deletedCount: 0,
      errorCount: 0,
      versionCount: 0,
      anonymousExcludedCount: 2,
    });
  } finally {
    database.close();
  }
});

test("SQLiteSongSyncStore preserves conflicts, tombstones and remote version groups", async () => {
  const database = new NodeLocalSongDatabase();
  try {
    await migrateLocalSongDatabase(database);
    const store = new SQLiteSongSyncStore(database);
    const principal = remote({ id: "remote_principal", clientId: "local_principal", title: "Song", content: "C" });
    const version = remote({
      id: "remote_version",
      clientId: "local_version",
      versionGroupId: principal.id,
      versionName: "En D",
      title: "Song",
      content: "D",
    });
    await store.applyRemote(OWNER_1, version, TIME);
    await store.applyRemote(OWNER_1, principal, TIME);
    await store.reconcileVersionGroups(OWNER_1);

    const localPrincipal = await store.findByRemoteId(OWNER_1, principal.id);
    const localVersion = await store.findByRemoteId(OWNER_1, version.id);
    assert.equal(localVersion?.versionGroupId, localPrincipal?.id);

    await insertLocal(database, {
      id: "local_conflict",
      ownerUserId: OWNER_1,
      remoteId: "remote_conflict",
      syncStatus: "dirty",
      remoteUpdatedAt: TIME,
      title: "Local title",
      content: "Local content",
    });
    const conflictRemote = remote({
      id: "remote_conflict",
      clientId: "local_conflict",
      title: "Remote title",
      content: "Remote content",
      updatedAt: "2026-10-08T10:01:00.000Z",
    });
    assert.equal(await store.applyRemote(OWNER_1, conflictRemote, TIME), "recovered");
    const conflicted = await store.findByLocalId(OWNER_1, "local_conflict");
    assert.equal(conflicted?.title, "Remote title");
    assert.equal(conflicted?.content, "Remote content");
    assert.equal(conflicted?.syncStatus, "synced");
    const recovered = await database.getFirstAsync<{
      id: string;
      version_group_id: string;
      owner_user_id: string;
      sync_status: string;
      version_name: string;
      content: string;
    }>(`SELECT id, version_group_id, owner_user_id, sync_status, version_name, content
        FROM local_songs WHERE id <> ? AND content = ?`, "local_conflict", "Local content");
    assert.ok(recovered);
    assert.equal(recovered?.version_group_id, "local_conflict");
    assert.equal(recovered?.owner_user_id, OWNER_1);
    assert.equal(recovered?.sync_status, "local_only");
    assert.equal(recovered?.version_name, "Copia recuperada");

    const tombstone = remote({
      id: "remote_deleted",
      title: "Deleted",
      content: "A",
      deletedAt: "2026-10-08T10:02:00.000Z",
    });
    await store.applyRemote(OWNER_1, tombstone, TIME);
    assert.equal((await store.findByRemoteId(OWNER_1, tombstone.id))?.deletedAt, tombstone.deletedAt);
  } finally {
    database.close();
  }
});

test("a clean remote tombstone disappears from the local library and cannot be resurrected by retry", async () => {
  const database = new NodeLocalSongDatabase();
  try {
    await migrateLocalSongDatabase(database);
    await insertLocal(database, {
      id: "local_web_deleted",
      ownerUserId: OWNER_1,
      remoteId: "remote_web_deleted",
      remoteUpdatedAt: TIME,
      syncStatus: "synced",
      title: "Eliminada desde web",
      content: "C G",
    });
    const repository = new LocalSongRepository(database, OWNER_1);
    const store = new SQLiteSongSyncStore(database);
    const tombstone = remote({
      id: "remote_web_deleted",
      clientId: "local_web_deleted",
      title: "Eliminada desde web",
      content: "C G",
      deletedAt: "2026-10-08T10:02:00.000Z",
      updatedAt: "2026-10-08T10:02:00.000Z",
    });

    assert.deepEqual((await repository.listSongs()).map((song) => song.id), ["local_web_deleted"]);
    assert.equal(await store.applyRemote(OWNER_1, tombstone, TIME), "updated");
    assert.deepEqual(await repository.listSongs(), []);

    assert.equal(await store.applyRemote(OWNER_1, tombstone, TIME), "unchanged");
    assert.deepEqual(await repository.listSongs(), []);
    const rows = await database.getAllAsync<{ id: string }>(
      `SELECT id FROM local_songs WHERE remote_id = ?`,
      tombstone.id,
    );
    assert.equal(rows.length, 1);
  } finally {
    database.close();
  }
});

test("SQLiteSongSyncStore recovers a conflicting version as a sibling without duplicates after reopen", async () => {
  const database = new NodeLocalSongDatabase();
  try {
    await migrateLocalSongDatabase(database);
    await insertLocal(database, {
      id: "principal",
      ownerUserId: OWNER_1,
      remoteId: "remote_principal",
      syncStatus: "synced",
      title: "Song",
      content: "C",
    });
    await insertLocal(database, {
      id: "version",
      ownerUserId: OWNER_1,
      remoteId: "remote_version",
      versionGroupId: "principal",
      remoteVersionGroupId: "remote_principal",
      remoteUpdatedAt: TIME,
      syncStatus: "conflict",
      versionName: "En D",
      title: "Song",
      content: "Local D",
    });
    const remoteVersion = remote({
      id: "remote_version",
      clientId: "version",
      versionGroupId: "remote_principal",
      versionName: "En D",
      title: "Song",
      content: "Remote D",
      updatedAt: "2026-10-08T10:03:00.000Z",
    });

    const firstStore = new SQLiteSongSyncStore(database);
    assert.equal(await firstStore.applyRemote(OWNER_1, remoteVersion, TIME), "recovered");
    const reopenedStore = new SQLiteSongSyncStore(database);
    assert.equal(await reopenedStore.applyRemote(OWNER_1, remoteVersion, TIME), "unchanged");

    const rows = await database.getAllAsync<{
      id: string;
      version_group_id: string;
      version_name: string | null;
      content: string;
    }>(`SELECT id, version_group_id, version_name, content
        FROM local_songs WHERE owner_user_id = ? ORDER BY id`, OWNER_1);
    assert.equal(rows.length, 3);
    const recovered = rows.find((row) => row.content === "Local D");
    assert.equal(recovered?.version_group_id, "principal");
    assert.equal(recovered?.version_name, "En D (copia recuperada)");
  } finally {
    database.close();
  }
});

test("SQLiteSongSyncStore leaves deletion conflicts pending and isolates owners and anonymous rows", async () => {
  const database = new NodeLocalSongDatabase();
  try {
    await migrateLocalSongDatabase(database);
    await insertLocal(database, {
      id: "owned_deleted",
      ownerUserId: OWNER_1,
      remoteId: "remote_deleted_conflict",
      remoteUpdatedAt: TIME,
      syncStatus: "deleted",
      deletedAt: "2026-10-08T10:02:00.000Z",
      content: "Owned local",
    });
    await insertLocal(database, { id: "foreign", ownerUserId: OWNER_2, content: "Foreign" });
    await insertLocal(database, { id: "anonymous", ownerUserId: null, content: "Anonymous" });
    const store = new SQLiteSongSyncStore(database);
    const activeRemote = remote({
      id: "remote_deleted_conflict",
      clientId: "owned_deleted",
      title: "Remote",
      content: "Remote active",
      updatedAt: "2026-10-08T10:03:00.000Z",
    });

    assert.equal(await store.applyRemote(OWNER_1, activeRemote, TIME), "conflict");
    assert.equal((await store.findByLocalId(OWNER_1, "owned_deleted"))?.syncStatus, "conflict");
    assert.equal((await store.findByLocalId(OWNER_1, "owned_deleted"))?.deletedAt, "2026-10-08T10:02:00.000Z");
    assert.equal(
      await store.recoverEditConflict(
        OWNER_1,
        "anonymous",
        TIME,
        remote({ id: "anonymous_remote", clientId: "anonymous", title: "Anonymous", content: "Remote" }),
        TIME,
      ),
      "conflict",
    );
    assert.equal((await database.getFirstAsync<{ content: string }>(`SELECT content FROM local_songs WHERE id = ?`, "foreign"))?.content, "Foreign");
    assert.equal((await database.getFirstAsync<{ content: string }>(`SELECT content FROM local_songs WHERE id = ?`, "anonymous"))?.content, "Anonymous");
  } finally {
    database.close();
  }
});

test("SQLiteSongSyncStore rolls back the recovered copy when replacing the original fails", async () => {
  const database = new NodeLocalSongDatabase();
  try {
    await migrateLocalSongDatabase(database);
    await insertLocal(database, {
      id: "rollback",
      ownerUserId: OWNER_1,
      remoteId: "remote_rollback",
      remoteUpdatedAt: TIME,
      syncStatus: "dirty",
      content: "Local",
    });
    const store = new SQLiteSongSyncStore(database);
    database.failRecoveryReplace = true;

    await assert.rejects(
      () => store.applyRemote(OWNER_1, remote({
        id: "remote_rollback",
        clientId: "rollback",
        title: "Remote",
        content: "Remote",
        updatedAt: "2026-10-08T10:04:00.000Z",
      }), TIME),
      /SIMULATED_RECOVERY_REPLACE_FAILURE/,
    );
    database.failRecoveryReplace = false;

    const rows = await database.getAllAsync<{ id: string; content: string }>(`SELECT id, content FROM local_songs`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, "rollback");
    assert.equal(rows[0].content, "Local");
  } finally {
    database.close();
  }
});

test("SQLiteSongSyncStore does not recover over a concurrent local edit and collapses equivalent states", async () => {
  const database = new NodeLocalSongDatabase();
  try {
    await migrateLocalSongDatabase(database);
    await insertLocal(database, {
      id: "concurrent",
      ownerUserId: OWNER_1,
      remoteId: "remote_concurrent",
      remoteUpdatedAt: TIME,
      syncStatus: "conflict",
      content: "Newest local",
      updatedAt: "2026-10-08T10:05:00.000Z",
    });
    const store = new SQLiteSongSyncStore(database);
    const incoming = remote({
      id: "remote_concurrent",
      clientId: "concurrent",
      title: "Local",
      content: "Remote",
      updatedAt: "2026-10-08T10:06:00.000Z",
    });
    assert.equal(
      await store.recoverEditConflict(OWNER_1, "concurrent", TIME, incoming, TIME),
      "conflict",
    );
    assert.equal((await store.findByLocalId(OWNER_1, "concurrent"))?.content, "Newest local");

    await database.runAsync(
      `UPDATE local_songs SET content = ?, title = ?, updated_at = ? WHERE id = ?`,
      "Same",
      "Same",
      TIME,
      "concurrent",
    );
    const equivalent = remote({
      id: "remote_concurrent",
      clientId: "concurrent",
      title: "Same",
      content: "Same",
      updatedAt: "2026-10-08T10:07:00.000Z",
    });
    assert.equal(await store.applyRemote(OWNER_1, equivalent, TIME), "unchanged");
    assert.equal((await database.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM local_songs`))?.count, 1);
  } finally {
    database.close();
  }
});

test("SQLiteSongSyncStore persists a remote-deletion notice until acknowledgement", async () => {
  const database = new NodeLocalSongDatabase();
  try {
    await migrateLocalSongDatabase(database);
    await insertLocal(database, {
      id: "edited_local",
      ownerUserId: OWNER_1,
      remoteId: "remote_deleted_elsewhere",
      syncStatus: "dirty",
      remoteUpdatedAt: TIME,
      content: "C\nEdición local que todavía debe verse",
      updatedAt: "2026-10-08T10:05:00.000Z",
    });
    await insertLocal(database, {
      id: "anonymous",
      ownerUserId: null,
      content: "No tocar",
    });
    const store = new SQLiteSongSyncStore(database);
    const tombstone = remote({
      id: "remote_deleted_elsewhere",
      clientId: "edited_local",
      title: "Eliminada",
      content: "Contenido remoto",
      deletedAt: "2026-10-08T10:06:00.000Z",
      updatedAt: "2026-10-08T10:06:00.000Z",
    });

    assert.equal(await store.applyRemote(OWNER_1, tombstone, TIME), "conflict");
    assert.equal(await store.applyRemote(OWNER_1, tombstone, TIME), "conflict");
    assert.equal((await store.findByLocalId(OWNER_1, "edited_local"))?.content, "C\nEdición local que todavía debe verse");
    assert.equal((await store.findByLocalId(OWNER_1, "edited_local"))?.deletedAt, null);

    const reopened = new SQLiteSongSyncStore(database);
    const notices = await reopened.listDeletionConflicts(OWNER_1);
    assert.equal(notices.length, 1);
    assert.equal(notices[0].kind, "remote_deletion");
    assert.deepEqual(await reopened.listDeletionConflicts(OWNER_2), []);

    await reopened.acknowledgeRemoteDeletion(OWNER_1, notices[0].id, "2026-10-08T10:07:00.000Z");
    const deleted = await reopened.findByLocalId(OWNER_1, "edited_local");
    assert.equal(deleted?.deletedAt, tombstone.deletedAt);
    assert.equal(deleted?.syncStatus, "synced");
    assert.deepEqual(await reopened.listDeletionConflicts(OWNER_1), []);
    assert.equal((await database.getFirstAsync<{ content: string }>(`SELECT content FROM local_songs WHERE id = ?`, "anonymous"))?.content, "No tocar");
  } finally {
    database.close();
  }
});

test("SQLiteSongSyncStore lets a user retry or cancel a stale local deletion", async () => {
  const database = new NodeLocalSongDatabase();
  try {
    await migrateLocalSongDatabase(database);
    await insertLocal(database, {
      id: "deleted_local",
      ownerUserId: OWNER_1,
      remoteId: "remote_edited_elsewhere",
      syncStatus: "deleted",
      deletedAt: "2026-10-08T10:05:00.000Z",
      remoteUpdatedAt: TIME,
      updatedAt: "2026-10-08T10:05:00.000Z",
    });
    const store = new SQLiteSongSyncStore(database);
    const editedRemote = remote({
      id: "remote_edited_elsewhere",
      clientId: "deleted_local",
      title: "Editada en otro dispositivo",
      content: "D A",
      updatedAt: "2026-10-08T10:06:00.000Z",
    });

    assert.equal(await store.applyRemote(OWNER_1, editedRemote, "2026-10-08T10:06:30.000Z"), "conflict");
    let [notice] = await store.listDeletionConflicts(OWNER_1);
    assert.equal(notice.kind, "local_deletion");
    await store.retryLocalDeletion(OWNER_1, notice.id);
    let local = await store.findByLocalId(OWNER_1, "deleted_local");
    assert.equal(local?.syncStatus, "deleted");
    assert.equal(local?.remoteUpdatedAt, editedRemote.updatedAt);
    assert.equal(local?.deletedAt, "2026-10-08T10:05:00.000Z");

    const changedAgain = { ...editedRemote, content: "E B", updatedAt: "2026-10-08T10:08:00.000Z" };
    assert.equal(await store.applyRemote(OWNER_1, changedAgain, "2026-10-08T10:08:30.000Z"), "conflict");
    [notice] = await store.listDeletionConflicts(OWNER_1);
    await store.keepRemoteAfterLocalDeletion(OWNER_1, notice.id, "2026-10-08T10:09:00.000Z");
    local = await store.findByLocalId(OWNER_1, "deleted_local");
    assert.equal(local?.syncStatus, "synced");
    assert.equal(local?.deletedAt, null);
    assert.equal(local?.content, "E B");
  } finally {
    database.close();
  }
});

test("SQLiteSongSyncStore resolves group deletion conflicts atomically and preserves relationships", async () => {
  const database = new NodeLocalSongDatabase();
  try {
    await migrateLocalSongDatabase(database);
    await insertLocal(database, {
      id: "principal",
      ownerUserId: OWNER_1,
      remoteId: "remote_principal",
      syncStatus: "deleted",
      deletedAt: "2026-10-08T10:05:00.000Z",
      remoteUpdatedAt: TIME,
    });
    await insertLocal(database, {
      id: "version",
      ownerUserId: OWNER_1,
      remoteId: "remote_version",
      versionGroupId: "principal",
      remoteVersionGroupId: "remote_principal",
      syncStatus: "deleted",
      deletedAt: "2026-10-08T10:05:00.000Z",
      remoteUpdatedAt: TIME,
      versionName: "Acústica",
    });
    const store = new SQLiteSongSyncStore(database);
    const remotes = [
      remote({ id: "remote_principal", clientId: "principal", title: "Principal remota", content: "C", updatedAt: "2026-10-08T10:06:00.000Z" }),
      remote({ id: "remote_version", clientId: "version", versionGroupId: "remote_principal", versionName: "Acústica", title: "Versión remota", content: "D", updatedAt: "2026-10-08T10:06:00.000Z" }),
    ];

    assert.equal(
      await store.recordLocalDeletionConflict(OWNER_1, ["principal", "version"], "principal", remotes, "2026-10-08T10:06:30.000Z"),
      true,
    );
    const [notice] = await store.listDeletionConflicts(OWNER_1);

    database.failRecoveryReplace = true;
    await assert.rejects(
      () => store.keepRemoteAfterLocalDeletion(OWNER_1, notice.id, "2026-10-08T10:07:00.000Z"),
      /SIMULATED_RECOVERY_REPLACE_FAILURE/,
    );
    database.failRecoveryReplace = false;
    assert.equal((await store.listDeletionConflicts(OWNER_1)).length, 1);
    assert.equal((await store.findByLocalId(OWNER_1, "principal"))?.deletedAt, "2026-10-08T10:05:00.000Z");

    await store.keepRemoteAfterLocalDeletion(OWNER_1, notice.id, "2026-10-08T10:07:30.000Z");
    const principal = await store.findByLocalId(OWNER_1, "principal");
    const version = await store.findByLocalId(OWNER_1, "version");
    assert.equal(principal?.deletedAt, null);
    assert.equal(version?.deletedAt, null);
    assert.equal(version?.versionGroupId, principal?.id);
    assert.equal(version?.remoteVersionGroupId, principal?.remoteId);
    assert.deepEqual(await store.listDeletionConflicts(OWNER_1), []);
  } finally {
    database.close();
  }
});

test("SQLiteSongSyncStore acknowledges every remote tombstone in a group atomically", async () => {
  const database = new NodeLocalSongDatabase();
  try {
    await migrateLocalSongDatabase(database);
    await insertLocal(database, {
      id: "group_principal",
      ownerUserId: OWNER_1,
      remoteId: "remote_group_principal",
      remoteUpdatedAt: TIME,
      syncStatus: "deleted",
      deletedAt: TIME,
    });
    await insertLocal(database, {
      id: "group_version",
      ownerUserId: OWNER_1,
      remoteId: "remote_group_version",
      versionGroupId: "group_principal",
      remoteVersionGroupId: "remote_group_principal",
      remoteUpdatedAt: TIME,
      syncStatus: "deleted",
      deletedAt: TIME,
      versionName: "En D",
    });
    const store = new SQLiteSongSyncStore(database);
    const remoteUpdatedAt = "2026-10-08T10:08:00.000Z";

    await store.acknowledgeGroupDeletion(
      OWNER_1,
      [
        { id: "group_principal", updatedAt: TIME, remoteId: "remote_group_principal" },
        { id: "group_version", updatedAt: TIME, remoteId: "remote_group_version" },
      ],
      [
        remote({
          id: "remote_group_principal",
          clientId: "group_principal",
          title: "Grupo",
          content: "C",
          deletedAt: remoteUpdatedAt,
          updatedAt: remoteUpdatedAt,
        }),
        remote({
          id: "remote_group_version",
          clientId: "group_version",
          versionGroupId: "remote_group_principal",
          versionName: "En D",
          title: "Grupo",
          content: "D",
          deletedAt: remoteUpdatedAt,
          updatedAt: remoteUpdatedAt,
        }),
      ],
      remoteUpdatedAt,
    );

    const rows = await database.getAllAsync<{
      id: string;
      sync_status: string;
      deleted_at: string | null;
      remote_updated_at: string | null;
    }>(`SELECT id, sync_status, deleted_at, remote_updated_at FROM local_songs ORDER BY id`);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => row.sync_status === "synced"));
    assert.ok(rows.every((row) => row.deleted_at === remoteUpdatedAt));
    assert.ok(rows.every((row) => row.remote_updated_at === remoteUpdatedAt));
  } finally {
    database.close();
  }
});

test("SQLiteSongSyncStore rolls back all local acknowledgements if one group member fails", async () => {
  const database = new NodeLocalSongDatabase();
  try {
    await migrateLocalSongDatabase(database);
    await insertLocal(database, {
      id: "rollback_group_principal",
      ownerUserId: OWNER_1,
      remoteId: "remote_rollback_group_principal",
      remoteUpdatedAt: TIME,
      syncStatus: "deleted",
      deletedAt: TIME,
    });
    await insertLocal(database, {
      id: "rollback_group_version",
      ownerUserId: OWNER_1,
      remoteId: "remote_rollback_group_version",
      versionGroupId: "rollback_group_principal",
      remoteVersionGroupId: "remote_rollback_group_principal",
      remoteUpdatedAt: TIME,
      syncStatus: "deleted",
      deletedAt: TIME,
    });
    const store = new SQLiteSongSyncStore(database);
    const remoteUpdatedAt = "2026-10-08T10:09:00.000Z";
    database.failRecoveryReplace = true;

    await assert.rejects(
      () => store.acknowledgeGroupDeletion(
        OWNER_1,
        [
          { id: "rollback_group_principal", updatedAt: TIME, remoteId: "remote_rollback_group_principal" },
          { id: "rollback_group_version", updatedAt: TIME, remoteId: "remote_rollback_group_version" },
        ],
        [
          remote({
            id: "remote_rollback_group_principal",
            clientId: "rollback_group_principal",
            title: "Grupo",
            content: "C",
            deletedAt: remoteUpdatedAt,
            updatedAt: remoteUpdatedAt,
          }),
          remote({
            id: "remote_rollback_group_version",
            clientId: "rollback_group_version",
            versionGroupId: "remote_rollback_group_principal",
            title: "Grupo",
            content: "D",
            deletedAt: remoteUpdatedAt,
            updatedAt: remoteUpdatedAt,
          }),
        ],
        remoteUpdatedAt,
      ),
      /SIMULATED_RECOVERY_REPLACE_FAILURE/,
    );
    database.failRecoveryReplace = false;

    const rows = await database.getAllAsync<{ sync_status: string; remote_updated_at: string | null }>(
      `SELECT sync_status, remote_updated_at FROM local_songs`,
    );
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => row.sync_status === "deleted"));
    assert.ok(rows.every((row) => row.remote_updated_at === TIME));
  } finally {
    database.close();
  }
});
