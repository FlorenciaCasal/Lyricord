import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type SongListItem = Prisma.SongGetPayload<{
  select: {
    id: true;
    title: true;
    artist: true;
    key: true;
    updatedAt: true;
  };
}>;

export type SongFormState = {
  errors: {
    title?: string;
    content?: string;
    form?: string;
  };
};

type SongInput = {
  title: string;
  artist: string | null;
  key: string | null;
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

  const errors: SongFormState["errors"] = {};

  if (!title) {
    errors.title = "El título es obligatorio.";
  }

  if (!content) {
    errors.content = "El contenido es obligatorio.";
  }

  const input: SongInput = {
    title,
    artist: normalizeOptionalField(formData.get("artist")),
    key: normalizeOptionalField(formData.get("key")),
    content,
    notes: normalizeOptionalField(formData.get("notes")),
  };

  return {
    input,
    errors,
  };
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

export async function createSong(userId: string, formData: FormData) {
  const { input, errors } = parseSongInput(formData);

  if (Object.keys(errors).length > 0) {
    return {
      success: false as const,
      errors,
    };
  }

  try {
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
