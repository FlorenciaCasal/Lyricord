import type { SongSyncDeletionConflict } from "./types";

export type SongSyncConflictStore = {
  listDeletionConflicts(ownerUserId: string): Promise<SongSyncDeletionConflict[]>;
  acknowledgeRemoteDeletion(ownerUserId: string, conflictId: string, syncedAt: string): Promise<void>;
  keepRemoteAfterLocalDeletion(ownerUserId: string, conflictId: string, syncedAt: string): Promise<void>;
  retryLocalDeletion(ownerUserId: string, conflictId: string): Promise<void>;
};

export class SongSyncConflictController {
  constructor(
    private readonly store: SongSyncConflictStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  list(ownerUserId: string | null) {
    const owner = ownerUserId?.trim();
    if (!owner) return Promise.resolve([]);
    return this.store.listDeletionConflicts(owner);
  }

  acknowledgeRemoteDeletion(ownerUserId: string, conflictId: string) {
    return this.store.acknowledgeRemoteDeletion(ownerUserId, conflictId, this.now().toISOString());
  }

  keepRemote(ownerUserId: string, conflictId: string) {
    return this.store.keepRemoteAfterLocalDeletion(ownerUserId, conflictId, this.now().toISOString());
  }

  deleteAnyway(ownerUserId: string, conflictId: string) {
    return this.store.retryLocalDeletion(ownerUserId, conflictId);
  }
}

export function createSongSyncConflictController(store: SongSyncConflictStore) {
  return new SongSyncConflictController(store);
}
