export type PremiumStatus = {
  plan: "free" | "premium";
  entitlements: {
    premium: boolean;
  };
  limits: {
    maxSongs: number | null;
    ocrDailyLimit: number | null;
    ocrTotalLimit?: number | null;
  };
  usage?: { activeSongs: number };
};

export type User = { id: string; email: string };

export type SongListItem = {
  id: string;
  title: string;
  artist: string | null;
  key: string | null;
  versionName: string | null;
  updatedAt: string;
};

export type SongDetail = SongListItem & {
  content: string;
  notes: string | null;
};

export type SongVersionItem = {
  id: string;
  title: string;
  versionName: string | null;
  updatedAt: string;
};

export type SongFormValues = {
  title: string;
  artist: string;
  key: string;
  versionName: string;
  content: string;
  notes: string;
};

export type SongVersionCreateValues = {
  versionName: string;
  content: string;
  key: string;
};

export type RootStackParamList = {
  Welcome: undefined;
  Login: { fromWelcome?: boolean; fromLibrary?: boolean; initialMode?: "access" | "form" } | undefined;
  Library: undefined;
  SongDetail: { songId: string; title: string };
  SongForm:
    | { mode: "create" }
    | { mode: "edit"; songId: string; title: string }
    | {
        mode: "createVersion";
        sourceSongId: string;
        title: string;
        initialSemitones: number;
      };
  Premium: undefined;
  ChordLab: undefined;
  SongPlayMode: { songId: string; title: string };
};
