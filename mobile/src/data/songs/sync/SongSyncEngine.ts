import type {
  LocalSongSyncRecord,
  RemoteSongSyncRecord,
  SongSyncApi,
  SongSyncConflict,
  SongSyncEngineState,
  SongSyncGroupDeletionChange,
  SongSyncPushChange,
  SongSyncRunResult,
  SongSyncStore,
} from "./types.ts";
import { SongSyncSessionChangedError } from "./SongSyncSession.ts";

const PUSH_BATCH_SIZE = 100;
const PULL_PAGE_SIZE = 200;

type SongSyncEngineOptions = {
  api: SongSyncApi;
  store: SongSyncStore;
  now?: () => Date;
  isOwnerActive?: (ownerUserId: string) => boolean;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No pudimos sincronizar las canciones.";
}

function isPrincipal(song: LocalSongSyncRecord) {
  return song.versionGroupId === song.id;
}

function orderPendingSongs(songs: LocalSongSyncRecord[]) {
  return [...songs].sort((left, right) => {
    const groupOrder = Number(!isPrincipal(left)) - Number(!isPrincipal(right));
    return groupOrder || left.updatedAt.localeCompare(right.updatedAt) || left.id.localeCompare(right.id);
  });
}

function toPushChange(song: LocalSongSyncRecord, group: LocalSongSyncRecord | null): SongSyncPushChange {
  const version = !isPrincipal(song);
  return {
    id: song.remoteId,
    clientId: song.id,
    baseUpdatedAt: song.remoteUpdatedAt,
    versionGroupId: version ? song.remoteVersionGroupId ?? group?.remoteId ?? null : null,
    versionGroupClientId: version ? song.versionGroupId : null,
    title: song.title,
    artist: song.artist,
    key: song.key,
    versionName: song.versionName,
    content: song.content,
    notes: song.notes,
    deletedAt: song.deletedAt,
  };
}

export class SongSyncEngine {
  private readonly api: SongSyncApi;
  private readonly store: SongSyncStore;
  private readonly now: () => Date;
  private readonly isOwnerActive: (ownerUserId: string) => boolean;
  private readonly activeRuns = new Map<string, Promise<SongSyncRunResult>>();
  private state: SongSyncEngineState = { status: "idle" };

  constructor(options: SongSyncEngineOptions) {
    this.api = options.api;
    this.store = options.store;
    this.now = options.now ?? (() => new Date());
    this.isOwnerActive = options.isOwnerActive ?? (() => true);
  }

  getState() {
    return this.state;
  }

  sync(ownerUserId: string) {
    const normalizedOwner = ownerUserId.trim();
    if (!normalizedOwner) return Promise.reject(new Error("SongSyncEngine necesita un usuario autenticado."));

    const existing = this.activeRuns.get(normalizedOwner);
    if (existing) return existing;

    const run = this.run(normalizedOwner).finally(() => {
      if (this.activeRuns.get(normalizedOwner) === run) this.activeRuns.delete(normalizedOwner);
    });
    this.activeRuns.set(normalizedOwner, run);
    return run;
  }

  private async run(ownerUserId: string): Promise<SongSyncRunResult> {
    this.assertOwnerActive(ownerUserId);
    const startedAt = this.now().toISOString();
    this.state = { status: "syncing", ownerUserId, startedAt };

    try {
      const conflicts: SongSyncConflict[] = [];
      const itemErrors: Array<{ localId: string; message: string }> = [];
      const pushed = await this.pushPending(ownerUserId, conflicts, itemErrors);
      this.assertOwnerActive(ownerUserId);
      const pulled = await this.pullAll(ownerUserId, conflicts);
      this.assertOwnerActive(ownerUserId);
      await this.store.reconcileVersionGroups(ownerUserId);

      const result: SongSyncRunResult = {
        ownerUserId,
        startedAt,
        completedAt: this.now().toISOString(),
        pushed,
        pulled,
        conflicts,
        itemErrors,
      };
      this.state = { status: "success", result };
      return result;
    } catch (error) {
      this.state = { status: "error", ownerUserId, message: errorMessage(error) };
      throw error;
    }
  }

