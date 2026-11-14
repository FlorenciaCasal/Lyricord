import type { LocalSongDatabase, LocalSongDatabaseConnection } from "../local/LocalSongDatabase.ts";
import { createLocalSongId } from "../local/ids.ts";
import { hashRemoteSong } from "./hash.ts";
import type {
  ApplyRemoteSongResult,
  LocalSongSyncRecord,
  LocalSongSyncStatus,
  RemoteSongSyncRecord,
  RecoverSongConflictResult,
  SongSyncDeletionConflict,
  SongSyncDeletionConflictKind,
  SongSyncStore,
} from "./types.ts";

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

type SongSyncPreviewRow = {
  pending_total: number;
  new_count: number;
  changed_count: number;
  deleted_count: number;
  error_count: number;
  version_count: number;
  anonymous_excluded_count: number;
};

type DeletionConflictRow = {
  id: string;
  owner_user_id: string;
  local_song_id: string;
  kind: SongSyncDeletionConflictKind;
  remote_songs_json: string;
  created_at: string;
  updated_at: string;
};

export type SongSyncPreview = {
  pendingTotal: number;
  newCount: number;
  changedCount: number;
  deletedCount: number;
  errorCount: number;
  versionCount: number;
  anonymousExcludedCount: number;
};

function toRecord(row: LocalSongRow): LocalSongSyncRecord {
  return {
    id: row.id,
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
    title: row.title,
    artist: row.artist,
    key: row.song_key,
    content: row.content,
    notes: row.notes,
    versionName: row.version_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isPendingLocalChange(status: LocalSongSyncStatus) {
  return status === "local_only" || status === "dirty" || status === "deleted" || status === "error";
}

function hasSameContent(local: LocalSongSyncRecord, remote: RemoteSongSyncRecord) {
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

function recoveredVersionName(local: LocalSongSyncRecord) {
  if (local.versionGroupId === local.id) return "Copia recuperada";
  const name = local.versionName?.trim();
  if (!name || name === "Principal") return "Copia recuperada";
  return name.endsWith("(copia recuperada)") ? name : `${name} (copia recuperada)`;
}

function deletionConflictId(kind: SongSyncDeletionConflictKind, ownerUserId: string, localSongId: string) {
  return `${kind}:${ownerUserId}:${localSongId}`;
}

function remoteGroupKey(remote: RemoteSongSyncRecord) {
  return remote.versionGroupId ?? remote.id;
}

function toDeletionConflict(row: DeletionConflictRow): SongSyncDeletionConflict {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    localSongId: row.local_song_id,
    kind: row.kind,
    remoteSongs: JSON.parse(row.remote_songs_json) as RemoteSongSyncRecord[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

export class SQLiteSongSyncStore implements SongSyncStore {
  private readonly database: LocalSongDatabase;

  constructor(database: LocalSongDatabase) {
    this.database = database;
  }

  async getPreview(ownerUserId: string): Promise<SongSyncPreview> {
    const row = await this.database.getFirstAsync<SongSyncPreviewRow>(
      `SELECT
        SUM(CASE
          WHEN owner_user_id = ? AND sync_status IN ('local_only', 'dirty', 'deleted', 'error') THEN 1
          ELSE 0
        END) AS pending_total,
        SUM(CASE
          WHEN owner_user_id = ?
            AND sync_status IN ('local_only', 'dirty', 'error')
            AND remote_id IS NULL THEN 1
          ELSE 0
        END) AS new_count,
        SUM(CASE
          WHEN owner_user_id = ?
            AND sync_status IN ('local_only', 'dirty', 'error')
            AND remote_id IS NOT NULL THEN 1
          ELSE 0
        END) AS changed_count,
        SUM(CASE
          WHEN owner_user_id = ? AND sync_status = 'deleted' THEN 1
          ELSE 0
        END) AS deleted_count,
        SUM(CASE
          WHEN owner_user_id = ? AND sync_status = 'error' THEN 1
          ELSE 0
        END) AS error_count,
        SUM(CASE
          WHEN owner_user_id = ?
            AND sync_status IN ('local_only', 'dirty', 'deleted', 'error')
            AND version_group_id <> id THEN 1
          ELSE 0
        END) AS version_count,
        SUM(CASE
          WHEN owner_user_id IS NULL AND deleted_at IS NULL THEN 1
          ELSE 0
        END) AS anonymous_excluded_count
      FROM local_songs`,
      ownerUserId,
      ownerUserId,
      ownerUserId,
      ownerUserId,
      ownerUserId,
      ownerUserId,
    );

    return {
      pendingTotal: row?.pending_total ?? 0,
      newCount: row?.new_count ?? 0,
      changedCount: row?.changed_count ?? 0,
      deletedCount: row?.deleted_count ?? 0,
      errorCount: row?.error_count ?? 0,
      versionCount: row?.version_count ?? 0,
      anonymousExcludedCount: row?.anonymous_excluded_count ?? 0,
    };
  }

  async listPending(ownerUserId: string) {
    const rows = await this.database.getAllAsync<LocalSongRow>(
      `SELECT * FROM local_songs
        WHERE owner_user_id = ?
          AND sync_status IN (?, ?, ?, ?)
        ORDER BY updated_at ASC, id ASC`,
      ownerUserId,
      "local_only",
      "dirty",
      "deleted",
      "error",
    );
    return rows.map(toRecord);
  }

  async findByLocalId(ownerUserId: string, localId: string) {
    const row = await this.database.getFirstAsync<LocalSongRow>(
      `SELECT * FROM local_songs WHERE id = ? AND owner_user_id = ?`,
      localId,
      ownerUserId,
    );
    return row ? toRecord(row) : null;
  }

  async findByRemoteId(ownerUserId: string, remoteId: string) {
    const row = await this.database.getFirstAsync<LocalSongRow>(
      `SELECT * FROM local_songs WHERE remote_id = ? AND owner_user_id = ?`,
      remoteId,
      ownerUserId,
    );
    return row ? toRecord(row) : null;
  }

  async listVersionGroup(ownerUserId: string, principalLocalId: string) {
    const rows = await this.database.getAllAsync<LocalSongRow>(
      `SELECT * FROM local_songs
        WHERE owner_user_id = ? AND version_group_id = ?
        ORDER BY CASE WHEN id = version_group_id THEN 0 ELSE 1 END, created_at ASC, id ASC`,
      ownerUserId,
      principalLocalId,
    );
    return rows.map(toRecord);
  }

  async acknowledgePush(
    ownerUserId: string,
    localId: string,
    expectedLocalUpdatedAt: string,
    remote: RemoteSongSyncRecord,
    syncedAt: string,
  ) {
    const current = await this.findByLocalId(ownerUserId, localId);
    if (!current) return;

    const remoteHash = hashRemoteSong(remote);
    if (current.updatedAt !== expectedLocalUpdatedAt) {
      await this.database.runAsync(
        `UPDATE local_songs
          SET remote_id = ?,
              remote_version_group_id = ?,
              sync_status = 'dirty',
              sync_error = NULL,
              last_synced_at = ?,
              remote_updated_at = ?,
              last_synced_hash = ?
          WHERE id = ? AND owner_user_id = ?`,
        remote.id,
        remote.versionGroupId,
        syncedAt,
        remote.updatedAt,
        remoteHash,
        localId,
        ownerUserId,
      );
      return;
    }

    const result = await this.database.runAsync(
      `UPDATE local_songs
        SET remote_id = ?,
            remote_version_group_id = ?,
            sync_status = 'synced',
            sync_error = NULL,
            last_synced_at = ?,
            remote_updated_at = ?,
            last_synced_hash = ?,
            deleted_at = ?,
            title = ?,
            artist = ?,
            song_key = ?,
            content = ?,
            notes = ?,
            version_name = ?,
            updated_at = ?
        WHERE id = ? AND owner_user_id = ? AND updated_at = ?`,
      remote.id,
      remote.versionGroupId,
      syncedAt,
      remote.updatedAt,
      remoteHash,
      remote.deletedAt,
      remote.title,
      remote.artist,
      remote.key,
      remote.content,
      remote.notes,
      remote.versionName,
      remote.updatedAt,
      localId,
      ownerUserId,
      expectedLocalUpdatedAt,
    );

    if (result.changes === 0) {
      await this.database.runAsync(
        `UPDATE local_songs
          SET remote_id = ?,
              remote_version_group_id = ?,
              sync_status = 'dirty',
              sync_error = NULL,
              last_synced_at = ?,
              remote_updated_at = ?,
              last_synced_hash = ?
          WHERE id = ? AND owner_user_id = ?`,
        remote.id,
        remote.versionGroupId,
        syncedAt,
        remote.updatedAt,
        remoteHash,
        localId,
        ownerUserId,
      );
    }
  }

  async markConflict(ownerUserId: string, localId: string, message: string) {
    await this.database.runAsync(
      `UPDATE local_songs
        SET sync_status = 'conflict', sync_error = ?
        WHERE id = ? AND owner_user_id = ?`,
      message,
      localId,
      ownerUserId,
    );
  }

  async markError(ownerUserId: string, localId: string, message: string) {
    await this.database.runAsync(
      `UPDATE local_songs
        SET sync_status = 'error', sync_error = ?
        WHERE id = ? AND owner_user_id = ?`,
      message,
      localId,
      ownerUserId,
    );
  }

  async acknowledgeGroupDeletion(
    ownerUserId: string,
    expectedLocals: Array<{ id: string; updatedAt: string; remoteId: string }>,
    remotes: RemoteSongSyncRecord[],
    syncedAt: string,
  ) {
    const remoteById = new Map(remotes.map((remote) => [remote.id, remote]));
    if (
      expectedLocals.length === 0 ||
      expectedLocals.some((local) => !remoteById.get(local.remoteId)?.deletedAt)
    ) {
      throw new Error("El servidor devolvió un grupo eliminado incompleto.");
    }

    await runInTransaction(this.database, async (transaction) => {
      const localById = new Map<string, LocalSongSyncRecord>();
      for (const expected of expectedLocals) {
        const row = await transaction.getFirstAsync<LocalSongRow>(
          `SELECT * FROM local_songs WHERE id = ? AND owner_user_id = ?`,
          expected.id,
          ownerUserId,
        );
        if (!row || row.updated_at !== expected.updatedAt || row.remote_id !== expected.remoteId) {
          throw new Error("El grupo cambió localmente durante la sincronización.");
        }
        localById.set(expected.id, toRecord(row));
      }

      for (const expected of expectedLocals) {
        const remote = remoteById.get(expected.remoteId)!;
        const replaced = await this.replaceWithRemoteOnConnection(
          transaction,
          ownerUserId,
          localById.get(expected.id)!,
          remote,
          syncedAt,
        );
        if (!replaced) throw new Error("No pudimos confirmar la eliminación completa del grupo.");
      }
    });
  }

  async markGroupConflict(ownerUserId: string, localIds: string[], message: string) {
    if (localIds.length === 0) return;
    await runInTransaction(this.database, async (transaction) => {
      for (const localId of localIds) {
        await transaction.runAsync(
          `UPDATE local_songs SET sync_status = 'conflict', sync_error = ?
            WHERE id = ? AND owner_user_id = ?`,
          message,
          localId,
          ownerUserId,
        );
      }
    });
  }

  async recordRemoteDeletionConflict(
    ownerUserId: string,
    localId: string,
    expectedLocalUpdatedAt: string,
    remote: RemoteSongSyncRecord,
    syncedAt: string,
  ) {
    if (!remote.deletedAt) return false;
    return runInTransaction(this.database, async (transaction) => {
      const row = await transaction.getFirstAsync<LocalSongRow>(
        `SELECT * FROM local_songs WHERE id = ? AND owner_user_id = ?`,
        localId,
        ownerUserId,
      );
      if (
        !row ||
        row.owner_user_id !== ownerUserId ||
        row.updated_at !== expectedLocalUpdatedAt ||
        row.deleted_at !== null ||
        (row.remote_id !== null && row.remote_id !== remote.id)
      ) {
        return false;
      }

      await this.upsertDeletionConflict(
        transaction,
        "remote_deletion",
        ownerUserId,
        localId,
        [remote],
        syncedAt,
      );
      await transaction.runAsync(
        `UPDATE local_songs SET sync_status = 'conflict', sync_error = ?
          WHERE id = ? AND owner_user_id = ? AND updated_at = ?`,
        "Esta canción ya fue eliminada desde otro dispositivo.",
        localId,
        ownerUserId,
        expectedLocalUpdatedAt,
      );
      return true;
    });
  }

  async recordLocalDeletionConflict(
    ownerUserId: string,
    localIds: string[],
    principalLocalId: string,
    remotes: RemoteSongSyncRecord[],
    syncedAt: string,
  ) {
    if (localIds.length === 0 || remotes.length === 0 || remotes.every((remote) => remote.deletedAt !== null)) {
      return false;
    }

    return runInTransaction(this.database, async (transaction) => {
      const localRows: LocalSongRow[] = [];
      for (const localId of localIds) {
        const row = await transaction.getFirstAsync<LocalSongRow>(
          `SELECT * FROM local_songs WHERE id = ? AND owner_user_id = ?`,
          localId,
          ownerUserId,
        );
        if (!row || row.owner_user_id !== ownerUserId || row.deleted_at === null) return false;
        localRows.push(row);
      }

      const remoteIds = new Set(remotes.map((remote) => remote.id));
      if (localRows.some((row) => !row.remote_id || !remoteIds.has(row.remote_id))) return false;

      await this.upsertDeletionConflict(
        transaction,
        "local_deletion",
        ownerUserId,
        principalLocalId,
        remotes,
        syncedAt,
      );
      for (const row of localRows) {
        await transaction.runAsync(
          `UPDATE local_songs SET sync_status = 'conflict', sync_error = ?
            WHERE id = ? AND owner_user_id = ? AND deleted_at IS NOT NULL`,
          "La canción cambió en otro dispositivo antes de eliminarse.",
          row.id,
          ownerUserId,
        );
      }
      return true;
    });
  }

  async listDeletionConflicts(ownerUserId: string) {
    const rows = await this.database.getAllAsync<DeletionConflictRow>(
      `SELECT * FROM song_sync_deletion_conflicts
        WHERE owner_user_id = ? ORDER BY created_at ASC, id ASC`,
      ownerUserId,
    );
    return rows.map(toDeletionConflict);
  }

  async acknowledgeRemoteDeletion(ownerUserId: string, conflictId: string, syncedAt: string) {
    await runInTransaction(this.database, async (transaction) => {
      const conflict = await this.getDeletionConflict(transaction, ownerUserId, conflictId, "remote_deletion");
      for (const remote of conflict.remoteSongs) {
        if (!remote.deletedAt) throw new Error("El conflicto ya no contiene una eliminación remota válida.");
        const row = await transaction.getFirstAsync<LocalSongRow>(
          `SELECT * FROM local_songs WHERE owner_user_id = ? AND (remote_id = ? OR id = ?)`,
          ownerUserId,
          remote.id,
          remote.clientId ?? "",
        );
        if (!row || row.owner_user_id !== ownerUserId) throw new Error("No encontramos la canción eliminada.");
        await this.applyRemoteDecision(transaction, ownerUserId, row.id, remote, syncedAt);
      }
      await transaction.runAsync(
        `DELETE FROM song_sync_deletion_conflicts WHERE id = ? AND owner_user_id = ?`,
        conflictId,
        ownerUserId,
      );
    });
  }

  async keepRemoteAfterLocalDeletion(ownerUserId: string, conflictId: string, syncedAt: string) {
    await runInTransaction(this.database, async (transaction) => {
      const conflict = await this.getDeletionConflict(transaction, ownerUserId, conflictId, "local_deletion");
      for (const remote of conflict.remoteSongs) {
        const row = await transaction.getFirstAsync<LocalSongRow>(
          `SELECT * FROM local_songs WHERE owner_user_id = ? AND remote_id = ?`,
          ownerUserId,
          remote.id,
        );
        if (!row || row.owner_user_id !== ownerUserId) throw new Error("No encontramos la canción que querés conservar.");
        await this.applyRemoteDecision(transaction, ownerUserId, row.id, remote, syncedAt);
      }
      await transaction.runAsync(
        `DELETE FROM song_sync_deletion_conflicts WHERE id = ? AND owner_user_id = ?`,
        conflictId,
        ownerUserId,
      );
    });
  }

  async retryLocalDeletion(ownerUserId: string, conflictId: string) {
    await runInTransaction(this.database, async (transaction) => {
      const conflict = await this.getDeletionConflict(transaction, ownerUserId, conflictId, "local_deletion");
      const remoteById = new Map(conflict.remoteSongs.map((remote) => [remote.id, remote]));
      const anchor = await transaction.getFirstAsync<LocalSongRow>(
        `SELECT * FROM local_songs WHERE owner_user_id = ? AND id = ?`,
        ownerUserId,
        conflict.localSongId,
      );
      if (!anchor) throw new Error("No encontramos la canción que querés eliminar.");
      const rows = anchor.id === anchor.version_group_id
        ? await transaction.getAllAsync<LocalSongRow>(
            `SELECT * FROM local_songs WHERE owner_user_id = ? AND version_group_id = ?`,
            ownerUserId,
            anchor.id,
          )
        : [anchor];
      if (rows.length === 0) throw new Error("No encontramos el grupo que querés eliminar.");

      for (const row of rows) {
        if (row.owner_user_id !== ownerUserId || row.deleted_at === null) {
          throw new Error("El grupo local cambió antes de confirmar la eliminación.");
        }
        if (!row.remote_id) continue;
        const remote = remoteById.get(row.remote_id);
        if (!remote) throw new Error("El estado remoto del grupo está incompleto.");
        await transaction.runAsync(
          `UPDATE local_songs
            SET remote_updated_at = ?, last_synced_hash = ?, sync_status = 'deleted', sync_error = NULL
            WHERE id = ? AND owner_user_id = ? AND deleted_at IS NOT NULL`,
          remote.updatedAt,
          hashRemoteSong(remote),
          row.id,
          ownerUserId,
        );
      }
      await transaction.runAsync(
        `DELETE FROM song_sync_deletion_conflicts WHERE id = ? AND owner_user_id = ?`,
        conflictId,
        ownerUserId,
      );
    });
  }

  async recoverEditConflict(
    ownerUserId: string,
    localId: string,
    expectedLocalUpdatedAt: string,
    remote: RemoteSongSyncRecord,
    syncedAt: string,
  ): Promise<RecoverSongConflictResult> {
    return runInTransaction(this.database, async (transaction) => {
      const row = await transaction.getFirstAsync<LocalSongRow>(
        `SELECT * FROM local_songs WHERE id = ? AND owner_user_id = ?`,
        localId,
        ownerUserId,
      );
      if (!row) return "conflict";

      const local = toRecord(row);
      if (
        local.updatedAt !== expectedLocalUpdatedAt ||
        (local.remoteId !== null && local.remoteId !== remote.id) ||
        (local.remoteId === null && remote.clientId !== local.id)
      ) {
        return "conflict";
      }

      // Deletions require an explicit decision and are never recovered automatically.
      if (local.deletedAt !== null || remote.deletedAt !== null) return "conflict";

      const isPrincipal = local.versionGroupId === local.id;
      const principalRow = isPrincipal
        ? row
        : await transaction.getFirstAsync<LocalSongRow>(
            `SELECT * FROM local_songs
              WHERE id = ? AND owner_user_id = ? AND version_group_id = id AND deleted_at IS NULL`,
            local.versionGroupId,
            ownerUserId,
          );
      if (!principalRow) return "conflict";

      const principal = toRecord(principalRow);
      if (
        (isPrincipal && remote.versionGroupId !== null) ||
        (!isPrincipal && (!principal.remoteId || remote.versionGroupId !== principal.remoteId))
      ) {
        return "conflict";
      }

      if (hasSameContent(local, remote)) {
        const replaced = await this.replaceWithRemoteOnConnection(
          transaction,
          ownerUserId,
          local,
          remote,
          syncedAt,
        );
        return replaced ? "unchanged" : "conflict";
      }

      let recoveredId = createLocalSongId(new Date(syncedAt));
      while (await transaction.getFirstAsync<{ id: string }>(`SELECT id FROM local_songs WHERE id = ?`, recoveredId)) {
        recoveredId = createLocalSongId(new Date(syncedAt));
      }
      await transaction.runAsync(
        `INSERT INTO local_songs (
          id, remote_id, version_group_id, owner_user_id, remote_version_group_id,
          sync_status, sync_error, last_synced_at, remote_updated_at, last_synced_hash,
          deleted_at, title, artist, song_key, content, notes, version_name, created_at, updated_at
        ) VALUES (?, NULL, ?, ?, ?, 'local_only', NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
        recoveredId,
        principal.id,
        ownerUserId,
        isPrincipal ? remote.id : remote.versionGroupId,
        local.title,
        local.artist,
        local.key,
        local.content,
        local.notes,
        recoveredVersionName(local),
        syncedAt,
        syncedAt,
      );

      const replaced = await this.replaceWithRemoteOnConnection(
        transaction,
        ownerUserId,
        local,
        remote,
        syncedAt,
      );
      if (!replaced) throw new Error("La canción cambió mientras se recuperaba el conflicto.");
      return "recovered";
    });
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
      await this.insertRemote(ownerUserId, remote, syncedAt);
      return "inserted";
    }

    const remoteHash = hashRemoteSong(remote);
    if (existing.syncStatus === "synced") {
      if (
        existing.remoteId === remote.id &&
        existing.remoteUpdatedAt === remote.updatedAt &&
        existing.lastSyncedHash === remoteHash
      ) {
        return "unchanged";
      }
      return this.replaceWithRemote(ownerUserId, existing, remote, syncedAt);
    }

    if (existing.syncStatus === "local_only" && !existing.remoteId && hasSameContent(existing, remote)) {
      return this.replaceWithRemote(ownerUserId, existing, remote, syncedAt);
    }

    if (isPendingLocalChange(existing.syncStatus) && existing.remoteUpdatedAt === remote.updatedAt) {
      return "unchanged";
    }

    if (existing.deletedAt === null && remote.deletedAt !== null) {
      const recorded = await this.recordRemoteDeletionConflict(
        ownerUserId,
        existing.id,
        existing.updatedAt,
        remote,
        syncedAt,
      );
      return recorded ? "conflict" : "unchanged";
    }

    if (existing.deletedAt !== null && remote.deletedAt === null) {
      const recorded = await this.recordLocalDeletionConflict(
        ownerUserId,
        [existing.id],
        existing.versionGroupId === existing.id ? existing.id : existing.id,
        [remote],
        syncedAt,
      );
      return recorded ? "conflict" : "unchanged";
    }

    const recovery = await this.recoverEditConflict(
      ownerUserId,
      existing.id,
      existing.updatedAt,
      remote,
      syncedAt,
    );
    if (recovery === "recovered") return "recovered";
    if (recovery === "unchanged") return "unchanged";
    await this.markConflict(ownerUserId, existing.id, "La canción tiene cambios locales y remotos.");
    return "conflict";
  }

  async reconcileVersionGroups(ownerUserId: string) {
    await this.database.runAsync(
      `UPDATE local_songs
        SET version_group_id = COALESCE(
          (
            SELECT principal.id
            FROM local_songs AS principal
            WHERE principal.remote_id = local_songs.remote_version_group_id
              AND principal.owner_user_id = local_songs.owner_user_id
            LIMIT 1
          ),
          version_group_id
        )
        WHERE owner_user_id = ? AND remote_version_group_id IS NOT NULL`,
      ownerUserId,
    );
  }

  private async replaceWithRemote(
    ownerUserId: string,
    existing: LocalSongSyncRecord,
    remote: RemoteSongSyncRecord,
    syncedAt: string,
  ): Promise<ApplyRemoteSongResult> {
    const replaced = await this.replaceWithRemoteOnConnection(
      this.database,
      ownerUserId,
      existing,
      remote,
      syncedAt,
    );

    if (replaced) return "updated";
    await this.markConflict(ownerUserId, existing.id, "La canción cambió localmente durante la sincronización.");
    return "conflict";
  }

  private async replaceWithRemoteOnConnection(
    connection: LocalSongDatabaseConnection,
    ownerUserId: string,
    existing: LocalSongSyncRecord,
    remote: RemoteSongSyncRecord,
    syncedAt: string,
  ) {
    const result = await connection.runAsync(
      `UPDATE local_songs
        SET remote_id = ?,
            remote_version_group_id = ?,
            sync_status = 'synced',
            sync_error = NULL,
            last_synced_at = ?,
            remote_updated_at = ?,
            last_synced_hash = ?,
            deleted_at = ?,
            title = ?,
            artist = ?,
            song_key = ?,
            content = ?,
            notes = ?,
            version_name = ?,
            updated_at = ?
        WHERE id = ? AND owner_user_id = ? AND updated_at = ?`,
      remote.id,
      remote.versionGroupId,
      syncedAt,
      remote.updatedAt,
      hashRemoteSong(remote),
      remote.deletedAt,
      remote.title,
      remote.artist,
      remote.key,
      remote.content,
      remote.notes,
      remote.versionName,
      remote.updatedAt,
      existing.id,
      ownerUserId,
      existing.updatedAt,
    );

    return result.changes > 0;
  }

  private async insertRemote(ownerUserId: string, remote: RemoteSongSyncRecord, syncedAt: string) {
    let localId = remote.clientId ?? createLocalSongId();
    while (await this.database.getFirstAsync<{ id: string }>(`SELECT id FROM local_songs WHERE id = ?`, localId)) {
      localId = createLocalSongId();
    }

    await this.database.runAsync(
      `INSERT INTO local_songs (
        id, remote_id, version_group_id, owner_user_id, remote_version_group_id,
        sync_status, sync_error, last_synced_at, remote_updated_at, last_synced_hash,
        deleted_at, title, artist, song_key, content, notes, version_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      localId,
      remote.id,
      localId,
      ownerUserId,
      remote.versionGroupId,
      "synced",
      null,
      syncedAt,
      remote.updatedAt,
      hashRemoteSong(remote),
      remote.deletedAt,
      remote.title,
      remote.artist,
      remote.key,
      remote.content,
      remote.notes,
      remote.versionName,
      remote.createdAt,
      remote.updatedAt,
    );
  }

  private async upsertDeletionConflict(
    connection: LocalSongDatabaseConnection,
    kind: SongSyncDeletionConflictKind,
    ownerUserId: string,
    localSongId: string,
    remoteSongs: RemoteSongSyncRecord[],
    timestamp: string,
  ) {
    const existingRows = await connection.getAllAsync<DeletionConflictRow>(
      `SELECT * FROM song_sync_deletion_conflicts WHERE owner_user_id = ? AND kind = ?`,
      ownerUserId,
      kind,
    );
    const incomingGroupKeys = new Set(remoteSongs.map(remoteGroupKey));
    const matching = existingRows
      .map(toDeletionConflict)
      .find((conflict) =>
        conflict.localSongId === localSongId ||
        (kind === "remote_deletion" && conflict.remoteSongs.some((remote) => incomingGroupKeys.has(remoteGroupKey(remote)))) ||
        (kind === "local_deletion" && conflict.remoteSongs.length > 1 && conflict.remoteSongs.some((remote) => incomingGroupKeys.has(remoteGroupKey(remote)))),
      );
    const id = matching?.id ?? deletionConflictId(kind, ownerUserId, localSongId);
    const targetLocalSongId = matching?.localSongId ?? localSongId;
    const mergedById = new Map((matching?.remoteSongs ?? []).map((remote) => [remote.id, remote]));
    for (const remote of remoteSongs) {
      const previous = mergedById.get(remote.id);
      if (!previous || previous.updatedAt <= remote.updatedAt) mergedById.set(remote.id, remote);
    }
    const mergedRemoteSongs = Array.from(mergedById.values());
    await connection.runAsync(
      `INSERT INTO song_sync_deletion_conflicts (
        id, owner_user_id, local_song_id, kind, remote_songs_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner_user_id, local_song_id, kind) DO UPDATE SET
        remote_songs_json = excluded.remote_songs_json,
        updated_at = excluded.updated_at`,
      id,
      ownerUserId,
      targetLocalSongId,
      kind,
      JSON.stringify(mergedRemoteSongs),
      timestamp,
      timestamp,
    );
  }

  private async getDeletionConflict(
    connection: LocalSongDatabaseConnection,
    ownerUserId: string,
    conflictId: string,
    kind: SongSyncDeletionConflictKind,
  ) {
    const row = await connection.getFirstAsync<DeletionConflictRow>(
      `SELECT * FROM song_sync_deletion_conflicts
        WHERE id = ? AND owner_user_id = ? AND kind = ?`,
      conflictId,
      ownerUserId,
      kind,
    );
    if (!row) throw new Error("Este conflicto ya fue resuelto.");
    return toDeletionConflict(row);
  }

  private async applyRemoteDecision(
    connection: LocalSongDatabaseConnection,
    ownerUserId: string,
    localId: string,
    remote: RemoteSongSyncRecord,
    syncedAt: string,
  ) {
    const result = await connection.runAsync(
      `UPDATE local_songs
        SET remote_id = ?, remote_version_group_id = ?, sync_status = 'synced', sync_error = NULL,
            last_synced_at = ?, remote_updated_at = ?, last_synced_hash = ?, deleted_at = ?,
            title = ?, artist = ?, song_key = ?, content = ?, notes = ?, version_name = ?, updated_at = ?
        WHERE id = ? AND owner_user_id = ?`,
      remote.id,
      remote.versionGroupId,
      syncedAt,
      remote.updatedAt,
      hashRemoteSong(remote),
      remote.deletedAt,
      remote.title,
      remote.artist,
      remote.key,
      remote.content,
      remote.notes,
      remote.versionName,
      remote.updatedAt,
      localId,
      ownerUserId,
    );
    if (result.changes !== 1) throw new Error("La canción cambió mientras se resolvía el conflicto.");
  }
}

export function createSQLiteSongSyncStore(database: LocalSongDatabase) {
  return new SQLiteSongSyncStore(database);
}
