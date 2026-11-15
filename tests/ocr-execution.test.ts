import assert from "node:assert/strict";
import test from "node:test";
import { executeOcrWithReservedQuota } from "../lib/premium/ocr-execution.ts";

function reservation(overrides: Partial<Awaited<ReturnType<Parameters<typeof executeOcrWithReservedQuota>[0]["reserve"]>>> = {}) {
  return {
    allowed: true,
    alreadyReserved: false,
    usedTotal: 1,
    totalLimit: 5,
    remainingTotal: 4,
    operationKey: "ocr_free_total_v1:operation",
    ...overrides,
  };
}

test("OCR exitoso conserva exactamente una reserva", async () => {
  const released: string[] = [];
  const result = await executeOcrWithReservedQuota({
    reserve: async () => reservation(),
    release: async (key) => { released.push(key); },
    extract: async () => ({ success: true, text: "C\nLetra" }),
  });

  assert.equal(result.result?.success, true);
  assert.deepEqual(released, []);
});

test("OCR fallido o sin texto libera solamente una reserva nueva", async () => {
  const released: string[] = [];
  const failure = await executeOcrWithReservedQuota({
    reserve: async () => reservation(),
    release: async (key) => { released.push(key); },
    extract: async () => ({ success: false, error: "No encontramos texto." }),
  });

  assert.equal(failure.result?.success, false);
  assert.deepEqual(released, ["ocr_free_total_v1:operation"]);
});

test("un error técnico libera una reserva nueva y conserva una reserva idempotente previa", async () => {
  const newlyReleased: string[] = [];
  await assert.rejects(() => executeOcrWithReservedQuota({
    reserve: async () => reservation(),
    release: async (key) => { newlyReleased.push(key); },
    extract: async () => { throw new Error("Vision unavailable"); },
  }));
  assert.deepEqual(newlyReleased, ["ocr_free_total_v1:operation"]);

  const retryReleased: string[] = [];
  await assert.rejects(() => executeOcrWithReservedQuota({
    reserve: async () => reservation({ alreadyReserved: true }),
    release: async (key) => { retryReleased.push(key); },
    extract: async () => { throw new Error("Vision unavailable"); },
  }));
  assert.deepEqual(retryReleased, []);
});

test("el sexto uso Free rechazado no ejecuta OCR y Premium no necesita liberación", async () => {
  let extracted = 0;
  const rejected = await executeOcrWithReservedQuota({
    reserve: async () => reservation({ allowed: false, usedTotal: 5, remainingTotal: 0 }),
    release: async () => { throw new Error("unexpected release"); },
    extract: async () => { extracted += 1; return { success: true, text: "" }; },
  });
  assert.equal(rejected.result, null);
  assert.equal(extracted, 0);

  const premiumReleased: string[] = [];
  await executeOcrWithReservedQuota({
    reserve: async () => reservation({ totalLimit: null, remainingTotal: null }),
    release: async (key) => { premiumReleased.push(key); },
    extract: async () => ({ success: false, error: "No encontramos texto." }),
  });
  assert.deepEqual(premiumReleased, []);
});