  private async pushPending(
    ownerUserId: string,
    conflicts: SongSyncConflict[],
    itemErrors: Array<{ localId: string; message: string }>,
  ) {
    this.assertOwnerActive(ownerUserId);
    const allPending = orderPendingSongs(await this.store.listPending(ownerUserId));
    const groupResult = await this.pushDeletedGroups(ownerUserId, allPending, conflicts, itemErrors);
    const pending = allPending.filter((song) => !groupResult.excludedLocalIds.has(song.id));
    let pushed = groupResult.pushed;

    for (let offset = 0; offset < pending.length; offset += PUSH_BATCH_SIZE) {
      const batch = pending.slice(offset, offset + PUSH_BATCH_SIZE);
      const changes: SongSyncPushChange[] = [];
      const validSongs: LocalSongSyncRecord[] = [];

      for (const song of batch) {
        if (song.ownerUserId !== ownerUserId) continue;
        const group = isPrincipal(song)
          ? song
          : await this.store.findByLocalId(ownerUserId, song.versionGroupId);

        if (!isPrincipal(song) && !group) {
          const message = "No encontramos la canción principal de esta versión.";
          await this.store.markError(ownerUserId, song.id, message);
          itemErrors.push({ localId: song.id, message });
          continue;
        }

        changes.push(toPushChange(song, group));
        validSongs.push(song);
      }

      if (changes.length === 0) continue;
      this.assertOwnerActive(ownerUserId);
      const response = await this.api.push(changes);
      this.assertOwnerActive(ownerUserId);

      for (let index = 0; index < changes.length; index += 1) {
        const requested = changes[index];
        const local = validSongs[index];
        const result = response.results[index];
        if (!result) {
          const message = "El servidor no devolvió el resultado de este cambio.";
          await this.store.markError(ownerUserId, local.id, message);
          itemErrors.push({ localId: local.id, message });
          continue;
        }

        const localId = result.clientId ?? requested.clientId;
        if (localId !== local.id) {
          const message = "El servidor devolvió un identificador de canción inesperado.";
          await this.store.markError(ownerUserId, local.id, message);
          itemErrors.push({ localId: local.id, message });
          continue;
        }

        if (result.status === "conflict") {
          const message = result.error?.message ?? "La canción cambió en otro dispositivo.";
          if (result.song) {
            if (local.deletedAt === null && result.song.deletedAt !== null) {
              const recorded = await this.store.recordRemoteDeletionConflict(
                ownerUserId,
                local.id,
                local.updatedAt,
                result.song,
                response.serverTime,
              );
              if (!recorded) await this.store.markConflict(ownerUserId, local.id, message);
              conflicts.push({ localId: local.id, remoteId: result.id, message, remote: result.song });
              continue;
            }
            if (local.deletedAt !== null && result.song.deletedAt === null) {
              const recorded = await this.store.recordLocalDeletionConflict(
                ownerUserId,
                [local.id],
                local.id,
                [result.song],
                response.serverTime,
              );
              if (!recorded) await this.store.markConflict(ownerUserId, local.id, message);
              conflicts.push({ localId: local.id, remoteId: result.id, message, remote: result.song });
              continue;
            }
            const recovery = await this.store.recoverEditConflict(
              ownerUserId,
              local.id,
              local.updatedAt,
              result.song,
              response.serverTime,
            );
            if (recovery !== "conflict") continue;
            const current = await this.store.findByLocalId(ownerUserId, local.id);
            if (current?.updatedAt === local.updatedAt) {
              await this.store.markConflict(ownerUserId, local.id, message);
            }
          } else {
            await this.store.markConflict(ownerUserId, local.id, message);
          }
          conflicts.push({ localId: local.id, remoteId: result.id, message, remote: result.song ?? null });
          continue;
        }

        if (result.status === "error" || !result.song) {
          const message = result.error?.message ?? "No pudimos sincronizar esta canción.";
          await this.store.markError(ownerUserId, local.id, message);
          itemErrors.push({ localId: local.id, message });
          continue;
        }

        await this.store.acknowledgePush(
          ownerUserId,
          local.id,
          local.updatedAt,
          result.song,
          response.serverTime,
        );
        pushed += 1;
      }
    }

    return pushed;
  }

