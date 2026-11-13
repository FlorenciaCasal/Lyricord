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
  songs?: MobileSongSyncDto[];
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
  updateManyAndReturn(args: Record<string, unknown>): Promise<SongSyncRecord[]>;
};

type SongSyncDependencies = {
  song: SongSyncDelegate;
  now: () => Date;
  transaction: <T>(task: (song: SongSyncDelegate) => Promise<T>) => Promise<T>;
};

type ParsedGroupDeletion =
  | {
      ok: true;
      value: {
        principalId: string;
        principalClientId: string;
        deletedAt: string;
        members: Array<{ id: string; clientId: string; baseUpdatedAt: string }>;
      };
    }
  | { ok: false; principalId: string | null; principalClientId: string | null; message: string };

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
  const prisma = dependencies?.song ? null : (await import("@/lib/prisma")).prisma;
  const song = dependencies?.song ?? (prisma!.song as unknown as SongSyncDelegate);
  return {
    song,
    now: dependencies?.now ?? (() => new Date()),
    transaction: dependencies?.transaction ?? (prisma
      ? ((task) => prisma.$transaction(
          (client) => task(client.song as unknown as SongSyncDelegate),
          { isolationLevel: "Serializable" },
        ))
      : ((task) => task(song))),
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

function parseGroupDeletion(input: unknown): ParsedGroupDeletion {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, principalId: null, principalClientId: null, message: "Eliminacion grupal invalida." };
  }
  const record = input as Record<string, unknown>;
  const principalId = normalizeOptionalText(record.principalId);
  const principalClientId = normalizeOptionalText(record.principalClientId);
  const deletedAt = parseIsoDate(record.deletedAt);
  if (!principalId || !isSafeExternalId(principalId)) {
    return { ok: false, principalId, principalClientId, message: "ID principal invalido." };
  }
  if (!principalClientId || !isSafeExternalId(principalClientId)) {
    return { ok: false, principalId, principalClientId, message: "ID local principal invalido." };
  }
  if (!deletedAt) {
    return { ok: false, principalId, principalClientId, message: "deletedAt invalido." };
  }
  if (!Array.isArray(record.members) || record.members.length === 0 || record.members.length > MAX_SYNC_BATCH_SIZE) {
    return { ok: false, principalId, principalClientId, message: "El grupo necesita una lista valida de miembros." };
  }

  const members: Array<{ id: string; clientId: string; baseUpdatedAt: string }> = [];
  const ids = new Set<string>();
  for (const rawMember of record.members) {
    if (!rawMember || typeof rawMember !== "object" || Array.isArray(rawMember)) {
      return { ok: false, principalId, principalClientId, message: "Miembro de grupo invalido." };
    }
    const member = rawMember as Record<string, unknown>;
    const id = normalizeOptionalText(member.id);
    const clientId = normalizeOptionalText(member.clientId);
    const baseUpdatedAt = parseIsoDate(member.baseUpdatedAt);
    if (!id || !isSafeExternalId(id) || !clientId || !isSafeExternalId(clientId) || !baseUpdatedAt || ids.has(id)) {
      return { ok: false, principalId, principalClientId, message: "Miembro de grupo invalido o duplicado." };
    }
    ids.add(id);
    members.push({ id, clientId, baseUpdatedAt });
  }
  if (!ids.has(principalId)) {
    return { ok: false, principalId, principalClientId, message: "La cancion principal debe integrar el grupo." };
  }
  return { ok: true, value: { principalId, principalClientId, deletedAt, members } };
}

function isSameSongState(
  song: SongSyncRecord,
  change: ParsedSyncChange & { ok: true },
  versionGroupId: string | null,
) {
  const value = change.value;
  return (
    song.deletedAt === null &&
    song.title === value.title &&
    song.artist === value.artist &&
    song.key === value.key &&
    song.versionName === value.versionName &&
    song.content === value.content &&
    song.notes === value.notes &&
    song.versionGroupId === versionGroupId
  );
}

function isUniqueConstraintError(error: unknown) {
  return !!error && typeof error === "object" && "code" in error && error.code === "P2002";
}

async function findOwnedSongById(userId: string, id: string, dependencies: SongSyncDependencies) {
  return dependencies.song.findFirst({ where: { id, userId } });
}

