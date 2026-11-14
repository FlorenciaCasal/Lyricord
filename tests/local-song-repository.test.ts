import assert from "node:assert/strict";
import test from "node:test";
import {
  createLocalSongRepository,
  LocalSongCapacityUnknownError,
  LocalSongLimitReachedError,
  LocalSongNotFoundError,
} from "../mobile/src/data/songs/local/LocalSongRepository.ts";
import {
  getLocalSongDatabaseVersion,
  migrateLocalSongDatabase,
} from "../mobile/src/data/songs/local/migrations.ts";
import type { LocalSongDatabase } from "../mobile/src/data/songs/local/LocalSongDatabase.ts";
import type { SongFormValues, SongVersionCreateValues } from "../mobile/src/types.ts";

type LocalSongRow = {
  id: string;
  remote_id: string | null;
  version_group_id: string;
  owner_user_id: string | null;
  remote_version_group_id: string | null;
  sync_status: "local_only" | "synced" | "dirty" | "deleted" | "conflict" | "error";
  sync_error: string | null;
  last_synced_at: string | null;
  remote_updated_at: string | null;
  last_synced_hash: string | null;
  deleted_at: string | null;
  title: string;
  artist: string | null;
  song_key: string | null;
  content: string;
  notes: string | null;
  version_name: string | null;
  created_at: string;
  updated_at: string;
};

function localSongRow(values: Partial<LocalSongRow> & Pick<LocalSongRow, "id" | "version_group_id" | "title" | "content" | "created_at" | "updated_at">): LocalSongRow {
  return {
    remote_id: null,
    owner_user_id: null,
    remote_version_group_id: null,
    sync_status: "local_only",
    sync_error: null,
    last_synced_at: null,
    remote_updated_at: null,
    last_synced_hash: null,
    deleted_at: null,
    artist: null,
    song_key: null,
    notes: null,
    version_name: null,
    ...values,
  };
}

class InMemoryLocalSongDatabase implements LocalSongDatabase {
  userVersion = 0;
  execStatements: string[] = [];
  rows = new Map<string, LocalSongRow>();

  async execAsync(source: string) {
    this.execStatements.push(source);
    const versionMatch = source.match(/PRAGMA\s+user_version\s*=\s*(\d+)/i);
    if (versionMatch) this.userVersion = Number(versionMatch[1]);
  }

