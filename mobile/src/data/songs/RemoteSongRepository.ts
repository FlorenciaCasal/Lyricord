import type {
  SongDetail,
  SongFormValues,
  SongListItem,
  SongVersionCreateValues,
  SongVersionItem,
} from "../../types";
import type { SongRepository } from "./SongRepository";

export type RemoteSongApi = {
  getSongs(): Promise<SongListItem[]>;
  getSong(id: string): Promise<SongDetail>;
  createSong(values: SongFormValues): Promise<SongDetail>;
  updateSong(id: string, values: SongFormValues): Promise<SongDetail>;
  deleteSong(id: string): Promise<void>;
  getSongVersions(id: string): Promise<SongVersionItem[]>;
  createSongVersion(id: string, values?: SongVersionCreateValues): Promise<SongDetail>;
};

export function createRemoteSongRepository(api: RemoteSongApi): SongRepository {
  return {
    listSongs: () => api.getSongs(),
    getSong: (id) => api.getSong(id),
    createSong: (values) => api.createSong(values),
    updateSong: (id, values) => api.updateSong(id, values),
    deleteSong: (id) => api.deleteSong(id),
    listVersions: (id) => api.getSongVersions(id),
    createVersion: (id, values) => api.createSongVersion(id, values),
  };
}
