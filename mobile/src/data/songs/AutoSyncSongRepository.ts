import type { SongRepository } from "./SongRepository.ts";

export function createAutoSyncSongRepository(
  repository: SongRepository,
  notifyLocalChange: () => void,
): SongRepository {
  return {
    listSongs: () => repository.listSongs(),
    getSong: (id) => repository.getSong(id),
    getDeletionPlan: repository.getDeletionPlan
      ? (id) => repository.getDeletionPlan!(id)
      : undefined,
    listVersions: (id) => repository.listVersions(id),
    async createSong(values) {
      const song = await repository.createSong(values);
      notifyLocalChange();
      return song;
    },
    async updateSong(id, values) {
      const song = await repository.updateSong(id, values);
      notifyLocalChange();
      return song;
    },
    async deleteSong(id) {
      await repository.deleteSong(id);
      notifyLocalChange();
    },
    async createVersion(id, values) {
      const version = await repository.createVersion(id, values);
      notifyLocalChange();
      return version;
    },
  };
}
