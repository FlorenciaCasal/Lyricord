import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildOwnedSongWhere, isValidSongId } from "@/lib/mobile-api/ownership";
import {
  createSongFromPayload,
  createSongVersion,
  deleteSong,
  getSongVersions,
  updateSongFromPayload,
  type SongInputPayload,
} from "@/lib/songs";
import type { SongVersionPayload } from "@/lib/song-version-utils";

export { buildOwnedSongWhere, isValidSongId };

export const MOBILE_SONG_LIST_SELECT = {
  id: true,
  title: true,
  artist: true,
  key: true,
  versionName: true,
  updatedAt: true,
} as const;

export const MOBILE_SONG_DETAIL_SELECT = {
  ...MOBILE_SONG_LIST_SELECT,
  content: true,
  notes: true,
} as const;

type MobileSongListRecord = Prisma.SongGetPayload<{ select: typeof MOBILE_SONG_LIST_SELECT }>;
type MobileSongDetailRecord = Prisma.SongGetPayload<{ select: typeof MOBILE_SONG_DETAIL_SELECT }>;
type MobileSongVersionRecord = {
  id: string;
  title: string;
  versionName: string | null;
  updatedAt: Date | string;
};

function toIsoDate(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

export function toMobileSongListDto(song: MobileSongListRecord) {
  return {
    ...song,
    updatedAt: toIsoDate(song.updatedAt),
  };
}

export function toMobileSongDetailDto(song: MobileSongDetailRecord) {
  return {
    ...song,
    updatedAt: toIsoDate(song.updatedAt),
  };
}

export function toMobileSongVersionDto(song: MobileSongVersionRecord) {
  return {
    ...song,
    updatedAt: toIsoDate(song.updatedAt),
  };
}

export async function listMobileSongs(userId: string) {
  const songs = await prisma.song.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: MOBILE_SONG_LIST_SELECT,
  });

  return songs.map(toMobileSongListDto);
}

export async function getMobileSong(userId: string, id: string) {
  const song = await prisma.song.findFirst({
    where: buildOwnedSongWhere(userId, id),
    select: MOBILE_SONG_DETAIL_SELECT,
  });

  return song ? toMobileSongDetailDto(song) : null;
}

export async function createMobileSong(userId: string, payload: SongInputPayload) {
  const result = await createSongFromPayload(userId, payload);
  if (!result.success) return result;
  return {
    success: true as const,
    song: toMobileSongDetailDto(result.song),
  };
}

export async function updateMobileSong(id: string, userId: string, payload: SongInputPayload) {
  const result = await updateSongFromPayload(id, userId, payload);
  if (!result.success) return result;
  return {
    success: true as const,
    song: toMobileSongDetailDto(result.song),
  };
}

export async function deleteMobileSong(id: string, userId: string) {
  return deleteSong(id, userId);
}

export async function listMobileSongVersions(userId: string, songId: string) {
  const versions = await getSongVersions(songId, userId);
  return versions.map(toMobileSongVersionDto);
}

export async function createMobileSongVersion(userId: string, songId: string, payload: SongVersionPayload = {}) {
  const result = await createSongVersion(songId, userId, payload);
  if (!result.success) return result;
  return {
    success: true as const,
    version: toMobileSongDetailDto(result.version),
  };
}
