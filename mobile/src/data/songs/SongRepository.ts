import type {
  SongDetail,
  SongFormValues,
  SongListItem,
  SongVersionCreateValues,
  SongVersionItem,
} from "../../types";

export type SongRepository = {
  listSongs(): Promise<SongListItem[]>;
  getSong(id: string): Promise<SongDetail>;
  createSong(values: SongFormValues): Promise<SongDetail>;
  updateSong(id: string, values: SongFormValues): Promise<SongDetail>;
  deleteSong(id: string): Promise<void>;
  getDeletionPlan?(id: string): Promise<{
    isPrincipal: boolean;
    affectedCount: number;
    versionCount: number;
  }>;
  listVersions(id: string): Promise<SongVersionItem[]>;
  createVersion(id: string, values?: SongVersionCreateValues): Promise<SongDetail>;
};
