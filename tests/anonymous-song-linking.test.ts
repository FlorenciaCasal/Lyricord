import assert from "node:assert/strict";
import test from "node:test";
import { applyAnonymousSongLinkDecision } from "../mobile/src/data/songs/local/anonymousSongLinking.ts";

function subject(linkedCounts: number[]) {
  let linkCalls = 0;
  let syncRequests = 0;
  let activeOwner = "user_1";
  const ownership = {
    async getAnonymousSongSummary() {
      return { songCount: 0, groupCount: 0 };
    },
    async linkAnonymousSongsToOwner() {
      const linkedCount = linkedCounts[linkCalls] ?? 0;
      linkCalls += 1;
      return { linkedCount };
    },
  };

  return {
    ownership,
    get linkCalls() { return linkCalls; },
    get syncRequests() { return syncRequests; },
    setActiveOwner(owner: string) { activeOwner = owner; },
    isOwnerActive(owner: string) { return activeOwner === owner; },
    notifyOwnershipLinked() { syncRequests += 1; },
  };
}

test("cancelar la vinculación no modifica canciones ni solicita sincronización", async () => {
  const state = subject([3]);
  const result = await applyAnonymousSongLinkDecision({
    decision: "cancel",
    ownerUserId: "user_1",
    ownership: state.ownership,
    isOwnerActive: (owner) => state.isOwnerActive(owner),
    notifyOwnershipLinked: () => state.notifyOwnershipLinked(),
  });

  assert.deepEqual(result, { linkedCount: 0, status: "cancelled", syncRequested: false });
  assert.equal(state.linkCalls, 0);
  assert.equal(state.syncRequests, 0);
});

test("confirmar vincula todas las anónimas y encola la sincronización existente", async () => {
  const state = subject([4]);
  const result = await applyAnonymousSongLinkDecision({
    decision: "confirm",
    ownerUserId: "user_1",
    ownership: state.ownership,
    isOwnerActive: (owner) => state.isOwnerActive(owner),
    notifyOwnershipLinked: () => state.notifyOwnershipLinked(),
  });

  assert.deepEqual(result, { linkedCount: 4, status: "linked", syncRequested: true });
  assert.equal(state.linkCalls, 1);
  assert.equal(state.syncRequests, 1);
});

test("repetir la confirmación es idempotente y no encola una sincronización vacía", async () => {
  const state = subject([2, 0]);
  const options = {
    decision: "confirm" as const,
    ownerUserId: "user_1",
    ownership: state.ownership,
    isOwnerActive: (owner: string) => state.isOwnerActive(owner),
    notifyOwnershipLinked: () => state.notifyOwnershipLinked(),
  };

  assert.equal((await applyAnonymousSongLinkDecision(options)).syncRequested, true);
  assert.deepEqual(await applyAnonymousSongLinkDecision(options), {
    linkedCount: 0,
    status: "linked",
    syncRequested: false,
  });
  assert.equal(state.syncRequests, 1);
});

test("un cambio de sesión impide vincular o encolar para la cuenta anterior", async () => {
  const state = subject([3]);
  state.setActiveOwner("user_2");
  const result = await applyAnonymousSongLinkDecision({
    decision: "confirm",
    ownerUserId: "user_1",
    ownership: state.ownership,
    isOwnerActive: (owner) => state.isOwnerActive(owner),
    notifyOwnershipLinked: () => state.notifyOwnershipLinked(),
  });

  assert.deepEqual(result, { linkedCount: 0, status: "stale-session", syncRequested: false });
  assert.equal(state.linkCalls, 0);
  assert.equal(state.syncRequests, 0);
});

test("si la sesión cambia durante la vinculación no encola el respaldo para la cuenta anterior", async () => {
  let syncRequests = 0;
  let activeOwner = "user_1";
  const result = await applyAnonymousSongLinkDecision({
    decision: "confirm",
    ownerUserId: "user_1",
    ownership: {
      async getAnonymousSongSummary() {
        return { songCount: 2, groupCount: 2 };
      },
      async linkAnonymousSongsToOwner() {
        activeOwner = "user_2";
        return { linkedCount: 2 };
      },
    },
    isOwnerActive: (owner) => activeOwner === owner,
    notifyOwnershipLinked: () => { syncRequests += 1; },
  });

  assert.deepEqual(result, { linkedCount: 2, status: "stale-session", syncRequested: false });
  assert.equal(syncRequests, 0);
});
