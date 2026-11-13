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
  let transactionTail = Promise.resolve();

  const delegate = {
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
        if (
          args.data.clientId &&
          Array.from(songs.values()).some((song) =>
            song.userId === args.data.userId && song.clientId === args.data.clientId
          )
        ) {
          throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        }
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

      async updateManyAndReturn(args: { where?: Where; data: Partial<FakeSong> }) {
        const where = args.where ?? {};
        const matching = Array.from(songs.values()).filter((song) => matchesWhere(song, where));
        const updated: FakeSong[] = [];
        for (const current of matching) {
          const next = {
            ...current,
            ...args.data,
            updatedAt: baseDate(++nextId),
          } as FakeSong;
          songs.set(next.id, next);
          updated.push(next);
        }
        return updated;
      },
    };

  return {
    songs,
    delegate,
    transaction<T>(task: (song: typeof delegate) => Promise<T>) {
      const run = transactionTail.then(async () => {
        const snapshot = new Map(Array.from(songs, ([id, song]) => [id, { ...song }]));
        try {
          return await task(delegate);
        } catch (error) {
          songs.clear();
          for (const [id, song] of snapshot) songs.set(id, song);
          throw error;
        }
      });
      transactionTail = run.then(() => undefined, () => undefined);
      return run;
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

function groupDeletionChange(principal: FakeSong, versions: FakeSong[] = []) {
  return {
    operation: "deleteGroup",
    principalId: principal.id,
    principalClientId: principal.clientId!,
    deletedAt: baseDate(50).toISOString(),
    members: [principal, ...versions].map((song) => ({
      id: song.id,
      clientId: song.clientId!,
      baseUpdatedAt: song.updatedAt.toISOString(),
    })),
  };
}

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

test("mobile sync permite una sola de dos actualizaciones concurrentes con la misma base", async () => {
  const updatedAt = baseDate(10);
  const fake = createFakeSongDelegate([
    makeSong({
      id: "remote_cas",
      userId: "user_1",
      clientId: "local_cas",
      title: "Base",
      content: "C",
      updatedAt,
    }),
  ]);
  const change = (title: string, content: string) => ({
    ...emptySongChange,
    id: "remote_cas",
    clientId: "local_cas",
    baseUpdatedAt: updatedAt.toISOString(),
    title,
    content,
  });

  const [first, second] = await Promise.all([
    pushMobileSongSyncChanges("user_1", { changes: [change("Dispositivo A", "D")] }, { song: fake.delegate }),
    pushMobileSongSyncChanges("user_1", { changes: [change("Dispositivo B", "E")] }, { song: fake.delegate }),
  ]);

  assertSuccess(first);
  assertSuccess(second);
  assert.deepEqual(
    [first.results[0].status, second.results[0].status].sort(),
    ["conflict", "updated"],
  );
  assert.ok(["Dispositivo A", "Dispositivo B"].includes(fake.songs.get("remote_cas")?.title ?? ""));
});

test("mobile sync reconoce el reintento exacto de una actualizacion ya aplicada", async () => {
  const updatedAt = baseDate(10);
  const fake = createFakeSongDelegate([
    makeSong({ id: "remote_retry_update", userId: "user_1", clientId: "local_retry_update", title: "Antes", content: "C", updatedAt }),
  ]);
  const change = {
    ...emptySongChange,
    id: "remote_retry_update",
    clientId: "local_retry_update",
    baseUpdatedAt: updatedAt.toISOString(),
    title: "Despues",
    content: "D",
  };

  const first = await pushMobileSongSyncChanges("user_1", { changes: [change] }, { song: fake.delegate });
  const retry = await pushMobileSongSyncChanges("user_1", { changes: [change] }, { song: fake.delegate });

  assertSuccess(first);
  assertSuccess(retry);
  assert.equal(first.results[0].status, "updated");
  assert.equal(retry.results[0].status, "unchanged");
  assert.equal(fake.songs.get("remote_retry_update")?.content, "D");
});

test("mobile sync no confunde un reintento con una modificacion remota posterior", async () => {
  const updatedAt = baseDate(10);
  const fake = createFakeSongDelegate([
    makeSong({ id: "remote_retry_late", userId: "user_1", clientId: "local_retry_late", title: "Antes", content: "C", updatedAt }),
  ]);
  const originalChange = {
    ...emptySongChange,
    id: "remote_retry_late",
    clientId: "local_retry_late",
    baseUpdatedAt: updatedAt.toISOString(),
    title: "Primera edicion",
    content: "D",
  };

  const first = await pushMobileSongSyncChanges("user_1", { changes: [originalChange] }, { song: fake.delegate });
  assertSuccess(first);
  assert.equal(first.results[0].status, "updated");
  const applied = fake.songs.get("remote_retry_late");
  assert.ok(applied);
  fake.songs.set("remote_retry_late", {
    ...applied,
    title: "Edicion posterior",
    content: "E",
    updatedAt: baseDate(999),
  });

  const retry = await pushMobileSongSyncChanges("user_1", { changes: [originalChange] }, { song: fake.delegate });

  assertSuccess(retry);
  assert.equal(retry.results[0].status, "conflict");
  assert.equal(fake.songs.get("remote_retry_late")?.title, "Edicion posterior");
  assert.equal(fake.songs.get("remote_retry_late")?.content, "E");
});

test("mobile sync hace competir atomicamente una actualizacion y una eliminacion", async () => {
  const updatedAt = baseDate(10);
  const fake = createFakeSongDelegate([
    makeSong({ id: "remote_update_delete", userId: "user_1", clientId: "local_update_delete", title: "Base", content: "C", updatedAt }),
  ]);
  const edit = {
    ...emptySongChange,
    id: "remote_update_delete",
    clientId: "local_update_delete",
    baseUpdatedAt: updatedAt.toISOString(),
    title: "Editada",
    content: "D",
  };
  const removal = {
    id: "remote_update_delete",
    clientId: "local_update_delete",
    baseUpdatedAt: updatedAt.toISOString(),
    deletedAt: baseDate(20).toISOString(),
  };

  const [updateResult, deleteResult] = await Promise.all([
    pushMobileSongSyncChanges("user_1", { changes: [edit] }, { song: fake.delegate }),
    pushMobileSongSyncChanges("user_1", { changes: [removal] }, { song: fake.delegate }),
  ]);

  assertSuccess(updateResult);
  assertSuccess(deleteResult);
  const statuses = [updateResult.results[0].status, deleteResult.results[0].status];
  assert.equal(statuses.filter((status) => status === "conflict").length, 1);
  assert.equal(statuses.filter((status) => status === "updated" || status === "deleted").length, 1);
  const finalSong = fake.songs.get("remote_update_delete");
  assert.ok(finalSong?.deletedAt || finalSong?.title === "Editada");
});

test("mobile sync resuelve dos creaciones concurrentes con el mismo clientId sin duplicar", async () => {
  const fake = createFakeSongDelegate();
  const change = { ...emptySongChange, clientId: "same_concurrent_client", title: "Concurrente", content: "C" };

  const [first, second] = await Promise.all([
    pushMobileSongSyncChanges("user_1", { changes: [change] }, { song: fake.delegate }),
    pushMobileSongSyncChanges("user_1", { changes: [change] }, { song: fake.delegate }),
  ]);

  assertSuccess(first);
  assertSuccess(second);
  assert.deepEqual([first.results[0].status, second.results[0].status].sort(), ["created", "unchanged"]);
  assert.equal(fake.songs.size, 1);
  assert.equal(first.results[0].id, second.results[0].id);
});

test("mobile sync no considera idempotentes dos creaciones concurrentes con contenido diferente", async () => {
  const fake = createFakeSongDelegate();
  const base = { ...emptySongChange, clientId: "same_client_different_content" };

  const [first, second] = await Promise.all([
    pushMobileSongSyncChanges("user_1", { changes: [{ ...base, title: "Cancion A", content: "C" }] }, { song: fake.delegate }),
    pushMobileSongSyncChanges("user_1", { changes: [{ ...base, title: "Cancion B", content: "D" }] }, { song: fake.delegate }),
  ]);

  assertSuccess(first);
  assertSuccess(second);
  assert.deepEqual([first.results[0].status, second.results[0].status].sort(), ["conflict", "created"]);
  assert.equal(fake.songs.size, 1);
  assert.ok(["Cancion A", "Cancion B"].includes(Array.from(fake.songs.values())[0].title));
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

test("mobile sync elimina atomically una principal y todas sus versiones", async () => {
  const principal = makeSong({ id: "group_main", userId: "user_1", clientId: "local_main", title: "Grupo" });
  const versionOne = makeSong({ id: "group_v1", userId: "user_1", clientId: "local_v1", title: "Grupo", versionGroupId: principal.id });
  const versionTwo = makeSong({ id: "group_v2", userId: "user_1", clientId: "local_v2", title: "Grupo", versionGroupId: principal.id });
  const fake = createFakeSongDelegate([principal, versionOne, versionTwo]);

  const response = await pushMobileSongSyncChanges(
    "user_1",
    { changes: [groupDeletionChange(principal, [versionOne, versionTwo])] },
    { song: fake.delegate, transaction: fake.transaction },
  );

  assertSuccess(response);
  assert.equal(response.results[0].status, "deleted");
  assert.equal(response.results[0].songs?.length, 3);
  assert.ok(Array.from(fake.songs.values()).every((song) => song.deletedAt !== null));
});

test("mobile sync reintenta una eliminacion grupal ya aplicada sin duplicar ni fallar", async () => {
  const principal = makeSong({ id: "retry_main", userId: "user_1", clientId: "retry_local_main", title: "Grupo" });
  const version = makeSong({ id: "retry_v1", userId: "user_1", clientId: "retry_local_v1", title: "Grupo", versionGroupId: principal.id });
  const fake = createFakeSongDelegate([principal, version]);
  const payload = { changes: [groupDeletionChange(principal, [version])] };

  const first = await pushMobileSongSyncChanges(
    "user_1",
    payload,
    { song: fake.delegate, transaction: fake.transaction },
  );
  const second = await pushMobileSongSyncChanges(
    "user_1",
    payload,
    { song: fake.delegate, transaction: fake.transaction },
  );

  assertSuccess(first);
  assertSuccess(second);
  assert.equal(first.results[0].status, "deleted");
  assert.equal(second.results[0].status, "unchanged");
  assert.equal(first.results[0].songs?.length, 2);
  assert.equal(second.results[0].songs?.length, 2);
  assert.ok(Array.from(fake.songs.values()).every((song) => song.deletedAt !== null));
});

test("mobile sync no elimina parcialmente si cambia una version", async () => {
  const principal = makeSong({ id: "conflict_main", userId: "user_1", clientId: "conflict_local_main", title: "Grupo" });
  const version = makeSong({ id: "conflict_v1", userId: "user_1", clientId: "conflict_local_v1", title: "Grupo", versionGroupId: principal.id });
  const fake = createFakeSongDelegate([principal, version]);
  const operation = groupDeletionChange(principal, [version]);
  fake.songs.set(version.id, { ...version, content: "Cambio remoto", updatedAt: baseDate(20) });

  const response = await pushMobileSongSyncChanges(
    "user_1",
    { changes: [operation] },
    { song: fake.delegate, transaction: fake.transaction },
  );

  assertSuccess(response);
  assert.equal(response.results[0].status, "conflict");
  assert.ok(Array.from(fake.songs.values()).every((song) => song.deletedAt === null));
});

test("mobile sync no elimina parcialmente si cambia la principal", async () => {
  const principal = makeSong({ id: "main_changed", userId: "user_1", clientId: "main_changed_local", title: "Grupo" });
  const version = makeSong({ id: "main_changed_v1", userId: "user_1", clientId: "main_changed_v1_local", title: "Grupo", versionGroupId: principal.id });
  const fake = createFakeSongDelegate([principal, version]);
  const operation = groupDeletionChange(principal, [version]);
  fake.songs.set(principal.id, { ...principal, title: "Cambio remoto", updatedAt: baseDate(21) });

  const response = await pushMobileSongSyncChanges(
    "user_1",
    { changes: [operation] },
    { song: fake.delegate, transaction: fake.transaction },
  );

  assertSuccess(response);
  assert.equal(response.results[0].status, "conflict");
  assert.ok(Array.from(fake.songs.values()).every((song) => song.deletedAt === null));
});

test("mobile sync serializa dos eliminaciones concurrentes del mismo grupo", async () => {
  const principal = makeSong({ id: "race_main", userId: "user_1", clientId: "race_local_main", title: "Grupo" });
  const version = makeSong({ id: "race_v1", userId: "user_1", clientId: "race_local_v1", title: "Grupo", versionGroupId: principal.id });
  const fake = createFakeSongDelegate([principal, version]);
  const payload = { changes: [groupDeletionChange(principal, [version])] };

  const [first, second] = await Promise.all([
    pushMobileSongSyncChanges("user_1", payload, { song: fake.delegate, transaction: fake.transaction }),
    pushMobileSongSyncChanges("user_1", payload, { song: fake.delegate, transaction: fake.transaction }),
  ]);

  assertSuccess(first);
  assertSuccess(second);
  assert.deepEqual([first.results[0].status, second.results[0].status].sort(), ["deleted", "unchanged"]);
  assert.ok(Array.from(fake.songs.values()).every((song) => song.deletedAt !== null));
});

test("mobile sync rechaza un grupo incompleto sin crear versiones huerfanas", async () => {
  const principal = makeSong({ id: "incomplete_main", userId: "user_1", clientId: "incomplete_local_main", title: "Grupo" });
  const version = makeSong({ id: "incomplete_v1", userId: "user_1", clientId: "incomplete_local_v1", title: "Grupo", versionGroupId: principal.id });
  const fake = createFakeSongDelegate([principal, version]);

  const response = await pushMobileSongSyncChanges(
    "user_1",
    { changes: [groupDeletionChange(principal)] },
    { song: fake.delegate, transaction: fake.transaction },
  );

  assertSuccess(response);
  assert.equal(response.results[0].status, "conflict");
  assert.equal(fake.songs.get(principal.id)?.deletedAt, null);
  assert.equal(fake.songs.get(version.id)?.deletedAt, null);
});

test("mobile sync aisla eliminaciones grupales por propietario", async () => {
  const principal = makeSong({ id: "private_main", userId: "owner", clientId: "private_local_main", title: "Privada" });
  const version = makeSong({ id: "private_v1", userId: "owner", clientId: "private_local_v1", title: "Privada", versionGroupId: principal.id });
  const fake = createFakeSongDelegate([principal, version]);

  const response = await pushMobileSongSyncChanges(
    "attacker",
    { changes: [groupDeletionChange(principal, [version])] },
    { song: fake.delegate, transaction: fake.transaction },
  );

  assertSuccess(response);
  assert.equal(response.results[0].status, "conflict");
  assert.equal(fake.songs.get(principal.id)?.deletedAt, null);
  assert.equal(fake.songs.get(version.id)?.deletedAt, null);
});
