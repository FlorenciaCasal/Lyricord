import type { SongDetail, SongFormValues, SongListItem, SongVersionCreateValues, SongVersionItem } from "../../../types";
import type { SongRepository } from "../SongRepository";
import type { LocalSongDatabase, LocalSongDatabaseConnection } from "./LocalSongDatabase";
import { createLocalSongId } from "./ids.ts";
import { migrateLocalSongDatabase } from "./migrations.ts";

export type LocalSongSyncStatus = "local_only" | "synced" | "dirty" | "deleted" | "conflict" | "error";

type LocalSongRow = {
  id: string;
  remote_id: string | null;
  version_group_id: string;
  owner_user_id: string | null;
  remote_version_group_id: string | null;
  sync_status: LocalSongSyncStatus;
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

type CountRow = {
  count: number;
};

export type AnonymousSongSummary = {
  songCount: number;
  groupCount: number;
};

export type SongDeletionPlan = {
  isPrincipal: boolean;
  affectedCount: number;
  versionCount: number;
};

type AnonymousSongSummaryRow = {
  song_count: number;
  group_count: number;
};

export type LocalSongSyncRecord = SongDetail & {
  remoteId: string | null;
  versionGroupId: string;
  ownerUserId: string | null;
  remoteVersionGroupId: string | null;
  syncStatus: LocalSongSyncStatus;
  syncError: string | null;
  lastSyncedAt: string | null;
  remoteUpdatedAt: string | null;
  lastSyncedHash: string | null;
  deletedAt: string | null;
};

export class LocalSongNotFoundError extends Error {
  constructor(id: string) {
    super(`Song not found: ${id}`);
    this.name = "LocalSongNotFoundError";
  }
}

export class LocalSongLimitReachedError extends Error {
  readonly limit: number;

  constructor(limit: number) {
    super(`Tu plan permite hasta ${limit} canciones y versiones. Podés seguir editando o eliminar las que ya tenés.`);
    this.name = "LocalSongLimitReachedError";
    this.limit = limit;
  }
}

export class AnonymousSongCapacityError extends Error {
  readonly missingPlaces: number;

  constructor(missingPlaces: number) {
    super(`Necesitás ${missingPlaces === 1 ? "1 lugar más" : `${missingPlaces} lugares más`} para vincular todo el repertorio.`);
    this.name = "AnonymousSongCapacityError";
    this.missingPlaces = missingPlaces;
  }
}

export class LocalSongCapacityUnknownError extends Error {
  constructor() {
    super("Necesitás conexión para comprobar si hay espacio disponible en tu cuenta. Tus canciones existentes siguen disponibles.");
    this.name = "LocalSongCapacityUnknownError";
  }
}

function optionalText(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeFormValues(values: SongFormValues) {
  return {
    title: values.title.trim(),
    artist: optionalText(values.artist),
    key: optionalText(values.key),
    versionName: optionalText(values.versionName),
    content: values.content,
    notes: optionalText(values.notes),
  };
}

function toListItem(row: LocalSongRow): SongListItem {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    key: row.song_key,
    versionName: row.version_name,
    updatedAt: row.updated_at,
  };
}

function toVersionItem(row: LocalSongRow): SongVersionItem {
  return {
    id: row.id,
    title: row.title,
    versionName: row.version_name,
    updatedAt: row.updated_at,
  };
}

function toDetail(row: LocalSongRow): SongDetail {
  return {
    ...toListItem(row),
    content: row.content,
    notes: row.notes,
  };
}

function toSyncRecord(row: LocalSongRow): LocalSongSyncRecord {
  return {
    ...toDetail(row),
    remoteId: row.remote_id,
    versionGroupId: row.version_group_id,
    ownerUserId: row.owner_user_id,
    remoteVersionGroupId: row.remote_version_group_id,
    syncStatus: row.sync_status,
    syncError: row.sync_error,
    lastSyncedAt: row.last_synced_at,
    remoteUpdatedAt: row.remote_updated_at,
    lastSyncedHash: row.last_synced_hash,
    deletedAt: row.deleted_at,
  };
}

function defaultVersionName(source: LocalSongRow, key: string | null, existingVersionCount: number) {
  if (key) return `${source.title} en ${key}`;
  return `${source.title} - versión ${existingVersionCount + 1}`;
}

function getPendingUpdateStatus(row: LocalSongRow): LocalSongSyncStatus {
  if (row.sync_status === "conflict") return "conflict";
  return row.remote_id ? "dirty" : "local_only";
}

async function runInTransaction<T>(
  database: LocalSongDatabase,
  task: (transaction: LocalSongDatabaseConnection) => Promise<T>,
) {
  if (database.transactionAsync) return database.transactionAsync(task);

  await database.execAsync("BEGIN IMMEDIATE");
  try {
    const result = await task(database);
    await database.execAsync("COMMIT");
    return result;
  } catch (error) {
    await database.execAsync("ROLLBACK");
    throw error;
  }
}

export async function createLocalSongRepository(database: LocalSongDatabase): Promise<LocalSongRepository> {
  await migrateLocalSongDatabase(database);
  return new LocalSongRepository(database);
}

export class LocalSongRepository implements SongRepository {
  private readonly database: LocalSongDatabase;
  private readonly ownerUserId: string | null | undefined;
  private readonly maxActiveRecords: number | null;
  private readonly knownRemoteActiveRecords: number | null;

  constructor(
    database: LocalSongDatabase,
    ownerUserId?: string | null,
    maxActiveRecords: number | null = null,
    knownRemoteActiveRecords: number | null = null,
  ) {
    this.database = database;
    this.ownerUserId = ownerUserId;
    this.maxActiveRecords = maxActiveRecords;
    this.knownRemoteActiveRecords = knownRemoteActiveRecords;
  }

  forOwner(
    ownerUserId: string | null,
    maxActiveRecords: number | null = null,
    knownRemoteActiveRecords: number | null = null,
  ) {
    return new LocalSongRepository(this.database, ownerUserId, maxActiveRecords, knownRemoteActiveRecords);
  }

  async listSongs() {
    if (this.ownerUserId !== undefined) {
      return this.listSongsVisibleToOwner(this.ownerUserId);
    }

    const rows = await this.database.getAllAsync<LocalSongRow>(
      `SELECT * FROM local_songs WHERE deleted_at IS NULL ORDER BY updated_at DESC, id DESC`,
    );
    return rows.map(toListItem);
  }

  async getSong(id: string) {
    return toDetail(await this.requireSongRow(id));
  }

  async createSong(values: SongFormValues) {
    const input = normalizeFormValues(values);
    const now = new Date().toISOString();
    const id = createLocalSongId();

    await runInTransaction(this.database, async (transaction) => {
      await this.assertCreationCapacity(transaction, this.ownerUserId ?? null);
      await transaction.runAsync(
        `INSERT INTO local_songs (
        id,
        remote_id,
        version_group_id,
        owner_user_id,
        remote_version_group_id,
        sync_status,
        sync_error,
        last_synced_at,
        remote_updated_at,
        last_synced_hash,
        deleted_at,
        title,
        artist,
        song_key,
        content,
        notes,
        version_name,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      null,
      id,
      this.ownerUserId ?? null,
      null,
      "local_only",
      null,
      null,
      null,
      null,
      null,
      input.title,
      input.artist,
      input.key,
      input.content,
      input.notes,
      input.versionName,
        now,
        now,
      );
    });

    return this.getSong(id);
  }

  async updateSong(id: string, values: SongFormValues) {
    const existing = await this.requireSongRow(id);
    const input = normalizeFormValues(values);
    const now = new Date().toISOString();
    const syncStatus = getPendingUpdateStatus(existing);

    const result = await this.database.runAsync(
      `UPDATE local_songs
        SET title = ?,
            artist = ?,
            song_key = ?,
            content = ?,
            notes = ?,
            version_name = ?,
            sync_status = ?,
            sync_error = ?,
            updated_at = ?
        WHERE id = ? AND deleted_at IS NULL`,
      input.title,
      input.artist,
      input.key,
      input.content,
      input.notes,
      input.versionName,
      syncStatus,
      null,
      now,
      id,
    );

    if (result.changes === 0) throw new LocalSongNotFoundError(id);
    return this.getSong(id);
  }

  async deleteSong(id: string) {
    const existing = await this.requireSongRow(id);
    const isPrincipal = existing.version_group_id === existing.id;

    if (isPrincipal) {
      const plan = await this.getDeletionPlan(id);
      const now = new Date().toISOString();

      await runInTransaction(this.database, async (transaction) => {
        const removedLocalOnly = await transaction.runAsync(
          `DELETE FROM local_songs
            WHERE version_group_id = ?
              AND owner_user_id IS ?
              AND remote_id IS NULL
              AND deleted_at IS NULL`,
          existing.version_group_id,
          existing.owner_user_id,
        );
        const tombstonedSynced = await transaction.runAsync(
          `UPDATE local_songs
            SET sync_status = 'deleted',
                sync_error = NULL,
                deleted_at = ?,
                updated_at = ?
            WHERE version_group_id = ?
              AND owner_user_id IS ?
              AND remote_id IS NOT NULL
              AND deleted_at IS NULL`,
          now,
          now,
          existing.version_group_id,
          existing.owner_user_id,
        );

        if (removedLocalOnly.changes + tombstonedSynced.changes !== plan.affectedCount) {
          throw new Error("El grupo de versiones cambió mientras se eliminaba.");
        }
      });
      return;
    }

    let result: { changes: number };

    if (existing.remote_id) {
      const now = new Date().toISOString();
      result = await this.database.runAsync(
        `UPDATE local_songs
          SET sync_status = ?,
              sync_error = ?,
              deleted_at = ?,
              updated_at = ?
          WHERE id = ? AND deleted_at IS NULL`,
        "deleted",
        null,
        now,
        now,
        id,
      );
    } else {
      result = await this.database.runAsync(`DELETE FROM local_songs WHERE id = ?`, id);
    }

    if (result.changes === 0) throw new LocalSongNotFoundError(id);
  }

  async getDeletionPlan(id: string): Promise<SongDeletionPlan> {
    const source = await this.requireSongRow(id);
    const isPrincipal = source.version_group_id === source.id;
    if (!isPrincipal) {
      return { isPrincipal: false, affectedCount: 1, versionCount: 0 };
    }

    const row = await this.database.getFirstAsync<CountRow>(
      `SELECT COUNT(*) AS count
        FROM local_songs
        WHERE version_group_id = ?
          AND owner_user_id IS ?
          AND deleted_at IS NULL`,
      source.version_group_id,
      source.owner_user_id,
    );
    const affectedCount = row?.count ?? 0;
    return {
      isPrincipal: true,
      affectedCount,
      versionCount: Math.max(0, affectedCount - 1),
    };
  }

  async listVersions(id: string) {
    const source = await this.requireSongRow(id);
    const { clause, params } = this.ownerClause();
    const rows = await this.database.getAllAsync<LocalSongRow>(
      `SELECT * FROM local_songs
        WHERE version_group_id = ? AND deleted_at IS NULL${clause}
        ORDER BY created_at ASC, updated_at DESC`,
      source.version_group_id,
      ...params,
    );
    return rows.map(toVersionItem);
  }

  async createVersion(id: string, values?: SongVersionCreateValues) {
    const source = await this.requireSongRow(id);
    const now = new Date().toISOString();
    const versionId = createLocalSongId();
    const key = values ? optionalText(values.key) : source.song_key;
    const content = values?.content ?? source.content;
    await runInTransaction(this.database, async (transaction) => {
      await this.assertCreationCapacity(transaction, source.owner_user_id);
      const existing = await transaction.getFirstAsync<CountRow>(
        `SELECT COUNT(*) AS count FROM local_songs WHERE version_group_id = ? AND deleted_at IS NULL`,
        source.version_group_id,
      );
      const versionName = optionalText(values?.versionName ?? "") ?? defaultVersionName(source, key, existing?.count ?? 0);
      await transaction.runAsync(
        `INSERT INTO local_songs (
        id,
        remote_id,
        version_group_id,
        owner_user_id,
        remote_version_group_id,
        sync_status,
        sync_error,
        last_synced_at,
        remote_updated_at,
        last_synced_hash,
        deleted_at,
        title,
        artist,
        song_key,
        content,
        notes,
        version_name,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      versionId,
      null,
      source.version_group_id,
      source.owner_user_id,
      source.remote_version_group_id,
      "local_only",
      null,
      null,
      null,
      null,
      null,
      source.title,
      source.artist,
      key,
      content,
      source.notes,
      versionName,
        now,
        now,
      );
    });

    return this.getSong(versionId);
  }

  async listSongsVisibleToOwner(ownerUserId: string | null) {
    const rows = ownerUserId
      ? await this.database.getAllAsync<LocalSongRow>(
          `SELECT * FROM local_songs
            WHERE deleted_at IS NULL AND (owner_user_id IS NULL OR owner_user_id = ?)
            ORDER BY updated_at DESC, id DESC`,
          ownerUserId,
        )
      : await this.database.getAllAsync<LocalSongRow>(
          `SELECT * FROM local_songs
            WHERE deleted_at IS NULL AND owner_user_id IS NULL
            ORDER BY updated_at DESC, id DESC`,
        );

    return rows.map(toListItem);
  }

  async getAnonymousSongSummary(): Promise<AnonymousSongSummary> {
    const row = await this.database.getFirstAsync<AnonymousSongSummaryRow>(
      `SELECT
        COUNT(*) AS song_count,
        COUNT(DISTINCT version_group_id) AS group_count
      FROM local_songs
      WHERE owner_user_id IS NULL
        AND remote_id IS NULL
        AND deleted_at IS NULL`,
    );

    return {
      songCount: row?.song_count ?? 0,
      groupCount: row?.group_count ?? 0,
    };
  }

  async linkAnonymousSongsToOwner(
    ownerUserId: string,
    capacity?: { maxSongs: number | null; remoteActive: number },
  ) {
    const normalizedOwner = ownerUserId.trim();
    if (!normalizedOwner) throw new Error("Necesitás iniciar sesión para guardar las canciones en tu cuenta.");

    return runInTransaction(this.database, async (transaction) => {
      const anonymous = await transaction.getFirstAsync<CountRow>(
        `SELECT COUNT(*) AS count FROM local_songs
          WHERE owner_user_id IS NULL AND remote_id IS NULL AND deleted_at IS NULL`,
      );
      const anonymousCount = anonymous?.count ?? 0;
      if (capacity?.maxSongs !== null && capacity?.maxSongs !== undefined) {
        const ownedUnsynced = await transaction.getFirstAsync<CountRow>(
          `SELECT COUNT(*) AS count FROM local_songs
            WHERE owner_user_id = ? AND remote_id IS NULL AND deleted_at IS NULL`,
          normalizedOwner,
        );
        const projected = capacity.remoteActive + (ownedUnsynced?.count ?? 0) + anonymousCount;
        if (projected > capacity.maxSongs) {
          throw new AnonymousSongCapacityError(projected - capacity.maxSongs);
        }
      }

      const result = await transaction.runAsync(
        `UPDATE local_songs
          SET owner_user_id = ?,
              sync_status = 'local_only',
              sync_error = NULL
          WHERE owner_user_id IS NULL
            AND remote_id IS NULL
            AND deleted_at IS NULL`,
        normalizedOwner,
      );
      if (result.changes !== anonymousCount) {
        throw new Error("El repertorio local cambió mientras se vinculaba.");
      }
      return { linkedCount: result.changes };
    });
  }

  async getOwnedUnsyncedSongCount(ownerUserId: string) {
    const row = await this.database.getFirstAsync<CountRow>(
      `SELECT COUNT(*) AS count
        FROM local_songs
        WHERE owner_user_id = ?
          AND remote_id IS NULL
          AND deleted_at IS NULL`,
      ownerUserId,
    );
    return row?.count ?? 0;
  }

  async listPendingSyncSongs(ownerUserId: string) {
    const rows = await this.database.getAllAsync<LocalSongRow>(
      `SELECT * FROM local_songs
        WHERE sync_status IN (?, ?, ?, ?)
          AND owner_user_id = ?
        ORDER BY updated_at ASC, id ASC`,
      "local_only",
      "dirty",
      "deleted",
      "error",
      ownerUserId,
    );

    return rows.map(toSyncRecord);
  }

  async getSyncRecord(id: string) {
    return toSyncRecord(await this.requireSongRow(id, { includeDeleted: true }));
  }

  private async requireSongRow(id: string, options: { includeDeleted?: boolean } = {}) {
    const { clause, params } = this.ownerClause();
    const row = await this.database.getFirstAsync<LocalSongRow>(
      options.includeDeleted
        ? `SELECT * FROM local_songs WHERE id = ?${clause}`
        : `SELECT * FROM local_songs WHERE id = ? AND deleted_at IS NULL${clause}`,
      id,
      ...params,
    );
    if (!row) throw new LocalSongNotFoundError(id);
    return row;
  }

  private ownerClause() {
    if (this.ownerUserId === undefined) return { clause: "", params: [] as string[] };
    if (this.ownerUserId === null) {
      return { clause: " AND owner_user_id IS NULL", params: [] as string[] };
    }
    return {
      clause: " AND (owner_user_id IS NULL OR owner_user_id = ?)",
      params: [this.ownerUserId],
    };
  }

  private async assertCreationCapacity(transaction: LocalSongDatabaseConnection, ownerUserId: string | null) {
    const effectiveLimit = ownerUserId === null ? 10 : this.maxActiveRecords;
    if (effectiveLimit === null) return;

    if (ownerUserId === null) {
      const row = await transaction.getFirstAsync<CountRow>(
        `SELECT COUNT(*) AS count
          FROM local_songs
          WHERE owner_user_id IS ?
            AND deleted_at IS NULL`,
        null,
      );
      if ((row?.count ?? 0) >= effectiveLimit) throw new LocalSongLimitReachedError(effectiveLimit);
      return;
    }

    if (this.knownRemoteActiveRecords === null) throw new LocalSongCapacityUnknownError();

    const [synced, unsynced] = await Promise.all([
      transaction.getFirstAsync<CountRow>(
        `SELECT COUNT(*) AS count FROM local_songs
          WHERE owner_user_id = ? AND remote_id IS NOT NULL AND deleted_at IS NULL`,
        ownerUserId,
      ),
      transaction.getFirstAsync<CountRow>(
        `SELECT COUNT(*) AS count FROM local_songs
          WHERE owner_user_id = ? AND remote_id IS NULL AND deleted_at IS NULL`,
        ownerUserId,
      ),
    ]);
    const projectedActiveRecords = Math.max(this.knownRemoteActiveRecords, synced?.count ?? 0) + (unsynced?.count ?? 0);
    if (projectedActiveRecords >= effectiveLimit) {
      throw new LocalSongLimitReachedError(effectiveLimit);
    }
  }
}