  async runAsync(source: string, ...params: unknown[]) {
    if (/INSERT INTO local_songs/i.test(source)) {
      const [
        id,
        remoteId,
        versionGroupId,
        ownerUserId,
        remoteVersionGroupId,
        syncStatus,
        syncError,
        lastSyncedAt,
        remoteUpdatedAt,
        lastSyncedHash,
        deletedAt,
        title,
        artist,
        songKey,
        content,
        notes,
        versionName,
        createdAt,
        updatedAt,
      ] = params as Array<string | null>;
      this.rows.set(id as string, localSongRow({
        id: id as string,
        remote_id: remoteId,
        version_group_id: versionGroupId as string,
        owner_user_id: ownerUserId,
        remote_version_group_id: remoteVersionGroupId,
        sync_status: syncStatus as LocalSongRow["sync_status"],
        sync_error: syncError,
        last_synced_at: lastSyncedAt,
        remote_updated_at: remoteUpdatedAt,
        last_synced_hash: lastSyncedHash,
        deleted_at: deletedAt,
        title: title as string,
        artist,
        song_key: songKey,
        content: content as string,
        notes,
        version_name: versionName,
        created_at: createdAt as string,
        updated_at: updatedAt as string,
      }));
      return { changes: 1 };
    }

    if (/DELETE FROM local_songs[\s\S]*version_group_id = \?/i.test(source)) {
      const [versionGroupId, ownerUserId] = params as Array<string | null>;
      const matchingIds = Array.from(this.rows.values())
        .filter((row) =>
          row.version_group_id === versionGroupId &&
          row.owner_user_id === ownerUserId &&
          row.remote_id === null &&
          row.deleted_at === null
        )
        .map((row) => row.id);
      matchingIds.forEach((id) => this.rows.delete(id));
      return { changes: matchingIds.length };
    }

    if (/UPDATE local_songs[\s\S]*version_group_id = \?/i.test(source)) {
      const [deletedAt, updatedAt, versionGroupId, ownerUserId] = params as Array<string | null>;
      let changes = 0;
      for (const [id, row] of this.rows) {
        if (
          row.version_group_id !== versionGroupId ||
          row.owner_user_id !== ownerUserId ||
          row.remote_id === null ||
          row.deleted_at !== null
        ) continue;
        this.rows.set(id, {
          ...row,
          sync_status: "deleted",
          sync_error: null,
          deleted_at: deletedAt,
          updated_at: updatedAt as string,
        });
        changes += 1;
      }
      return { changes };
    }

    if (/UPDATE local_songs[\s\S]*SET sync_status = \?/i.test(source)) {
      const [syncStatus, syncError, deletedAt, updatedAt, id] = params as Array<string | null>;
      const row = this.rows.get(id as string);
      if (!row || row.deleted_at) return { changes: 0 };
      this.rows.set(id as string, {
        ...row,
        sync_status: syncStatus as LocalSongRow["sync_status"],
        sync_error: syncError,
        deleted_at: deletedAt,
        updated_at: updatedAt as string,
      });
      return { changes: 1 };
    }

    if (/UPDATE local_songs/i.test(source)) {
      const [title, artist, songKey, content, notes, versionName, syncStatus, syncError, updatedAt, id] = params as Array<string | null>;
      const row = this.rows.get(id as string);
      if (!row || row.deleted_at) return { changes: 0 };
      this.rows.set(id as string, {
        ...row,
        title: title as string,
        artist,
        song_key: songKey,
        content: content as string,
        notes,
        version_name: versionName,
        sync_status: syncStatus as LocalSongRow["sync_status"],
        sync_error: syncError,
        updated_at: updatedAt as string,
      });
      return { changes: 1 };
    }

    if (/DELETE FROM local_songs/i.test(source)) {
      return { changes: this.rows.delete(params[0] as string) ? 1 : 0 };
    }

    throw new Error(`Unsupported runAsync SQL in test fake: ${source}`);
  }

  async getFirstAsync<T>(source: string, ...params: unknown[]) {
    if (/PRAGMA\s+user_version/i.test(source)) {
      return { user_version: this.userVersion } as T;
    }

    if (/SELECT \* FROM local_songs WHERE id = \? AND deleted_at IS NULL/i.test(source)) {
      const row = this.rows.get(params[0] as string);
      return (row && !row.deleted_at ? row : null) as T | null;
    }

    if (/SELECT \* FROM local_songs WHERE id = \?/i.test(source)) {
      return (this.rows.get(params[0] as string) ?? null) as T | null;
    }

    if (/SELECT COUNT\(\*\) AS count[\s\S]*version_group_id = \?[\s\S]*owner_user_id IS \?/i.test(source)) {
      const [versionGroupId, ownerUserId] = params as Array<string | null>;
      const count = Array.from(this.rows.values()).filter((row) =>
        row.version_group_id === versionGroupId &&
        row.owner_user_id === ownerUserId &&
        !row.deleted_at
      ).length;
      return { count } as T;
    }

    if (/SELECT COUNT\(\*\) AS count FROM local_songs WHERE version_group_id = \?/i.test(source)) {
      const versionGroupId = params[0] as string;
      const count = Array.from(this.rows.values()).filter((row) => row.version_group_id === versionGroupId && !row.deleted_at).length;
      return { count } as T;
    }

    if (/SELECT COUNT\(\*\) AS count[\s\S]*owner_user_id = \?[\s\S]*remote_id IS (NOT )?NULL[\s\S]*deleted_at IS NULL/i.test(source)) {
      const ownerUserId = params[0] as string;
      const wantsRemote = /remote_id IS NOT NULL/i.test(source);
      const count = Array.from(this.rows.values()).filter((row) =>
        row.owner_user_id === ownerUserId &&
        (wantsRemote ? row.remote_id !== null : row.remote_id === null) &&
        !row.deleted_at
      ).length;
      return { count } as T;
    }

    if (/SELECT COUNT\(\*\) AS count[\s\S]*owner_user_id IS \?[\s\S]*deleted_at IS NULL/i.test(source)) {
      const ownerUserId = params[0] as string | null;
      const count = Array.from(this.rows.values()).filter((row) =>
        row.owner_user_id === ownerUserId && !row.deleted_at
      ).length;
      return { count } as T;
    }

    throw new Error(`Unsupported getFirstAsync SQL in test fake: ${source}`);
  }

