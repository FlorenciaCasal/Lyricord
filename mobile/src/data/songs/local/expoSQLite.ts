import { openDatabaseAsync } from "expo-sqlite";
import { createLocalSongRepository } from "./LocalSongRepository.ts";
import type { LocalSongDatabase, LocalSongDatabaseConnection } from "./LocalSongDatabase.ts";
import { createManualSongSyncController } from "../sync/ManualSongSyncController.ts";
import { remoteSongSyncApi } from "../sync/RemoteSongSyncApi.ts";
import { createSongSyncEngine } from "../sync/SongSyncEngine.ts";
import { createSQLiteSongSyncStore } from "../sync/SQLiteSongSyncStore.ts";
import { createSongSyncConflictController } from "../sync/SongSyncConflictController.ts";
import { createAutomaticSongSyncCoordinator } from "../sync/AutomaticSongSyncCoordinator.ts";
import { SongSyncOwnerSession } from "../sync/SongSyncSession.ts";
import { isApiSessionOwner } from "../../../api/client.ts";

export const LOCAL_SONG_DATABASE_NAME = "musum-songs.db";

function toConnection(database: LocalSongDatabaseConnection): LocalSongDatabaseConnection {
  return {
    execAsync: (source) => database.execAsync(source),
    runAsync: (source, ...params) => database.runAsync(source, ...params),
    getFirstAsync: (source, ...params) => database.getFirstAsync(source, ...params),
    getAllAsync: (source, ...params) => database.getAllAsync(source, ...params),
  };
}

async function openLocalSongDatabase(): Promise<LocalSongDatabase> {
  const database = await openDatabaseAsync(LOCAL_SONG_DATABASE_NAME);
  return {
    ...toConnection(database),
    async transactionAsync<T>(task: (transaction: LocalSongDatabaseConnection) => Promise<T>) {
      let result: T | undefined;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        result = await task(toConnection(transaction));
      });
      return result as T;
    },
  };
}

export async function openLocalSongRepository() {
  const database = await openLocalSongDatabase();
  return createLocalSongRepository(database);
}

export async function openLocalSongRuntime({
  apiUrl,
  isDevelopment,
}: {
  apiUrl: string | null;
  isDevelopment: boolean;
}) {
  const database = await openLocalSongDatabase();
  const repository = await createLocalSongRepository(database);
  const syncStore = createSQLiteSongSyncStore(database);
  const ownerSession = new SongSyncOwnerSession();
  const engine = createSongSyncEngine({
    api: remoteSongSyncApi,
    store: syncStore,
    isOwnerActive: (ownerUserId) => ownerSession.isActive(ownerUserId) && isApiSessionOwner(ownerUserId),
  });
  const automaticSyncCoordinator = createAutomaticSongSyncCoordinator({
    engine,
    previewReader: syncStore,
    ownerSession,
    isApiSessionOwner,
  });
  const manualSyncController = createManualSongSyncController({
    engine: automaticSyncCoordinator,
    previewReader: syncStore,
    apiUrl,
    isDevelopment,
  });
  const syncConflictController = createSongSyncConflictController(syncStore);

  return { repository, automaticSyncCoordinator, manualSyncController, syncConflictController };
}