  private async pushDeletedGroups(
    ownerUserId: string,
    pending: LocalSongSyncRecord[],
    conflicts: SongSyncConflict[],
    itemErrors: Array<{ localId: string; message: string }>,
  ) {
    const excludedLocalIds = new Set<string>();
    let pushed = 0;
    const principals = pending.filter(
      (song) => isPrincipal(song) &&
        (song.syncStatus === "deleted" || song.syncStatus === "error") &&
        song.deletedAt !== null,
    );

    for (const principal of principals) {
      const group = await this.store.listVersionGroup(ownerUserId, principal.id);
      for (const song of group) excludedLocalIds.add(song.id);

      const remoteMembers = group.filter((song) => song.remoteId !== null);
      const invalid =
        group.length === 0 ||
        group.some((song) => song.ownerUserId !== ownerUserId || song.deletedAt === null) ||
        remoteMembers.some((song) => !song.remoteUpdatedAt);
      if (invalid || !principal.remoteId || remoteMembers.length === 0) {
        const message = "No pudimos validar el grupo completo antes de eliminarlo.";
        await this.store.markGroupConflict(ownerUserId, group.map((song) => song.id), message);
        itemErrors.push({ localId: principal.id, message });
        continue;
      }

      const operation: SongSyncGroupDeletionChange = {
        operation: "deleteGroup",
        principalId: principal.remoteId,
        principalClientId: principal.id,
        deletedAt: principal.deletedAt!,
        members: remoteMembers.map((song) => ({
          id: song.remoteId!,
          clientId: song.id,
          baseUpdatedAt: song.remoteUpdatedAt!,
        })),
      };
      this.assertOwnerActive(ownerUserId);
      const response = await this.api.push([operation]);
      this.assertOwnerActive(ownerUserId);
      const result = response.results[0];
      if (!result) {
        const message = "El servidor no devolvió el resultado de la eliminación grupal.";
        for (const song of remoteMembers) await this.store.markError(ownerUserId, song.id, message);
        itemErrors.push({ localId: principal.id, message });
        continue;
      }

      if (result.status === "conflict") {
        const message = result.error?.message ?? "El grupo cambió en otro dispositivo.";
        const remoteSongs = result.songs ?? [];
        const recorded = remoteSongs.length > 0 && remoteSongs.some((song) => song.deletedAt === null)
          ? await this.store.recordLocalDeletionConflict(
              ownerUserId,
              remoteMembers.map((song) => song.id),
              principal.id,
              remoteSongs,
              response.serverTime,
            )
          : false;
        if (!recorded) {
          await this.store.markGroupConflict(ownerUserId, remoteMembers.map((song) => song.id), message);
        }
        conflicts.push({
          localId: principal.id,
          remoteId: principal.remoteId,
          message,
          remote: result.songs?.find((song) => song.id === principal.remoteId) ?? null,
        });
        continue;
      }

      if ((result.status !== "deleted" && result.status !== "unchanged") || !result.songs) {
        const message = result.error?.message ?? "No pudimos eliminar el grupo completo.";
        for (const song of remoteMembers) await this.store.markError(ownerUserId, song.id, message);
        itemErrors.push({ localId: principal.id, message });
        continue;
      }

      await this.store.acknowledgeGroupDeletion(
        ownerUserId,
        remoteMembers.map((song) => ({ id: song.id, updatedAt: song.updatedAt, remoteId: song.remoteId! })),
        result.songs,
        response.serverTime,
      );
      pushed += remoteMembers.length;
    }

    return { excludedLocalIds, pushed };
  }

  private async pullAll(ownerUserId: string, conflicts: SongSyncConflict[]) {
    let cursor: string | null = null;
    let pulled = 0;

    do {
      this.assertOwnerActive(ownerUserId);
      const response = await this.api.pull({ cursor, limit: PULL_PAGE_SIZE });
      this.assertOwnerActive(ownerUserId);
      for (const remote of response.songs) {
        this.assertOwnerActive(ownerUserId);
        const result = await this.store.applyRemote(ownerUserId, remote, response.serverTime);
        if (result === "conflict") {
          const local =
            (await this.store.findByRemoteId(ownerUserId, remote.id)) ??
            (remote.clientId ? await this.store.findByLocalId(ownerUserId, remote.clientId) : null);
          conflicts.push({
            localId: local?.id ?? remote.clientId ?? remote.id,
            remoteId: remote.id,
            message: "La canción tiene cambios locales y remotos.",
            remote,
          });
        }
        pulled += 1;
      }
      cursor = response.nextCursor;
    } while (cursor);

    return pulled;
  }

  private assertOwnerActive(ownerUserId: string) {
    if (!this.isOwnerActive(ownerUserId)) throw new SongSyncSessionChangedError();
  }
}

export function createSongSyncEngine(options: SongSyncEngineOptions) {
  return new SongSyncEngine(options);
}