  async getAllAsync<T>(source: string, ...params: unknown[]) {
    if (/WHERE version_group_id = \?/i.test(source)) {
      const versionGroupId = params[0] as string;
      return Array.from(this.rows.values())
        .filter((row) => row.version_group_id === versionGroupId && !row.deleted_at)
        .sort((left, right) =>
          left.created_at.localeCompare(right.created_at) || right.updated_at.localeCompare(left.updated_at),
        ) as T[];
    }

    if (/owner_user_id = \?/i.test(source) && /sync_status IN/i.test(source)) {
      const ownerUserId = params[4] as string;
      return Array.from(this.rows.values())
        .filter((row) =>
          ["local_only", "dirty", "deleted", "error"].includes(row.sync_status) &&
          row.owner_user_id === ownerUserId
        )
        .sort((left, right) => left.updated_at.localeCompare(right.updated_at) || left.id.localeCompare(right.id)) as T[];
    }

    if (/owner_user_id IS NULL OR owner_user_id = \?/i.test(source)) {
      const ownerUserId = params[0] as string;
      return Array.from(this.rows.values())
        .filter((row) => !row.deleted_at && (row.owner_user_id === null || row.owner_user_id === ownerUserId))
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at) || right.id.localeCompare(left.id)) as T[];
    }

    if (/owner_user_id IS NULL/i.test(source)) {
      return Array.from(this.rows.values())
        .filter((row) => !row.deleted_at && row.owner_user_id === null)
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at) || right.id.localeCompare(left.id)) as T[];
    }

    if (/WHERE deleted_at IS NULL/i.test(source)) {
      return Array.from(this.rows.values()).filter((row) => !row.deleted_at).sort((left, right) =>
        right.updated_at.localeCompare(left.updated_at) || right.id.localeCompare(left.id),
      ) as T[];
    }

    throw new Error(`Unsupported getAllAsync SQL in test fake: ${source}`);
  }
}

const baseSong: SongFormValues = {
  title: "Cae el sol",
  artist: "Airbag",
  key: "C#m",
  versionName: "",
  content: "C#m A E",
  notes: "Intro",
};

test("local song migrations create schema, set version and are idempotent", async () => {
  const database = new InMemoryLocalSongDatabase();

  await migrateLocalSongDatabase(database);
  await migrateLocalSongDatabase(database);

  assert.equal(await getLocalSongDatabaseVersion(database), 3);
  assert.equal(database.execStatements.filter((statement) => /CREATE TABLE/i.test(statement)).length, 2);
  assert.equal(database.execStatements.filter((statement) => /PRAGMA user_version = 1/i.test(statement)).length, 1);
  assert.equal(database.execStatements.filter((statement) => /ALTER TABLE local_songs ADD COLUMN owner_user_id/i.test(statement)).length, 1);
  assert.equal(database.execStatements.filter((statement) => /PRAGMA user_version = 2/i.test(statement)).length, 1);
  assert.equal(database.execStatements.filter((statement) => /PRAGMA user_version = 3/i.test(statement)).length, 1);
});

test("local song migrations preserve existing rows", async () => {
  const database = new InMemoryLocalSongDatabase();
  database.rows.set("local_existing", localSongRow({
    id: "local_existing",
    version_group_id: "local_existing",
    title: "Persistida",
    content: "G D",
    created_at: "2026-09-18T00:00:00.000Z",
    updated_at: "2026-09-18T00:00:00.000Z",
  }));

  await migrateLocalSongDatabase(database);

  assert.equal(database.rows.get("local_existing")?.title, "Persistida");
});

