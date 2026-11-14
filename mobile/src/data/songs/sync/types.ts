export type SongSyncStatus = "created" | "updated" | "deleted" | "unchanged" | "conflict" | "error";

export type RemoteSongSyncRecord = {
  id: string;
  clientId: string | null;
  title: string;
  artist: string | null;
  key: string | null;
  versionName: string | null;
  versionGroupId: string | null;
  content: string;
  notes: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SongSyncPushChange = {
  id: string | null;
  clientId: string;
  baseUpdatedAt: string | null;
  versionGroupId: string | null;
  versionGroupClientId: string | null;
  title: string;
  artist: string | null;
  key: string | null;
  versionName: string | null;
  content: string;
  notes: string | null;
  deletedAt: string | null;
};

export type SongSyncGroupDeletionChange = {
  operation: "deleteGroup";
  principalId: string;
  principalClientId: string;
  deletedAt: string;
  members: Array<{
    id: string;
    clientId: string;
    baseUpdatedAt: string;
  }>;
};

export type SongSyncPushOperation = SongSyncPushChange | SongSyncGroupDeletionChange;

export type SongSyncPushResult = {
  clientId: string | null;
  id: string | null;
  status: SongSyncStatus;
  song?: RemoteSongSyncRecord;
  songs?: RemoteSongSyncRecord[];
  error?: {
    code: "VALIDATION_ERROR" | "NOT_FOUND" | "CONFLICT" | "LIMIT_REACHED" | "INTERNAL_ERROR";
    message: string;
  };
};

export type SongSyncPullRequest = {
  since?: string | null;
  cursor?: string | null;
  limit?: number;
};

export type SongSyncPullResponse = {
  songs: RemoteSongSyncRecord[];
  serverTime: string;
  nextCursor: string | null;
};

export type SongSyncPushResponse = {
  results: SongSyncPushResult[];
  serverTime: string;
};

export type SongSyncApi = {
  pull(request: SongSyncPullRequest): Promise<SongSyncPullResponse>;
  push(changes: SongSyncPushOperation[]): Promise<SongSyncPushResponse>;
};

export type LocalSongSyncStatus = "local_only" | "synced" | "dirty" | "deleted" | "conflict" | "error";

export type LocalSongSyncRecord = {
  id: string;
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
  title: string;
  artist: string | null;
  key: string | null;
  content: string;
  notes: string | null;
  versionName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApplyRemoteSongResult = "inserted" | "updated" | "unchanged" | "recovered" | "conflict";

export type RecoverSongConflictResult = "recovered" | "unchanged" | "conflict";

export type SongSyncDeletionConflictKind = "remote_deletion" | "local_deletion";

export type SongSyncDeletionConflict = {
  id: string;
  ownerUserId: string;
  localSongId: string;
  kind: SongSyncDeletionConflictKind;
  remoteSongs: RemoteSongSyncRecord[];
  createdAt: string;
  updatedAt: string;
};

export type SongSyncStore = {
  listPending(ownerUserId: string): Promise<LocalSongSyncRecord[]>;
  findByLocalId(ownerUserId: string, localId: string): Promise<LocalSongSyncRecord | null>;
  findByRemoteId(ownerUserId: string, remoteId: string): Promise<LocalSongSyncRecord | null>;
  listVersionGroup(ownerUserId: string, principalLocalId: string): Promise<LocalSongSyncRecord[]>;
  acknowledgePush(
    ownerUserId: string,
    localId: string,
    expectedLocalUpdatedAt: string,
    remote: RemoteSongSyncRecord,
    syncedAt: string,
  ): Promise<void>;
  markConflict(ownerUserId: string, localId: string, message: string): Promise<void>;
  markError(ownerUserId: string, localId: string, message: string): Promise<void>;
  acknowledgeGroupDeletion(
    ownerUserId: string,
    expectedLocals: Array<{ id: string; updatedAt: string; remoteId: string }>,
    remotes: RemoteSongSyncRecord[],
    syncedAt: string,
  ): Promise<void>;
  markGroupConflict(ownerUserId: string, localIds: string[], message: string): Promise<void>;
  recordRemoteDeletionConflict(
    ownerUserId: string,
    localId: string,
    expectedLocalUpdatedAt: string,
    remote: RemoteSongSyncRecord,
    syncedAt: string,
  ): Promise<boolean>;
  recordLocalDeletionConflict(
    ownerUserId: string,
    localIds: string[],
    principalLocalId: string,
    remotes: RemoteSongSyncRecord[],
    syncedAt: string,
  ): Promise<boolean>;
  recoverEditConflict(
    ownerUserId: string,
    localId: string,
    expectedLocalUpdatedAt: string,
    remote: RemoteSongSyncRecord,
    syncedAt: string,
  ): Promise<RecoverSongConflictResult>;
  applyRemote(ownerUserId: string, remote: RemoteSongSyncRecord, syncedAt: string): Promise<ApplyRemoteSongResult>;
  reconcileVersionGroups(ownerUserId: string): Promise<void>;
};

export type SongSyncConflict = {
  localId: string;
  remoteId: string | null;
  message: string;
  remote: RemoteSongSyncRecord | null;
};

export type SongSyncRunResult = {
  ownerUserId: string;
  startedAt: string;
  completedAt: string;
  pushed: number;
  pulled: number;
  conflicts: SongSyncConflict[];
  itemErrors: Array<{ localId: string; message: string }>;
};

export type SongSyncEngineState =
  | { status: "idle" }
  | { status: "syncing"; ownerUserId: string; startedAt: string }
  | { status: "success"; result: SongSyncRunResult }
  | { status: "error"; ownerUserId: string; message: string };