function conflictResult(
  change: ParsedSyncChange & { ok: true },
  song: SongSyncRecord,
  message: string,
): MobileSongSyncPushResult {
  return {
    clientId: change.value.clientId,
    id: song.id,
    status: "conflict",
    song: toMobileSongSyncDto(song),
    error: { code: "CONFLICT", message },
  };
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

class GroupDeleteWriteConflict extends Error {
  constructor() {
    super("GROUP_DELETE_WRITE_CONFLICT");
    this.name = "GroupDeleteWriteConflict";
  }
}

function isTransactionWriteConflict(error: unknown) {
  return error instanceof GroupDeleteWriteConflict ||
    (!!error && typeof error === "object" && "code" in error && error.code === "P2034");
}

async function readOwnedGroup(userId: string, principalId: string, song: SongSyncDelegate) {
  return song.findMany({
    where: {
      userId,
      OR: [{ id: principalId }, { versionGroupId: principalId }],
    },
  });
}

function groupDeleteResult(
  parsed: ParsedGroupDeletion & { ok: true },
  status: "deleted" | "unchanged" | "conflict" | "error",
  songs: SongSyncRecord[],
  message?: string,
): MobileSongSyncPushResult {
  return {
    clientId: parsed.value.principalClientId,
    id: parsed.value.principalId,
    status,
    songs: songs.map(toMobileSongSyncDto),
    ...(message
      ? { error: { code: status === "conflict" ? "CONFLICT" as const : "INTERNAL_ERROR" as const, message } }
      : {}),
  };
}

function validateGroupDeletionState(
  parsed: ParsedGroupDeletion & { ok: true },
  rows: SongSyncRecord[],
) {
  const { principalId, principalClientId, members } = parsed.value;
  const principal = rows.find((song) => song.id === principalId);
  if (!principal || (principal.versionGroupId !== null && principal.versionGroupId !== principal.id)) {
    return "No encontramos la cancion principal de este grupo.";
  }
  if (principal.clientId && principal.clientId !== principalClientId) {
    return "La cancion principal no coincide con este dispositivo.";
  }

  const memberById = new Map(members.map((member) => [member.id, member]));
  const rowById = new Map(rows.map((song) => [song.id, song]));
  if (members.some((member) => {
    const song = rowById.get(member.id);
    return !song || (song.clientId !== null && song.clientId !== member.clientId);
  })) {
    return "El grupo remoto no coincide con los miembros enviados.";
  }
  if (rows.some((song) => song.deletedAt === null && !memberById.has(song.id))) {
    return "El grupo tiene versiones activas que no fueron incluidas.";
  }
  if (rows.some((song) => song.id !== principalId && song.versionGroupId !== principalId)) {
    return "El grupo contiene una relacion de versiones invalida.";
  }
  return null;
}

async function applyGroupDeletion(
  userId: string,
  rawChange: unknown,
  dependencies: SongSyncDependencies,
): Promise<MobileSongSyncPushResult> {
  const parsed = parseGroupDeletion(rawChange);
  if (!parsed.ok) {
    return {
      clientId: parsed.principalClientId,
      id: parsed.principalId,
      status: "error",
      error: { code: "VALIDATION_ERROR", message: parsed.message },
    };
  }

  const execute = async (song: SongSyncDelegate) => {
    const rows = await readOwnedGroup(userId, parsed.value.principalId, song);
    const validationError = validateGroupDeletionState(parsed, rows);
    if (validationError) return groupDeleteResult(parsed, "conflict", rows, validationError);

    const memberById = new Map(parsed.value.members.map((member) => [member.id, member]));
    const active = rows.filter((row) => row.deletedAt === null);
    const revisionChanged = active.some((row) => {
      const member = memberById.get(row.id);
      return !member || toIsoDate(row.updatedAt) !== member.baseUpdatedAt;
    });
    if (revisionChanged) {
      return groupDeleteResult(parsed, "conflict", rows, "El grupo cambio en otro dispositivo.");
    }
    if (active.length === 0) return groupDeleteResult(parsed, "unchanged", rows);

    const updated = await song.updateManyAndReturn({
      where: {
        userId,
        deletedAt: null,
        OR: active.map((row) => ({ id: row.id, updatedAt: new Date(memberById.get(row.id)!.baseUpdatedAt) })),
      },
      data: { deletedAt: new Date(parsed.value.deletedAt) },
    });
    if (updated.length !== active.length) throw new GroupDeleteWriteConflict();

    const updatedById = new Map(updated.map((row) => [row.id, row]));
    return groupDeleteResult(
      parsed,
      "deleted",
      rows.map((row) => updatedById.get(row.id) ?? row),
    );
  };

  try {
    return await dependencies.transaction(execute);
  } catch (error) {
    if (!isTransactionWriteConflict(error)) throw error;
    const latest = await readOwnedGroup(userId, parsed.value.principalId, dependencies.song);
    const validationError = validateGroupDeletionState(parsed, latest);
    if (!validationError && latest.length > 0 && latest.every((row) => row.deletedAt !== null)) {
      return groupDeleteResult(parsed, "unchanged", latest);
    }
    return groupDeleteResult(parsed, "conflict", latest, "El grupo cambio mientras se eliminaba.");
  }
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

    const expectedUpdatedAt = change.baseUpdatedAt ?? toIsoDate(existing.updatedAt);
    const deleted = await dependencies.song.updateManyAndReturn({
      where: {
        id: existing.id,
        userId,
        updatedAt: new Date(expectedUpdatedAt ?? ""),
        deletedAt: null,
      },
      data: { deletedAt: new Date(change.deletedAt) },
    });

    if (deleted.length === 0) {
      const latest = await findOwnedSongById(userId, existing.id, dependencies);
      if (!latest) return resultError(change, "NOT_FOUND", "La cancion remota no existe para esta cuenta.");
      if (latest.deletedAt) {
        return {
          clientId: latest.clientId,
          id: latest.id,
          status: "unchanged",
          song: toMobileSongSyncDto(latest),
        };
      }
      return conflictResult(parsed, latest, "La cancion cambio en otro dispositivo antes de borrarse.");
    }

    const applied = deleted[0];

    return {
      clientId: applied.clientId,
      id: applied.id,
      status: "deleted",
      song: toMobileSongSyncDto(applied),
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

    const versionGroupId = await resolveVersionGroupId(userId, parsed, dependencies);
    if (versionGroupId === undefined) {
      return resultError(change, "VALIDATION_ERROR", "No encontramos la cancion principal de esa version.");
    }
    const nextVersionGroupId = versionGroupId === null ? existing.versionGroupId : versionGroupId;

    if (!change.baseUpdatedAt) {
      if (isSameSongState(existing, parsed, nextVersionGroupId)) {
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

    const updated = await dependencies.song.updateManyAndReturn({
      where: {
        id: existing.id,
        userId,
        updatedAt: new Date(change.baseUpdatedAt),
        deletedAt: null,
      },
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

    if (updated.length === 0) {
      const latest = await findOwnedSongById(userId, existing.id, dependencies);
      if (!latest) return resultError(change, "NOT_FOUND", "La cancion remota no existe para esta cuenta.");
      if (isSameSongState(latest, parsed, nextVersionGroupId)) {
        return {
          clientId: latest.clientId,
          id: latest.id,
          status: "unchanged",
          song: toMobileSongSyncDto(latest),
        };
      }
      return conflictResult(parsed, latest, "La cancion cambio en otro dispositivo.");
    }

    const applied = updated[0];

    return {
      clientId: applied.clientId,
      id: applied.id,
      status: "updated",
      song: toMobileSongSyncDto(applied),
    };
  }

  if (change.id) {
    return resultError(change, "NOT_FOUND", "La cancion remota no existe para esta cuenta.");
  }

  const versionGroupId = await resolveVersionGroupId(userId, parsed, dependencies);
  if (versionGroupId === undefined) {
    return resultError(change, "VALIDATION_ERROR", "No encontramos la cancion principal de esa version.");
  }

  let created: SongSyncRecord;
  try {
    created = await dependencies.song.create({
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
  } catch (error) {
    if (!change.clientId || !isUniqueConstraintError(error)) throw error;
    const concurrent = await dependencies.song.findFirst({ where: { userId, clientId: change.clientId } });
    if (!concurrent) throw error;
    if (isSameSongState(concurrent, parsed, versionGroupId)) {
      return {
        clientId: concurrent.clientId,
        id: concurrent.id,
        status: "unchanged",
        song: toMobileSongSyncDto(concurrent),
      };
    }
    return conflictResult(parsed, concurrent, "Otra solicitud creo una cancion diferente con el mismo identificador.");
  }

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
      const operation = change && typeof change === "object" && !Array.isArray(change)
        ? (change as Record<string, unknown>).operation
        : null;
      results.push(operation === "deleteGroup"
        ? await applyGroupDeletion(userId, change, deps)
        : await applySyncChange(userId, change, deps));
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
