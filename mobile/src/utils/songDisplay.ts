import type { SongDetail, SongListItem } from "../types";

type DisplayableSong = Pick<SongListItem | SongDetail, "title" | "artist" | "key" | "versionName">;

function normalizeVersionName(versionName: string | null) {
  return versionName?.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "") ?? "";
}

export function isGenericVersionName(versionName: string | null) {
  const normalized = normalizeVersionName(versionName);
  return normalized === "" || normalized === "principal" || normalized === "nueva version";
}

export function getSongDisplayTitle(song: DisplayableSong) {
  if (!song.versionName || normalizeVersionName(song.versionName) === "principal") return song.title;
  if (normalizeVersionName(song.versionName) === "nueva version") return `${song.title} - versión`;
  return song.versionName.trim();
}

export function getSongDisplayMeta(song: DisplayableSong) {
  const parts = song.versionName && !isGenericVersionName(song.versionName)
    ? [`Versión de ${song.title}`, song.artist, song.key]
    : [song.artist, song.key];

  return parts.filter(Boolean).join(" · ") || "Sin datos adicionales";
}
