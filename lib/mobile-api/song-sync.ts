const MAX_SYNC_BATCH_SIZE = 100;
const MAX_SYNC_PULL_LIMIT = 200;
const MAX_CLIENT_ID_LENGTH = 120;
const MAX_TITLE_LENGTH = 120;
const MAX_ARTIST_LENGTH = 120;
const MAX_KEY_LENGTH = 40;
const MAX_VERSION_NAME_LENGTH = 80;
const MAX_CONTENT_LENGTH = 100_000;
const MAX_NOTES_LENGTH = 10_000;

export type MobileSongSyncStatus =
  | "created"
  | "updated"
  | "deleted"
  | "unchanged"
  | "conflict"
  | "error";

export type MobileSongSyncDto = {
  id: string;
  clientId: string | null;
  title: string;
  artist: string | null;
  key: string | null;
  versionName: string | null;
  versionGroupId: string | null;
  content: string;
  notes: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MobileSongSyncPushResult = {
  clientId: string | null;
  id: string | null;
  status: MobileSongSyncStatus;
  song?: MobileSongSyncDto;
  error?: {
    code: "VALIDATION_ERROR" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR";
    message: string;
  };
};

type SongSyncRecord = {
  id: string;
  clientId: string | null;
  title: string;
  artist: string | null;
  key: string | null;
  versionName: string | null;
  versionGroupId: string | null;
  content: string;
  notes: string | null;
  deletedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  userId: string;
};

type SongSyncDelegate = {
  findMany(args: Record<string, unknown>): Promise<SongSyncRecord[]>;
  findFirst(args: Record<string, unknown>): Promise<SongSyncRecord | null>;
  create(args: Record<string, unknown>): Promise<SongSyncRecord>;
  update(args: Record<string, unknown>): Promise<SongSyncRecord>;
};

type SongSyncDependencies = {
  song: SongSyncDelegate;
  now: () => Date;
};

type ParsedSyncChange =
  | {
      ok: true;
      value: {
        id: string | null;
        clientId: string | null;
        baseUpdatedAt: string | null;
        deletedAt: string | null;
        versionGroupId: string | null;
        versionGroupClientId: string | null;
        title: string;
        artist: string | null;
        key: string | null;
        versionName: string | null;
        content: string;
        notes: string | null;
      };
    }
  | {
      ok: false;
      clientId: string | null;
      id: string | null;
      message: string;
    };

type PullCursor = {
  updatedAt: string;
  id: string;
};

async function getDependencies(dependencies?: Partial<SongSyncDependencies>): Promise<SongSyncDependencies> {
  const song = dependencies?.song ?? ((await import("@/lib/prisma")).prisma.song as unknown as SongSyncDelegate);
  return {
    song,
    now: dependencies?.now ?? (() => new Date()),
  };
}

function toIsoDate(value: Date | string | null) {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export function toMobileSongSyncDto(song: SongSyncRecord): MobileSongSyncDto {
  return {
    id: song.id,
    clientId: song.clientId,
    title: song.title,
    artist: song.artist,
    key: song.key,
    versionName: song.versionName,
    versionGroupId: song.versionGroupId,
    content: song.content,
    notes: song.notes,
    deletedAt: toIsoDate(song.deletedAt),
    createdAt: toIsoDate(song.createdAt) ?? "",
    updatedAt: toIsoDate(song.updatedAt) ?? "",
  };
}

function normalizeOptionalText(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isSafeExternalId(value: string) {
  return value.length > 0 && value.length <= MAX_CLIENT_ID_LENGTH && /^[a-z0-9_.:-]+$/i.test(value);
}

function parseIsoDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function validateLength(value: string | null, maxLength: number, label: string) {
  if (value !== null && value.length > maxLength) {
    return `${label} no puede superar ${maxLength.toLocaleString("es-AR")} caracteres.`;
  }
  return null;
}

function parseSyncChange(input: unknown): ParsedSyncChange {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, clientId: null, id: null, message: "Cambio invalido." };
  }

  const record = input as Record<string, unknown>;
  const id = normalizeOptionalText(record.id);
  const clientId = normalizeOptionalText(record.clientId);

  if (id && !isSafeExternalId(id)) {
    return { ok: false, clientId, id, message: "ID remoto invalido." };
  }

  if (clientId && !isSafeExternalId(clientId)) {
    return { ok: false, clientId, id, message: "ID local invalido." };
  }

  if (!id && !clientId) {
    return { ok: false, clientId: null, id: null, message: "Cada cambio necesita id o clientId." };
  }

  const title = normalizeText(record.title).trim();
  const content = normalizeText(record.content);
  const artist = normalizeOptionalText(record.artist);
  const key = normalizeOptionalText(record.key);
  const versionName = normalizeOptionalText(record.versionName);
  const notes = typeof record.notes === "string" ? normalizeOptionalText(record.notes) : null;
  const versionGroupId = normalizeOptionalText(record.versionGroupId);
  const versionGroupClientId = normalizeOptionalText(record.versionGroupClientId);
  const baseUpdatedAt = parseIsoDate(record.baseUpdatedAt);
  const deletedAt = parseIsoDate(record.deletedAt);

  const lengthError =
    validateLength(title, MAX_TITLE_LENGTH, "El titulo") ??
    validateLength(artist, MAX_ARTIST_LENGTH, "El artista") ??
    validateLength(key, MAX_KEY_LENGTH, "El tono") ??
    validateLength(versionName, MAX_VERSION_NAME_LENGTH, "La version") ??
    validateLength(content, MAX_CONTENT_LENGTH, "El contenido") ??
    validateLength(notes, MAX_NOTES_LENGTH, "Las notas");

  if (lengthError) {
    return { ok: false, clientId, id, message: lengthError };
  }

  if (record.baseUpdatedAt && !baseUpdatedAt) {
    return { ok: false, clientId, id, message: "baseUpdatedAt invalido." };
  }

  if (record.deletedAt && !deletedAt) {
    return { ok: false, clientId, id, message: "deletedAt invalido." };
  }

  return {
    ok: true,
    value: {
      id,
      clientId,
      baseUpdatedAt,
      deletedAt,
      versionGroupId,
      versionGroupClientId,
      title,
      artist,
      key,
      versionName,
      content,
      notes,
    },
  };
}

function isSameSongContent(song: SongSyncRecord, change: ParsedSyncChange & { ok: true }) {
  const value = change.value;
  return (
    song.deletedAt === null &&
    song.title === value.title &&
    song.artist === value.artist &&
    song.key === value.key &&
    song.versionName === value.versionName &&
    song.content === value.content &&
    song.notes === value.notes
  );
}

function resultError(
  change: { clientId: string | null; id: string | null },
  code: NonNullable<MobileSongSyncPushResult["error"]>["code"],
  message: string,
): MobileSongSyncPushResult {
  return {
    clientId: change.clientId,
    id: change.id,
    status: code === "CONFLICT" ? "conflict" : "error",
    error: { code, message },
  };
}

async function findOwnedSongByIdOrClientId(
  userId: string,
  id: string | null,
  clientId: string | null,
  dependencies: SongSyncDependencies,
) {
  if (id) {
    const byId = await dependencies.song.findFirst({
      where: { id, userId },
    });
    if (byId) return byId;
  }

  if (clientId) {
    return dependencies.song.findFirst({
      where: { userId, clientId },
    });
  }

  return null;
}

async function resolveVersionGroupId(
  userId: string,
  change: ParsedSyncChange & { ok: true },
  dependencies: SongSyncDependencies,
) {
  const { versionGroupId, versionGroupClientId } = change.value;

  if (versionGroupId) {
    const groupSong = await dependencies.song.findFirst({
      where: { id: versionGroupId, userId, deletedAt: null },
    });
    return groupSong ? groupSong.versionGroupId ?? groupSong.id : undefined;
  }

  if (versionGroupClientId) {
    const groupSong = await dependencies.song.findFirst({
      where: { clientId: versionGroupClientId, userId, deletedAt: null },
    });
    return groupSong ? groupSong.versionGroupId ?? groupSong.id : undefined;
  }

  return null;
}

async function applySyncChange(
  userId: string,
  rawChange: unknown,
  dependencies: SongSyncDependencies,
): Promise<MobileSongSyncPushResult> {
  const parsed = parseSyncChange(rawChange);
  if (!parsed.ok) return resultError(parsed, "VALIDATION_ERROR", parsed.message);

  const change = parsed.value;
  const existing = await findOwnedSongByIdOrClientId(userId, change.id, change.clientId, dependencies);

  if (change.deletedAt) {
    if (!existing) {
      return resultError(change, "NOT_FOUND", "La cancion remota no existe para esta cuenta.");
    }

    if (existing.deletedAt) {
      return {
        clientId: existing.clientId,
        id: existing.id,
        status: "unchanged",
        song: toMobileSongSyncDto(existing),
      };
    }

    if (change.baseUpdatedAt && toIsoDate(existing.updatedAt) !== change.baseUpdatedAt) {
      return {
        clientId: change.clientId,
        id: existing.id,
        status: "conflict",
        song: toMobileSongSyncDto(existing),
        error: {
          code: "CONFLICT",
          message: "La cancion cambio en otro dispositivo antes de borrarse.",
        },
      };
    }

    const deleted = await dependencies.song.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(change.deletedAt) },
    });

    return {
      clientId: deleted.clientId,
      id: deleted.id,
      status: "deleted",
      song: toMobileSongSyncDto(deleted),
    };
  }

  if (existing) {
    if (existing.deletedAt) {
      return {
        clientId: existing.clientId,
        id: existing.id,
        status: "conflict",
        song: toMobileSongSyncDto(existing),
        error: {
          code: "CONFLICT",
          message: "La cancion ya fue eliminada en el servidor.",
        },
      };
    }

    if (!change.baseUpdatedAt) {
      if (isSameSongContent(existing, parsed)) {
        return {
          clientId: existing.clientId,
          id: existing.id,
          status: "unchanged",
          song: toMobileSongSyncDto(existing),
        };
      }

      return {
        clientId: existing.clientId,
        id: existing.id,
        status: "conflict",
        song: toMobileSongSyncDto(existing),
        error: {
          code: "CONFLICT",
          message: "Falta baseUpdatedAt para actualizar una cancion existente.",
        },
      };
    }

    if (toIsoDate(existing.updatedAt) !== change.baseUpdatedAt) {
      return {
        clientId: existing.clientId,
        id: existing.id,
        status: "conflict",
        song: toMobileSongSyncDto(existing),
        error: {
          code: "CONFLICT",
          message: "La cancion cambio en otro dispositivo.",
        },
      };
    }

    const versionGroupId = await resolveVersionGroupId(userId, parsed, dependencies);
    if (versionGroupId === undefined) {
      return resultError(change, "VALIDATION_ERROR", "No encontramos la cancion principal de esa version.");
    }
    const nextVersionGroupId = versionGroupId === null ? existing.versionGroupId : versionGroupId;

    const updated = await dependencies.song.update({
      where: { id: existing.id },
      data: {
        clientId: existing.clientId ?? change.clientId,
        title: change.title,
        artist: change.artist,
        key: change.key,
        versionName: change.versionName,
        versionGroupId: nextVersionGroupId,
        content: change.content,
        notes: change.notes,
        deletedAt: null,
      },
    });

    return {
      clientId: updated.clientId,
      id: updated.id,
      status: "updated",
      song: toMobileSongSyncDto(updated),
    };
  }

  if (change.id) {
    return resultError(change, "NOT_FOUND", "La cancion remota no existe para esta cuenta.");
  }

  const versionGroupId = await resolveVersionGroupId(userId, parsed, dependencies);
  if (versionGroupId === undefined) {
    return resultError(change, "VALIDATION_ERROR", "No encontramos la cancion principal de esa version.");
  }

  const created = await dependencies.song.create({
    data: {
      clientId: change.clientId,
      title: change.title,
      artist: change.artist,
      key: change.key,
      versionName: change.versionName,
      versionGroupId,
      content: change.content,
      notes: change.notes,
      userId,
    },
  });

  return {
    clientId: created.clientId,
    id: created.id,
    status: "created",
    song: toMobileSongSyncDto(created),
  };
}