test("LocalSongRepository creates, lists, gets and updates songs", async () => {
  const database = new InMemoryLocalSongDatabase();
  const repository = await createLocalSongRepository(database);

  const created = await repository.createSong(baseSong);
  assert.match(created.id, /^local_/);
  assert.equal(created.title, "Cae el sol");
  assert.equal(created.artist, "Airbag");
  assert.equal(created.key, "C#m");
  assert.equal(created.content, "C#m A E");
  assert.equal(created.notes, "Intro");
  const createdSync = await repository.getSyncRecord(created.id);
  assert.equal(createdSync.remoteId, null);
  assert.equal(createdSync.ownerUserId, null);
  assert.equal(createdSync.syncStatus, "local_only");
  assert.equal(createdSync.deletedAt, null);

  assert.deepEqual(await repository.listSongs(), [
    {
      id: created.id,
      title: "Cae el sol",
      artist: "Airbag",
      key: "C#m",
      versionName: null,
      updatedAt: created.updatedAt,
    },
  ]);

  const updated = await repository.updateSong(created.id, {
    ...baseSong,
    title: "Cae el sol editada",
    artist: "",
    key: "Em",
    versionName: "Principal",
    content: "Em C G",
    notes: "",
  });

  assert.equal(updated.title, "Cae el sol editada");
  assert.equal(updated.artist, null);
  assert.equal(updated.key, "Em");
  assert.equal(updated.versionName, "Principal");
  assert.equal(updated.content, "Em C G");
  assert.equal(updated.notes, null);
  assert.equal((await repository.getSong(created.id)).title, "Cae el sol editada");
  assert.equal((await repository.getSyncRecord(created.id)).syncStatus, "local_only");
});

test("LocalSongRepository limita a diez registros y cuenta cada version", async () => {
  const database = new InMemoryLocalSongDatabase();
  const base = await createLocalSongRepository(database);
  const repository = base.forOwner(null, 10);
  const principal = await repository.createSong(baseSong);
  let lastVersionId = "";

  for (let index = 1; index < 10; index += 1) {
    lastVersionId = (await repository.createVersion(principal.id, {
      versionName: `Versión ${index}`,
      key: "",
      content: baseSong.content,
    })).id;
  }

  await assert.rejects(
    repository.createVersion(principal.id, { versionName: "Versión 10", key: "", content: baseSong.content }),
    LocalSongLimitReachedError,
  );
  const edited = await repository.updateSong(principal.id, { ...baseSong, title: "Editada en el límite" });
  assert.equal(edited.title, "Editada en el límite");
  await repository.deleteSong(lastVersionId);
  assert.equal((await repository.createVersion(principal.id, {
    versionName: "Lugar liberado",
    key: "",
    content: baseSong.content,
  })).versionName, "Lugar liberado");
});

test("LocalSongRepository conserva historicas sobre el limite y Premium sigue ilimitado", async () => {
  const database = new InMemoryLocalSongDatabase();
  const base = await createLocalSongRepository(database);
  const premium = base.forOwner("premium_owner", null);
  for (let index = 0; index < 12; index += 1) {
    await premium.createSong({ ...baseSong, title: `Premium ${index}` });
  }

  const downgraded = base.forOwner("premium_owner", 10, 12);
  assert.equal((await downgraded.listSongs()).length, 12);
  await assert.rejects(downgraded.createSong({ ...baseSong, title: "Nueva" }), LocalSongLimitReachedError);
  await downgraded.updateSong((await downgraded.listSongs())[0].id, { ...baseSong, title: "Todavía editable" });
});

test("LocalSongRepository considera el total remoto conocido aunque SQLite todavia no lo haya descargado", async () => {
  const database = new InMemoryLocalSongDatabase();
  const base = await createLocalSongRepository(database);
  const repository = base.forOwner("owner_remoto", 10, 10);

  await assert.rejects(
    repository.createSong({ ...baseSong, title: "No debe exceder el remoto" }),
    LocalSongLimitReachedError,
  );
  assert.equal((await repository.listSongs()).length, 0);
});

test("LocalSongRepository aplica una politica conservadora si desconoce la capacidad remota", async () => {
  const database = new InMemoryLocalSongDatabase();
  const base = await createLocalSongRepository(database);
  const repository = base.forOwner("owner_sin_estado", 10, null);

  await assert.rejects(
    repository.createSong({ ...baseSong, title: "Requiere capacidad conocida" }),
    LocalSongCapacityUnknownError,
  );
  assert.equal((await repository.listSongs()).length, 0);
});

