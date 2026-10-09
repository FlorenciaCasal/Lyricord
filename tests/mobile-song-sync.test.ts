import assert from "node:assert/strict";
import test from "node:test";
import {
  pullMobileSongSyncChanges,
  pushMobileSongSyncChanges,
} from "../lib/mobile-api/song-sync.ts";

type FakeSong = {
  id: string;
  clientId: string | null;
  title: string;
  artist: string | null;
  key: string | null;
  versionName: string | null;
  versionGroupId: string | null;
  content: string;
  notes: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
};

type Where = Record<string, unknown>;

function baseDate(offsetMs = 0) {
  return new Date(Date.UTC(2026, 9, 8, 12, 0, 0, offsetMs));
}

function makeSong(values: Partial<FakeSong> & Pick<FakeSong, "id" | "userId" | "title">): FakeSong {
  return {
    clientId: null,
    artist: null,
    key: null,
    versionName: "Principal",
    versionGroupId: null,
    content: "",
    notes: null,
    deletedAt: null,
    createdAt: baseDate(),
    updatedAt: baseDate(),
    ...values,
  };
}

function matchesValue(actual: unknown, expected: unknown) {
  if (expected instanceof Date && actual instanceof Date) {
    return actual.getTime() === expected.getTime();
  }
  if (expected instanceof Date && typeof actual === "string") {
    return new Date(actual).getTime() === expected.getTime();
  }
  return actual === expected;
}

function matchesWhere(song: FakeSong, where: Where): boolean {
  for (const [key, expected] of Object.entries(where)) {
    if (key === "OR" && Array.isArray(expected)) {
      if (!expected.some((condition) => matchesWhere(song, condition as Where))) return false;
      continue;
    }

    if (expected && typeof expected === "object" && !Array.isArray(expected) && !(expected instanceof Date)) {
      const operators = expected as Record<string, unknown>;
      if ("gt" in operators) {
        const actual = song[key as keyof FakeSong];
        if (!(actual instanceof Date) || actual.getTime() <= new Date(operators.gt as string | Date).getTime()) {
          return false;
        }
      }
      continue;
    }

    if (!matchesValue(song[key as keyof FakeSong], expected)) return false;
  }

  return true;
}

function createFakeSongDelegate(initialSongs: FakeSong[] = []) {
  let nextId = initialSongs.length + 1;
  const songs = new Map(initialSongs.map((song) => [song.id, song]));

  return {
    songs,
    delegate: {
      async findMany(args: { where?: Where; orderBy?: Array<Record<string, string>>; take?: number }) {
        const where = args.where ?? {};
        const sorted = Array.from(songs.values())
          .filter((song) => matchesWhere(song, where))
          .sort((left, right) => left.updatedAt.getTime() - right.updatedAt.getTime() || left.id.localeCompare(right.id));
        return typeof args.take === "number" ? sorted.slice(0, args.take) : sorted;
      },

      async findFirst(args: { where?: Where }) {
        const where = args.where ?? {};
        return Array.from(songs.values()).find((song) => matchesWhere(song, where)) ?? null;
      },

      async create(args: { data: Partial<FakeSong> & Pick<FakeSong, "title" | "content" | "userId"> }) {
        const id = `remote_${nextId++}`;
        const now = baseDate(nextId);
        const song = makeSong({
          id,
          userId: args.data.userId,
          clientId: args.data.clientId ?? null,
          title: args.data.title,
          artist: args.data.artist ?? null,
          key: args.data.key ?? null,
          versionName: args.data.versionName ?? null,
          versionGroupId: args.data.versionGroupId ?? null,
          content: args.data.content,
          notes: args.data.notes ?? null,
          createdAt: now,
          updatedAt: now,
        });
        songs.set(id, song);
        return song;
      },

      async update(args: { where: { id: string }; data: Partial<FakeSong> }) {
        const current = songs.get(args.where.id);
        if (!current) throw new Error("Song not found in fake");
        const next = {
          ...current,
          ...args.data,
          updatedAt: baseDate(++nextId),
        } as FakeSong;
        songs.set(next.id, next);
        return next;
      },
    },
  };
}

function assertSuccess<T extends { success: boolean }>(response: T): asserts response is T & { success: true } {
  assert.equal(response.success, true);
}

