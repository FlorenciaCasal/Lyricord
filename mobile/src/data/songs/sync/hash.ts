import type { RemoteSongSyncRecord } from "./types.ts";

type HashableSong = Pick<
  RemoteSongSyncRecord,
  "title" | "artist" | "key" | "versionName" | "content" | "notes" | "deletedAt"
>;

function stableSongValue(song: HashableSong) {
  return JSON.stringify([
    song.title,
    song.artist,
    song.key,
    song.versionName,
    song.content,
    song.notes,
    song.deletedAt,
  ]);
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function hashRemoteSong(song: RemoteSongSyncRecord) {
  return fnv1a(stableSongValue(song));
}