export async function pullMobileSongSyncChanges(
  userId: string,
  query: URLSearchParams,
  dependencies?: Partial<SongSyncDependencies>,
) {
  const deps = await getDependencies(dependencies);
  const since = parseIsoDate(query.get("since"));
  const cursor = decodePullCursor(query.get("cursor"));
  const requestedLimit = Number(query.get("limit") ?? MAX_SYNC_PULL_LIMIT);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(MAX_SYNC_PULL_LIMIT, Math.trunc(requestedLimit)))
    : MAX_SYNC_PULL_LIMIT;

  if (query.get("since") && !since) {
    return {
      success: false as const,
      status: 400,
      message: "Parametro since invalido.",
    };
  }

  if (query.get("cursor") && !cursor) {
    return {
      success: false as const,
      status: 400,
      message: "Parametro cursor invalido.",
    };
  }

  const updatedCursor = cursor?.updatedAt ?? since;
  const rows = await deps.song.findMany({
    where: {
      userId,
      ...(updatedCursor
        ? {
            OR: cursor
              ? [
                  { updatedAt: { gt: new Date(cursor.updatedAt) } },
                  { updatedAt: new Date(cursor.updatedAt), id: { gt: cursor.id } },
                ]
              : [{ updatedAt: { gt: new Date(updatedCursor) } }],
          }
        : {}),
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const visibleRows = hasMore ? rows.slice(0, limit) : rows;
  const lastRow = visibleRows.at(-1);

  return {
    success: true as const,
    songs: visibleRows.map(toMobileSongSyncDto),
    serverTime: deps.now().toISOString(),
    nextCursor: hasMore && lastRow ? encodePullCursor(lastRow) : null,
  };
}

export async function pushMobileSongSyncChanges(
  userId: string,
  payload: unknown,
  dependencies?: Partial<SongSyncDependencies>,
) {
  const deps = await getDependencies(dependencies);

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      success: false as const,
      status: 400,
      message: "Payload invalido.",
    };
  }

  const changes = (payload as Record<string, unknown>).changes;
  if (!Array.isArray(changes)) {
    return {
      success: false as const,
      status: 400,
      message: "changes debe ser una lista.",
    };
  }

  if (changes.length > MAX_SYNC_BATCH_SIZE) {
    return {
      success: false as const,
      status: 413,
      message: `No se pueden sincronizar mas de ${MAX_SYNC_BATCH_SIZE} cambios por solicitud.`,
    };
  }

  const results: MobileSongSyncPushResult[] = [];
  for (const change of changes) {
    try {
      results.push(await applySyncChange(userId, change, deps));
    } catch (error) {
      console.error("Mobile song sync: error aplicando cambio.", { error });
      const parsed = parseSyncChange(change);
      results.push(
        resultError(
          parsed.ok ? parsed.value : parsed,
          "INTERNAL_ERROR",
          "No pudimos sincronizar este cambio.",
        ),
      );
    }
  }

  return {
    success: true as const,
    results,
    serverTime: deps.now().toISOString(),
  };
}

function encodePullCursor(song: SongSyncRecord) {
  const payload: PullCursor = {
    updatedAt: toIsoDate(song.updatedAt) ?? "",
    id: song.id,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePullCursor(value: string | null): PullCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<PullCursor>;
    if (!parsed.updatedAt || !parsed.id || !parseIsoDate(parsed.updatedAt)) return null;
    return { updatedAt: parsed.updatedAt, id: parsed.id };
  } catch {
    return null;
  }
}