const emptySongChange = {
  clientId: "local_1",
  title: "Nueva",
  artist: null,
  key: null,
  versionName: "Principal",
  content: "",
  notes: null,
};

test("mobile sync crea canciones idempotentes por userId y clientId, incluso con contenido vacio", async () => {
  const fake = createFakeSongDelegate();

  const first = await pushMobileSongSyncChanges("user_1", { changes: [emptySongChange] }, { song: fake.delegate });
  const second = await pushMobileSongSyncChanges("user_1", { changes: [emptySongChange] }, { song: fake.delegate });

  assertSuccess(first);
  assert.equal(first.results[0].status, "created");
  assertSuccess(second);
  assert.equal(second.results[0].status, "unchanged");
  assert.equal(first.results[0].id, second.results[0].id);
  assert.equal(fake.songs.size, 1);
  assert.equal(first.results[0].song?.content, "");
});

test("mobile sync no duplica clientId entre reintentos pero aisla cuentas distintas", async () => {
  const fake = createFakeSongDelegate();

  const userOne = await pushMobileSongSyncChanges("user_1", { changes: [emptySongChange] }, { song: fake.delegate });
  const userTwo = await pushMobileSongSyncChanges("user_2", { changes: [emptySongChange] }, { song: fake.delegate });

  assertSuccess(userOne);
  assertSuccess(userTwo);
  assert.equal(userOne.results[0].status, "created");
  assert.equal(userTwo.results[0].status, "created");
  assert.notEqual(userOne.results[0].id, userTwo.results[0].id);
  assert.equal(fake.songs.size, 2);
});

test("mobile sync rechaza ownership cruzado por id remoto", async () => {
  const fake = createFakeSongDelegate([
    makeSong({
      id: "remote_private",
      userId: "owner",
      clientId: "local_owner",
      title: "Privada",
      content: "C G",
    }),
  ]);

  const response = await pushMobileSongSyncChanges(
    "attacker",
    {
      changes: [
        {
          ...emptySongChange,
          id: "remote_private",
          clientId: "local_attacker",
          title: "Ataque",
        },
      ],
    },
    { song: fake.delegate },
  );

  assertSuccess(response);
  assert.equal(response.results[0].status, "error");
  assert.equal(response.results[0].error?.code, "NOT_FOUND");
  assert.equal(fake.songs.get("remote_private")?.title, "Privada");
});

test("mobile sync detecta conflictos de actualizacion concurrente", async () => {
  const fake = createFakeSongDelegate([
    makeSong({
      id: "remote_1",
      userId: "user_1",
      clientId: "local_1",
      title: "Servidor",
      content: "C G",
      updatedAt: baseDate(10),
    }),
  ]);

  const response = await pushMobileSongSyncChanges(
    "user_1",
    {
      changes: [
        {
          ...emptySongChange,
          id: "remote_1",
          clientId: "local_1",
          baseUpdatedAt: baseDate(1).toISOString(),
          title: "Cliente",
          content: "D A",
        },
      ],
    },
    { song: fake.delegate },
  );

  assertSuccess(response);
  assert.equal(response.results[0].status, "conflict");
  assert.equal(response.results[0].song?.title, "Servidor");
  assert.equal(fake.songs.get("remote_1")?.title, "Servidor");
});

test("mobile sync actualiza con baseUpdatedAt vigente", async () => {
  const updatedAt = baseDate(10);
  const fake = createFakeSongDelegate([
    makeSong({
      id: "remote_1",
      userId: "user_1",
      clientId: "local_1",
      title: "Antes",
      content: "C G",
      updatedAt,
    }),
  ]);

  const response = await pushMobileSongSyncChanges(
    "user_1",
    {
      changes: [
        {
          ...emptySongChange,
          id: "remote_1",
          clientId: "local_1",
          baseUpdatedAt: updatedAt.toISOString(),
          title: "Despues",
          content: "D A",
        },
      ],
    },
    { song: fake.delegate },
  );

  assertSuccess(response);
  assert.equal(response.results[0].status, "updated");
  assert.equal(fake.songs.get("remote_1")?.title, "Despues");
});

