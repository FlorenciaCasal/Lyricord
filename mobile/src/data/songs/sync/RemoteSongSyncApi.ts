import { pullSongSyncChanges, pushSongSyncChanges } from "../../../api/client";
import type { SongSyncApi } from "./types.ts";

export const remoteSongSyncApi: SongSyncApi = {
  pull: pullSongSyncChanges,
  push: pushSongSyncChanges,
};