test("LocalSongRepository marks remote edits as dirty without changing local-only status", async () => {
  const database = new InMemoryLocalSongDatabase();
  const repository = await createLocalSongRepository(database);
  database.rows.set("local_remote", localSongRow({
    id: "local_remote",
    remote_id: "remote_song_1",
    version_group_id: "local_remote",
    owner_user_id: "user_1",
    remote_version_group_id: "remote_song_1",
    sync_status: "synced",
    last_synced_at: "2026-09-18T00:00:00.000Z",
    remote_updated_at: "2026-09-18T00:00:00.000Z",
    last_synced_hash: "hash_before",
    title: "Remota",
    content: "G D",
    created_at: "2026-09-18T00:00:00.000Z",
    updated_at: "2026-09-18T00:00:00.000Z",
  }));

  await repository.updateSong("local_remote", {
    title: "Remota editada",
    artist: "",
    key: "",
    versionName: "",
    content: "G D Em",
    notes: "",
  });

  const syncRecord = await repository.getSyncRecord("local_remote");
  assert.equal(syncRecord.syncStatus, "dirty");
  assert.equal(syncRecord.syncError, null);
  assert.equal(syncRecord.remoteId, "remote_song_1");
  assert.equal(syncRecord.ownerUserId, "user_1");
});

test("LocalSongRepository deletes songs and reports not found", async () => {
  const repository = await createLocalSongRepository(new InMemoryLocalSongDatabase());
  const created = await repository.createSong(baseSong);

  await repository.deleteSong(created.id);

  await assert.rejects(() => repository.getSong(created.id), LocalSongNotFoundError);
  await assert.rejects(() => repository.deleteSong(created.id), LocalSongNotFoundError);
  await assert.rejects(() => repository.updateSong(created.id, baseSong), LocalSongNotFoundError);
});

test("LocalSongRepository tombstones synced songs instead of deleting them", async () => {
  const database = new InMemoryLocalSongDatabase();
  const repository = await createLocalSongRepository(database);
  database.rows.set("local_remote", localSongRow({
    id: "local_remote",
    remote_id: "remote_song_1",
    version_group_id: "local_remote",
    owner_user_id: "user_1",
    remote_version_group_id: "remote_song_1",
    sync_status: "synced",
    title: "Remota",
    content: "G D",
    created_at: "2026-09-18T00:00:00.000Z",
    updated_at: "2026-09-18T00:00:00.000Z",
  }));

  await repository.deleteSong("local_remote");

  await assert.rejects(() => repository.getSong("local_remote"), LocalSongNotFoundError);
  assert.deepEqual(await repository.listSongs(), []);

  const syncRecord = await repository.getSyncRecord("local_remote");
  assert.equal(syncRecord.syncStatus, "deleted");
  assert.equal(syncRecord.remoteId, "remote_song_1");
  assert.ok(syncRecord.deletedAt);
  assert.deepEqual(
    (await repository.listPendingSyncSongs("user_1")).map((item) => item.id),
    ["local_remote"],
  );
});

test("LocalSongRepository creates and lists versions within the local group", async () => {
  const repository = await createLocalSongRepository(new InMemoryLocalSongDatabase());
  const principal = await repository.createSong(baseSong);
  const versionValues: SongVersionCreateValues = {
    versionName: "Cae el sol en Em",
    content: "Em C G",
    key: "Em",
  };

  const version = await repository.createVersion(principal.id, versionValues);
  const versions = await repository.listVersions(version.id);
  const unchangedPrincipal = await repository.getSong(principal.id);

  assert.equal(version.title, principal.title);
  assert.equal(version.artist, principal.artist);
  assert.equal(version.notes, principal.notes);
  assert.equal(version.versionName, "Cae el sol en Em");
  assert.equal(version.key, "Em");
  assert.equal(version.content, "Em C G");
  assert.deepEqual(unchangedPrincipal, principal);
  assert.deepEqual(
    versions.map((item) => item.id),
    [principal.id, version.id],
  );
});