test("mobile sync convierte eliminaciones en tombstones y reintenta de forma segura", async () => {
  const updatedAt = baseDate(10);
  const fake = createFakeSongDelegate([
    makeSong({
      id: "remote_1",
      userId: "user_1",
      clientId: "local_1",
      title: "A borrar",
      content: "C G",
      updatedAt,
    }),
  ]);
  const deletedAt = baseDate(20).toISOString();
  const change = {
    id: "remote_1",
    clientId: "local_1",
    baseUpdatedAt: updatedAt.toISOString(),
    deletedAt,
  };

  const first = await pushMobileSongSyncChanges("user_1", { changes: [change] }, { song: fake.delegate });
  const second = await pushMobileSongSyncChanges("user_1", { changes: [change] }, { song: fake.delegate });

  assertSuccess(first);
  assert.equal(first.results[0].status, "deleted");
  assertSuccess(second);
  assert.equal(second.results[0].status, "unchanged");
  assert.equal(first.results[0].song?.deletedAt, deletedAt);
});

test("mobile sync conserva grupos de versiones usando versionGroupClientId", async () => {
  const fake = createFakeSongDelegate();

  const response = await pushMobileSongSyncChanges(
    "user_1",
    {
      changes: [
        {
          clientId: "principal",
          title: "Cae el sol",
          content: "C#m A E",
          versionName: "Principal",
        },
        {
          clientId: "version_em",
          versionGroupClientId: "principal",
          title: "Cae el sol",
          content: "Em C G",
          versionName: "Cae el sol en Em",
          key: "Em",
        },
      ],
    },
    { song: fake.delegate },
  );

  assertSuccess(response);
  assert.equal(response.results[0].status, "created");
  assert.equal(response.results[1].status, "created");
  assert.equal(response.results[1].song?.versionGroupId, response.results[0].id);
});

test("mobile sync preserva el grupo de una version existente si actualiza contenido", async () => {
  const updatedAt = baseDate(10);
  const fake = createFakeSongDelegate([
    makeSong({
      id: "remote_version",
      userId: "user_1",
      clientId: "local_version",
      versionGroupId: "remote_principal",
      title: "Cae el sol",
      versionName: "En Em",
      content: "Em C G",
      updatedAt,
    }),
  ]);

  const response = await pushMobileSongSyncChanges(
    "user_1",
    {
      changes: [
        {
          id: "remote_version",
          clientId: "local_version",
          baseUpdatedAt: updatedAt.toISOString(),
          title: "Cae el sol",
          versionName: "En Em",
          content: "Em C G D",
        },
      ],
    },
    { song: fake.delegate },
  );

  assertSuccess(response);
  assert.equal(response.results[0].status, "updated");
  assert.equal(response.results[0].song?.versionGroupId, "remote_principal");
});

test("mobile sync pull devuelve cambios y tombstones por usuario con cursor", async () => {
  const fake = createFakeSongDelegate([
    makeSong({
      id: "older",
      userId: "user_1",
      clientId: "local_older",
      title: "Vieja",
      updatedAt: baseDate(1),
    }),
    makeSong({
      id: "deleted",
      userId: "user_1",
      clientId: "local_deleted",
      title: "Borrada",
      deletedAt: baseDate(20),
      updatedAt: baseDate(20),
    }),
    makeSong({
      id: "other_user",
      userId: "user_2",
      clientId: "local_other",
      title: "Otra cuenta",
      updatedAt: baseDate(30),
    }),
  ]);

  const response = await pullMobileSongSyncChanges(
    "user_1",
    new URLSearchParams({ since: baseDate(10).toISOString(), limit: "1" }),
    { song: fake.delegate, now: () => baseDate(40) },
  );

  assertSuccess(response);
  assert.equal(response.songs.length, 1);
  assert.equal(response.songs[0].id, "deleted");
  assert.equal(response.songs[0].deletedAt, baseDate(20).toISOString());
  assert.equal(response.serverTime, baseDate(40).toISOString());
  assert.equal(response.nextCursor, null);
});

test("mobile sync valida payloads de entrada", async () => {
  const fake = createFakeSongDelegate();

  const response = await pushMobileSongSyncChanges(
    "user_1",
    { changes: [{ clientId: "../bad", title: "X", content: "" }] },
    { song: fake.delegate },
  );

  assertSuccess(response);
  assert.equal(response.results[0].status, "error");
  assert.equal(response.results[0].error?.code, "VALIDATION_ERROR");
  assert.equal(fake.songs.size, 0);
});
