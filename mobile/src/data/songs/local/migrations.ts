import type { LocalSongDatabase } from "./LocalSongDatabase";

export const LOCAL_SONG_DATABASE_VERSION = 3;

export const LOCAL_SONG_SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS local_songs (
  id TEXT PRIMARY KEY NOT NULL,
  remote_id TEXT UNIQUE,
  version_group_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT,
  song_key TEXT,
  content TEXT NOT NULL,
  notes TEXT,
  version_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_local_songs_updated_at
  ON local_songs(updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_local_songs_version_group_id
  ON local_songs(version_group_id, created_at ASC, updated_at DESC);
`;

export const LOCAL_SONG_SCHEMA_V2 = `
ALTER TABLE local_songs ADD COLUMN owner_user_id TEXT;
ALTER TABLE local_songs ADD COLUMN remote_version_group_id TEXT;
ALTER TABLE local_songs ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'local_only';
ALTER TABLE local_songs ADD COLUMN sync_error TEXT;
ALTER TABLE local_songs ADD COLUMN last_synced_at TEXT;
ALTER TABLE local_songs ADD COLUMN remote_updated_at TEXT;
ALTER TABLE local_songs ADD COLUMN last_synced_hash TEXT;
ALTER TABLE local_songs ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_local_songs_owner_user_id
  ON local_songs(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_local_songs_sync_status
  ON local_songs(sync_status);

CREATE INDEX IF NOT EXISTS idx_local_songs_deleted_at
  ON local_songs(deleted_at);

CREATE INDEX IF NOT EXISTS idx_local_songs_remote_version_group_id
  ON local_songs(remote_version_group_id);
`;

export const LOCAL_SONG_SCHEMA_V3 = `
CREATE TABLE IF NOT EXISTS song_sync_deletion_conflicts (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL,
  local_song_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('remote_deletion', 'local_deletion')),
  remote_songs_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_user_id, local_song_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_song_sync_deletion_conflicts_owner
  ON song_sync_deletion_conflicts(owner_user_id, created_at ASC);
`;

type UserVersionRow = {
  user_version: number;
};

export async function getLocalSongDatabaseVersion(database: LocalSongDatabase) {
  const row = await database.getFirstAsync<UserVersionRow>("PRAGMA user_version");
  return row?.user_version ?? 0;
}

export async function migrateLocalSongDatabase(database: LocalSongDatabase) {
  const currentVersion = await getLocalSongDatabaseVersion(database);

  if (currentVersion < 1) {
    await database.execAsync(LOCAL_SONG_SCHEMA_V1);
    await database.execAsync("PRAGMA user_version = 1");
  }

  if (currentVersion < 2) {
    await database.execAsync(LOCAL_SONG_SCHEMA_V2);
    await database.execAsync("PRAGMA user_version = 2");
  }

  if (currentVersion < 3) {
    await database.execAsync(LOCAL_SONG_SCHEMA_V3);
    await database.execAsync("PRAGMA user_version = 3");
  }

  const migratedVersion = await getLocalSongDatabaseVersion(database);
  if (migratedVersion > LOCAL_SONG_DATABASE_VERSION) {
    throw new Error(`Local song database version ${migratedVersion} is newer than this app supports.`);
  }
}
