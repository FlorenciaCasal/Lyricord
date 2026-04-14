import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type SongListItem = Prisma.SongGetPayload<{
  select: {
    id: true;
    title: true;
    artist: true;
    key: true;
    versionName: true;
    updatedAt: true;
  };
}>;

export type SongVersionItem = Prisma.SongGetPayload<{
  select: {
    id: true;
    title: true;
    versionName: true;
    updatedAt: true;
  };
}>;

export type SongFormState = {
  errors: {
    title?: string;
    artist?: string;
    key?: string;
    versionName?: string;
    content?: string;
    notes?: string;
    form?: string;
  };
};

export type CreateSongVersionResult =
  | {
      success: true;
      version: Prisma.SongGetPayload<object>;
    }
  | {
      success: false;
      reason: "not-found" | "limit-reached";
    };

const MAX_SONGS_PER_USER = 200;
const MAX_TITLE_LENGTH = 120;
const MAX_ARTIST_LENGTH = 120;
const MAX_KEY_LENGTH = 40;
const MAX_VERSION_NAME_LENGTH = 80;
const MAX_CONTENT_LENGTH = 100_000;
const MAX_NOTES_LENGTH = 10_000;

type SongInput = {
  title: string;
  artist: string | null;
  key: string | null;
  versionName: string | null;
  content: string;
  notes: string | null;
};

function normalizeOptionalField(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "").trim();
  return parsed.length > 0 ? parsed : null;
}

function parseSongInput(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const artist = normalizeOptionalField(formData.get("artist"));
  const key = normalizeOptionalField(formData.get("key"));
  const versionName = normalizeOptionalField(formData.get("versionName"));
  const notes = normalizeOptionalField(formData.get("notes"));

  const errors: SongFormState["errors"] = {};

  if (!title) {
    errors.title = "El título es obligatorio.";
  } else if (title.length > MAX_TITLE_LENGTH) {
    errors.title = `El titulo no puede superar ${MAX_TITLE_LENGTH} caracteres.`;
  }

  if (!content) {
    errors.content = "El contenido es obligatorio.";
  } else if (content.length > MAX_CONTENT_LENGTH) {
    errors.content = `El contenido no puede superar ${MAX_CONTENT_LENGTH.toLocaleString(
      "es-AR",
    )} caracteres.`;
  }

  if (artist && artist.length > MAX_ARTIST_LENGTH) {
    errors.artist = `El artista no puede superar ${MAX_ARTIST_LENGTH} caracteres.`;
  }

  if (key && key.length > MAX_KEY_LENGTH) {
    errors.key = `El tono no puede superar ${MAX_KEY_LENGTH} caracteres.`;
  }

  if (versionName && versionName.length > MAX_VERSION_NAME_LENGTH) {
    errors.versionName = `La version no puede superar ${MAX_VERSION_NAME_LENGTH} caracteres.`;
  }

  if (notes && notes.length > MAX_NOTES_LENGTH) {
    errors.notes = `Las notas no pueden superar ${MAX_NOTES_LENGTH.toLocaleString(
      "es-AR",
    )} caracteres.`;
  }

  const input: SongInput = {
    title,
    artist,
    key,
    versionName,
    content,
    notes,
  };

  return {
    input,
    errors,
  };
}

async function hasReachedSongLimit(userId: string) {
  const songCount = await prisma.song.count({
    where: { userId },
  });

  return songCount >= MAX_SONGS_PER_USER;
}

export async function searchSongs(userId: string, query?: string) {
  const normalizedQuery = query?.trim();

  return prisma.song.findMany({
    where: {
      userId,
      ...(normalizedQuery
        ? {
            OR: [
              {
                title: {
                  contains: normalizedQuery,
                  mode: "insensitive",
                },
              },
              {
                artist: {
                  contains: normalizedQuery,
                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      id: true,
      title: true,
      artist: true,
      key: true,
      versionName: true,
      updatedAt: true,
    },
  });
}

export async function getSongById(id: string, userId: string) {
  return prisma.song.findFirst({
    where: {
      id,
      userId,
    },
  });
}

export async function getSongVersions(songId: string, userId: string) {
  const song = await getSongById(songId, userId);

  if (!song) {
    return [];
  }

  const versionGroupId = song.versionGroupId ?? song.id;

  return prisma.song.findMany({
    where: {
      userId,
      OR: [{ id: versionGroupId }, { versionGroupId }],
    },
    orderBy: [{ createdAt: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      versionName: true,
      updatedAt: true,
    },
  });
}

export async function createSong(userId: string, formData: FormData) {
  const { input, errors } = parseSongInput(formData);

  if (Object.keys(errors).length > 0) {
    return {
      success: false as const,
      errors,
    };
  }

  try {
    if (await hasReachedSongLimit(userId)) {
      return {
        success: false as const,
        errors: {
          form: `Alcanzaste el limite inicial de ${MAX_SONGS_PER_USER} canciones para esta beta.`,
        },
      };
    }

    const song = await prisma.song.create({
      data: {
        ...input,
        userId,
      },
    });

    return {
      success: true as const,
      song,
    };
  } catch {
    return {
      success: false as const,
      errors: {
        form: "No pudimos guardar la canción. Intentá de nuevo.",
      },
    };
  }
}

export async function createSongVersion(
  songId: string,
  userId: string,
): Promise<CreateSongVersionResult> {
  const song = await getSongById(songId, userId);

  if (!song) {
    return {
      success: false,
      reason: "not-found",
    };
  }

  const versionGroupId = song.versionGroupId ?? song.id;

  if (await hasReachedSongLimit(userId)) {
    return {
      success: false,
      reason: "limit-reached",
    };
  }

  const version = await prisma.song.create({
    data: {
      title: song.title,
      artist: song.artist,
      key: song.key,
      versionName: "Nueva versión",
      versionGroupId,
      content: song.content,
      notes: song.notes,
      userId,
    },
  });

  return {
    success: true,
    version,
  };
}

export async function updateSong(
  id: string,
  userId: string,
  formData: FormData,
) {
  const { input, errors } = parseSongInput(formData);

  if (Object.keys(errors).length > 0) {
    return {
      success: false as const,
      errors,
    };
  }

  try {
    const existingSong = await prisma.song.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!existingSong) {
      return {
        success: false as const,
        errors: {
          form: "La canción que intentás editar no existe.",
        },
      };
    }

    const song = await prisma.song.update({
      where: { id },
      data: input,
    });

    return {
      success: true as const,
      song,
    };
  } catch {
    return {
      success: false as const,
      errors: {
        form: "No pudimos actualizar la canción. Intentá de nuevo.",
      },
    };
  }
}

export async function deleteSong(id: string, userId: string) {
  try {
    const deleted = await prisma.song.deleteMany({
      where: {
        id,
        userId,
      },
    });

    return deleted.count > 0;
  } catch {
    return null;
  }
}

export function formatSongDate(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
