export type SongVersionSource = {
  id: string;
  title: string;
  artist: string | null;
  key: string | null;
  versionGroupId: string | null;
  content: string;
  notes: string | null;
  userId: string;
};

export type SongVersionPayload = {
  versionName?: unknown;
  content?: unknown;
  key?: unknown;
};

export type SongVersionDraft = {
  title: string;
  artist: string | null;
  key: string | null;
  versionName: string;
  versionGroupId: string;
  content: string;
  notes: string | null;
  userId: string;
};

function optionalString(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

export function getDefaultSongVersionName(sourceTitle: string, key: string | null, existingVersionCount: number) {
  if (key) return `${sourceTitle} en ${key}`;
  return `Versión ${Math.max(existingVersionCount + 1, 2)}`;
}

export function buildSongVersionDraft(
  source: SongVersionSource,
  payload: SongVersionPayload = {},
  existingVersionCount = 1,
): SongVersionDraft {
  const key = optionalString(payload.key) ?? source.key;
  const versionName =
    optionalString(payload.versionName) ?? getDefaultSongVersionName(source.title, key, existingVersionCount);
  const content = typeof payload.content === "string" && payload.content.trim().length > 0
    ? payload.content
    : source.content;

  return {
    title: source.title,
    artist: source.artist,
    key,
    versionName,
    versionGroupId: source.versionGroupId ?? source.id,
    content,
    notes: source.notes,
    userId: source.userId,
  };
}
