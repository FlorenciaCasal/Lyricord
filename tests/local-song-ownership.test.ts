import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import test from "node:test";
import {
  AnonymousSongCapacityError,
  createLocalSongRepository,
  type LocalSongSyncRecord,
} from "../mobile/src/data/songs/local/LocalSongRepository.ts";
import type { LocalSongDatabase } from "../mobile/src/data/songs/local/LocalSongDatabase.ts";
import type { SongFormValues } from "../mobile/src/types.ts";

const OWNER_1 = "user_1";
const OWNER_2 = "user_2";

class NodeLocalSongDatabase implements LocalSongDatabase {
  readonly sqlite: DatabaseSync;

  constructor(path = ":memory:") {
    this.sqlite = new DatabaseSync(path);
  }

  async execAsync(source: string) {
    this.sqlite.exec(source);
  }

  async runAsync(source: string, ...params: unknown[]) {
    const result = this.sqlite.prepare(source).run(...params as SQLInputValue[]);
    return { changes: Number(result.changes) };
  }

  async getFirstAsync<T>(source: string, ...params: unknown[]) {
    return (this.sqlite.prepare(source).get(...params as SQLInputValue[]) as T | undefined) ?? null;
  }

  async getAllAsync<T>(source: string, ...params: unknown[]) {
    return this.sqlite.prepare(source).all(...params as SQLInputValue[]) as T[];
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

test("linking anonymous songs preserves ids, content and version relationships", async () => {
  const database = new NodeLocalSongDatabase();
  try {
    const repository = await createLocalSongRepository(database);
    const principal = await repository.createSong(song("Local"));
    const version = await repository.createVersion(principal.id, {
      versionName: "Local en D",
      key: "D",
      content: "D A\nLetra",
    });
    await repository.forOwner(OWNER_2).createSong(song("Privada de otra cuenta"));

    assert.deepEqual(await repository.getAnonymousSongSummary(), { songCount: 2, groupCount: 1 });
    assert.deepEqual(await repository.linkAnonymousSongsToOwner(OWNER_1), { linkedCount: 2 });

    const linkedPrincipal = await repository.getSyncRecord(principal.id);
    const linkedVersion = await repository.getSyncRecord(version.id);
    assert.equal(linkedPrincipal.ownerUserId, OWNER_1);
    assert.equal(linkedVersion.ownerUserId, OWNER_1);
    assert.equal(linkedPrincipal.id, principal.id);
    assert.equal(linkedVersion.id, version.id);
    assert.equal(linkedVersion.versionGroupId, linkedPrincipal.versionGroupId);
    assert.equal(linkedVersion.content, "D A\nLetra");
    assert.equal(linkedPrincipal.syncStatus, "local_only");
    assert.equal(linkedVersion.syncStatus, "local_only");
    assert.deepEqual(
      (await repository.listPendingSyncSongs(OWNER_1)).map(({ id }) => id).sort(),
      [principal.id, version.id].sort(),
    );
  } finally {
    database.close();
  }
});

test("linking is idempotent and never reassigns another account songs", async () => {
  const database = new NodeLocalSongDatabase();
  try {
    const repository = await createLocalSongRepository(database);
    const anonymous = await repository.createSong(song("Anónima"));
    const foreign = await repository.forOwner(OWNER_2).createSong(song("Ajena"));

    assert.deepEqual(await repository.linkAnonymousSongsToOwner(OWNER_1), { linkedCount: 1 });
    assert.deepEqual(await repository.linkAnonymousSongsToOwner(OWNER_1), { linkedCount: 0 });
    assert.equal((await repository.getSyncRecord(anonymous.id)).ownerUserId, OWNER_1);
    assert.equal((await repository.getSyncRecord(foreign.id)).ownerUserId, OWNER_2);

    assert.deepEqual((await repository.forOwner(OWNER_1).listSongs()).map(({ id }) => id), [anonymous.id]);
    assert.deepEqual((await repository.forOwner(OWNER_2).listSongs()).map(({ id }) => id), [foreign.id]);
    assert.deepEqual(await repository.forOwner(null).listSongs(), []);
    await assert.rejects(() => repository.forOwner(OWNER_1).getSong(foreign.id));
    await assert.rejects(() => repository.forOwner(OWNER_2).getSong(anonymous.id));
  } finally {
    database.close();
  }
});

test("linking is all-or-nothing when a Free account lacks capacity", async () => {
  const database = new NodeLocalSongDatabase();
  try {
    const repository = await createLocalSongRepository(database);
    const principal = await repository.createSong(song("Anónima"));
    const version = await repository.createVersion(principal.id, {
      versionName: "Versión anónima",
      key: "D",
      content: "D A",
    });

    await assert.rejects(
      repository.linkAnonymousSongsToOwner(OWNER_1, { maxSongs: 10, remoteActive: 9 }),
      AnonymousSongCapacityError,
    );
    assert.equal((await repository.getSyncRecord(principal.id)).ownerUserId, null);
    assert.equal((await repository.getSyncRecord(version.id)).ownerUserId, null);
    assert.deepEqual(await repository.getAnonymousSongSummary(), { songCount: 2, groupCount: 1 });

    assert.deepEqual(
      await repository.linkAnonymousSongsToOwner(OWNER_1, { maxSongs: 10, remoteActive: 8 }),
      { linkedCount: 2 },
    );
  } finally {
    database.close();
  }
});

test("linked ownership persists after reopening and stays private after logout", async () => {
  const directory = mkdtempSync(join(tmpdir(), "musum-owner-"));
  const path = join(directory, "songs.sqlite");
  let database = new NodeLocalSongDatabase(path);

  try {
    const repository = await createLocalSongRepository(database);
    const principal = await repository.createSong(song("Persistente"));
    await repository.linkAnonymousSongsToOwner(OWNER_1);
    database.close();

    database = new NodeLocalSongDatabase(path);
    const reopened = await createLocalSongRepository(database);

    assert.deepEqual(await reopened.forOwner(null).listSongs(), []);
    assert.deepEqual(await reopened.forOwner(OWNER_2).listSongs(), []);
    assert.deepEqual((await reopened.forOwner(OWNER_1).listSongs()).map(({ id }) => id), [principal.id]);
    assert.equal((await reopened.getSyncRecord(principal.id) as LocalSongSyncRecord).ownerUserId, OWNER_1);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