test("LocalSongRepository creates unsynced versions inside the source sync group", async () => {
  const database = new InMemoryLocalSongDatabase();
  const repository = await createLocalSongRepository(database);
  database.rows.set("local_remote", localSongRow({
    id: "local_remote",
    remote_id: "remote_song_1",
    version_group_id: "local_group_1",
    owner_user_id: "user_1",
    remote_version_group_id: "remote_group_1",
    sync_status: "synced",
    title: "Remota",
    content: "G D",
    created_at: "2026-09-18T00:00:00.000Z",
    updated_at: "2026-09-18T00:00:00.000Z",
  }));

  const version = await repository.createVersion("local_remote", {
    versionName: "Remota en A",
    content: "A E",
    key: "A",
  });
  const syncRecord = await repository.getSyncRecord(version.id);

  assert.equal(syncRecord.ownerUserId, "user_1");
  assert.equal(syncRecord.remoteVersionGroupId, "remote_group_1");
  assert.equal(syncRecord.versionGroupId, "local_group_1");
  assert.equal(syncRecord.remoteId, null);
  assert.equal(syncRecord.syncStatus, "local_only");
});

test("LocalSongRepository creates a default version from the source song", async () => {
  const repository = await createLocalSongRepository(new InMemoryLocalSongDatabase());
  const principal = await repository.createSong(baseSong);

  const version = await repository.createVersion(principal.id);

  assert.equal(version.content, principal.content);
  assert.equal(version.key, principal.key);
  assert.equal(version.versionName, "Cae el sol en C#m");
});

test("LocalSongRepository data persists when the repository is reopened over the same database", async () => {
  const database = new InMemoryLocalSongDatabase();
  const firstRepository = await createLocalSongRepository(database);
  const created = await firstRepository.createSong(baseSong);

  const reopenedRepository = await createLocalSongRepository(database);

  assert.equal((await reopenedRepository.getSong(created.id)).title, "Cae el sol");
  assert.equal((await reopenedRepository.listSongs()).length, 1);
  assert.equal((await reopenedRepository.getSyncRecord(created.id)).syncStatus, "local_only");
});

test("LocalSongRepository uses only the provided local database adapter", async () => {
  const database = new InMemoryLocalSongDatabase();
  const repository = await createLocalSongRepository(database);

  await repository.createSong(baseSong);

  assert.equal(database.rows.size, 1);
  assert.equal(database.execStatements.some((statement) => /CREATE TABLE/i.test(statement)), true);
});

test("LocalSongRepository prepares owner isolation queries without assigning anonymous songs", async () => {
  const database = new InMemoryLocalSongDatabase();
  const repository = await createLocalSongRepository(database);
  database.rows.set("anonymous", localSongRow({
    id: "anonymous",
    version_group_id: "anonymous",
    title: "Anónima",
    content: "C G",
    created_at: "2026-09-18T00:00:00.000Z",
    updated_at: "2026-09-18T00:00:01.000Z",
  }));
  database.rows.set("user_1_song", localSongRow({
    id: "user_1_song",
    remote_id: "remote_user_1",
    version_group_id: "user_1_song",
    owner_user_id: "user_1",
    remote_version_group_id: "remote_user_1",
    sync_status: "dirty",
    title: "Usuario 1",
    content: "D A",
    created_at: "2026-09-18T00:00:00.000Z",
    updated_at: "2026-09-18T00:00:02.000Z",
  }));
  database.rows.set("user_2_song", localSongRow({
    id: "user_2_song",
    remote_id: "remote_user_2",
    version_group_id: "user_2_song",
    owner_user_id: "user_2",
    remote_version_group_id: "remote_user_2",
    sync_status: "dirty",
    title: "Usuario 2",
    content: "E B",
    created_at: "2026-09-18T00:00:00.000Z",
    updated_at: "2026-09-18T00:00:03.000Z",
  }));

  assert.deepEqual(
    (await repository.listSongsVisibleToOwner(null)).map((item) => item.id),
    ["anonymous"],
  );
  assert.deepEqual(
    (await repository.listSongsVisibleToOwner("user_1")).map((item) => item.id),
    ["user_1_song", "anonymous"],
  );
  assert.deepEqual(
    (await repository.listPendingSyncSongs("user_1")).map((item) => item.id),
    ["user_1_song"],
  );
  assert.equal((await repository.getSyncRecord("anonymous")).ownerUserId, null);
});
