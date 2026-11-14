import assert from "node:assert/strict";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import test from "node:test";
import {
  createLocalSongRepository,
  LocalSongNotFoundError,
} from "../mobile/src/data/songs/local/LocalSongRepository.ts";
import type {
  LocalSongDatabase,
  LocalSongDatabaseConnection,
} from "../mobile/src/data/songs/local/LocalSongDatabase.ts";
import type { SongFormValues } from "../mobile/src/types.ts";

const OWNER_1 = "owner_1";
const OWNER_2 = "owner_2";

class NodeLocalSongDatabase implements LocalSongDatabase {
  readonly sqlite = new DatabaseSync(":memory:");
  failGroupTombstone = false;

  async execAsync(source: string) {
    this.sqlite.exec(source);
  }

  async runAsync(source: string, ...params: unknown[]) {
    if (this.failGroupTombstone && /UPDATE local_songs[\s\S]*version_group_id = \?/i.test(source)) {
      throw new Error("SIMULATED_GROUP_DELETE_FAILURE");
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

function song(title: string): SongFormValues {
  return {
    title,
    artist: "",
    key: "C",
    versionName: "",
    content: "C G\nLetra",
    notes: "",
  };
}

async function markSynced(database: LocalSongDatabase, id: string, remoteId: string) {
  await database.runAsync(
    `UPDATE local_songs
      SET remote_id = ?,
          remote_version_group_id = ?,
          sync_status = 'synced',
          remote_updated_at = updated_at,
          last_synced_at = updated_at
      WHERE id = ?`,
    remoteId,
    remoteId,
    id,
  );
}

async function rows(database: LocalSongDatabase) {
  return database.getAllAsync<{
    id: string;
    owner_user_id: string | null;
    version_group_id: string;
    remote_id: string | null;
    sync_status: string;
    deleted_at: string | null;
  }>(`SELECT id, owner_user_id, version_group_id, remote_id, sync_status, deleted_at FROM local_songs ORDER BY id`);
}

test("deleting a synced principal tombstones it and all its synced versions", async () => {
  const database = new NodeLocalSongDatabase();
  try {
    const repository = (await createLocalSongRepository(database)).forOwner(OWNER_1);
    const principal = await repository.createSong(song("Grupo sincronizado"));
    const first = await repository.createVersion(principal.id, { versionName: "En D", key: "D", content: "D A" });
    const second = await repository.createVersion(principal.id, { versionName: "En E", key: "E", content: "E B" });
    await markSynced(database, principal.id, "remote_principal");
    await markSynced(database, first.id, "remote_first");
    await markSynced(database, second.id, "remote_second");

    assert.deepEqual(await repository.getDeletionPlan(principal.id), {
      isPrincipal: true,
      affectedCount: 3,
      versionCount: 2,
    });
    await repository.deleteSong(principal.id);

    const stored = await rows(database);
    assert.equal(stored.length, 3);
    assert.ok(stored.every((row) => row.sync_status === "deleted" && row.deleted_at));
  } finally {
    database.close();
  }
});

test("deleting a mixed group tombstones synced rows and removes local-only rows", async () => {
  const database = new NodeLocalSongDatabase();
  try {
    const repository = (await createLocalSongRepository(database)).forOwner(OWNER_1);
    const principal = await repository.createSong(song("Grupo mixto"));
    const syncedVersion = await repository.createVersion(principal.id, { versionName: "Sincronizada", key: "D", content: "D" });
    const localVersion = await repository.createVersion(principal.id, { versionName: "Local", key: "E", content: "E" });
    await markSynced(database, principal.id, "remote_principal");
    await markSynced(database, syncedVersion.id, "remote_version");

    await repository.deleteSong(principal.id);

    const stored = await rows(database);
    assert.deepEqual(stored.map((row) => row.id).sort(), [principal.id, syncedVersion.id].sort());
    assert.ok(stored.every((row) => row.sync_status === "deleted" && row.deleted_at));
    assert.ok(!stored.some((row) => row.id === localVersion.id));
  } finally {
    database.close();
  }
});

test("deleting a fully local group physically removes every row", async () => {
  const database = new NodeLocalSongDatabase();
  try {
    const repository = (await createLocalSongRepository(database)).forOwner(null);
    const principal = await repository.createSong(song("Grupo anonimo"));
    await repository.createVersion(principal.id, { versionName: "Version local", key: "D", content: "D" });

    await repository.deleteSong(principal.id);

    assert.deepEqual(await rows(database), []);
  } finally {
    database.close();
  }
});

test("deleting one version preserves its principal and sibling", async () => {
  const database = new NodeLocalSongDatabase();
  try {
    const repository = (await createLocalSongRepository(database)).forOwner(OWNER_1);
    const principal = await repository.createSong(song("Principal"));
    const selected = await repository.createVersion(principal.id, { versionName: "Borrar", key: "D", content: "D" });
    const sibling = await repository.createVersion(principal.id, { versionName: "Conservar", key: "E", content: "E" });
    await markSynced(database, selected.id, "remote_selected");

    assert.deepEqual(await repository.getDeletionPlan(selected.id), {
      isPrincipal: false,
      affectedCount: 1,
      versionCount: 0,
    });
    await repository.deleteSong(selected.id);

    assert.equal((await repository.getSong(principal.id)).id, principal.id);
    assert.equal((await repository.getSong(sibling.id)).id, sibling.id);
    await assert.rejects(() => repository.getSong(selected.id), LocalSongNotFoundError);
  } finally {
    database.close();
  }
});

test("group deletion isolates the exact owner and version group", async () => {
  const database = new NodeLocalSongDatabase();
  try {
    const root = await createLocalSongRepository(database);
    const ownerOne = root.forOwner(OWNER_1);
    const ownerTwo = root.forOwner(OWNER_2);
    const anonymous = root.forOwner(null);
    const principal = await ownerOne.createSong(song("Owner one"));
    const ownVersion = await ownerOne.createVersion(principal.id, { versionName: "Own", key: "D", content: "D" });
    const foreign = await ownerTwo.createSong(song("Owner two"));
    const guest = await anonymous.createSong(song("Guest"));
    await database.runAsync(`UPDATE local_songs SET version_group_id = ? WHERE id IN (?, ?)`, principal.id, foreign.id, guest.id);
    await markSynced(database, principal.id, "remote_principal");
    await markSynced(database, ownVersion.id, "remote_version");

    await ownerOne.deleteSong(principal.id);

    const stored = await rows(database);
    assert.equal(stored.find((row) => row.id === foreign.id)?.deleted_at, null);
    assert.equal(stored.find((row) => row.id === guest.id)?.deleted_at, null);
    assert.ok(stored.find((row) => row.id === principal.id)?.deleted_at);
    assert.ok(stored.find((row) => row.id === ownVersion.id)?.deleted_at);
  } finally {
    database.close();
  }
});

test("group deletion rolls back physical removals when tombstoning fails", async () => {
  const database = new NodeLocalSongDatabase();
  try {
    const repository = (await createLocalSongRepository(database)).forOwner(OWNER_1);
    const principal = await repository.createSong(song("Rollback"));
    const localVersion = await repository.createVersion(principal.id, { versionName: "Local", key: "D", content: "D" });
    await markSynced(database, principal.id, "remote_principal");
    database.failGroupTombstone = true;

    await assert.rejects(() => repository.deleteSong(principal.id), /SIMULATED_GROUP_DELETE_FAILURE/);

    const stored = await rows(database);
    assert.equal(stored.length, 2);
    assert.equal(stored.find((row) => row.id === principal.id)?.deleted_at, null);
    assert.equal(stored.find((row) => row.id === localVersion.id)?.deleted_at, null);
  } finally {
    database.close();
  }
});
