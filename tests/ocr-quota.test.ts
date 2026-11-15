import assert from "node:assert/strict";
import test from "node:test";
import { reserveOcrQuota, type OcrQuotaTransaction } from "../lib/premium/ocr-quota.ts";

function quotaStore(initialEvents: string[] = []) {
  const events = [...initialEvents];
  let tail = Promise.resolve();
  const transaction = <T>(task: (store: OcrQuotaTransaction) => Promise<T>) => {
    const run = tail.then(() => task({
      async hasOperation(operationKey) { return events.includes(operationKey); },
      async countUsage() { return events.filter((event) => event.startsWith("ocr_free_total_v1:")).length; },
      async recordOperation(operationKey) { events.push(operationKey); },
    }));
    tail = run.then(() => undefined, () => undefined);
    return run;
  };
  const release = (operationKey: string) => transaction(async () => {
    const index = events.indexOf(operationKey);
    if (index >= 0) events.splice(index, 1);
  });
  return { events, transaction, release };
}

test("OCR Free permite cinco usos totales y rechaza el sexto", async () => {
  const store = quotaStore();
  for (let index = 1; index <= 5; index += 1) {
    const result = await reserveOcrQuota({
      totalLimit: 5,
      operationKey: `ocr_free_total_v1:op_${index}`,
      transaction: store.transaction,
    });
    assert.equal(result.allowed, true);
    assert.equal(result.remainingTotal, 5 - index);
  }
  const sixth = await reserveOcrQuota({
    totalLimit: 5,
    operationKey: "ocr_free_total_v1:op_6",
    transaction: store.transaction,
  });
  assert.equal(sixth.allowed, false);
  assert.equal(store.events.length, 5);
});

test("OCR ignora eventos historicos y el reintento de la misma operacion no consume dos veces", async () => {
  const store = quotaStore(["ocr", "ocr", "ocr_free_total_v1:same"]);
  const retry = await reserveOcrQuota({
    totalLimit: 5,
    operationKey: "ocr_free_total_v1:same",
    transaction: store.transaction,
  });
  assert.equal(retry.allowed, true);
  assert.equal(retry.alreadyReserved, true);
  assert.equal(retry.usedTotal, 1);
  assert.equal(store.events.length, 3);
});

test("OCR serializa solicitudes concurrentes y Premium permanece ilimitado", async () => {
  const store = quotaStore(Array.from({ length: 4 }, (_, index) => `ocr_free_total_v1:old_${index}`));
  const [left, right] = await Promise.all([
    reserveOcrQuota({ totalLimit: 5, operationKey: "ocr_free_total_v1:left", transaction: store.transaction }),
    reserveOcrQuota({ totalLimit: 5, operationKey: "ocr_free_total_v1:right", transaction: store.transaction }),
  ]);
  assert.deepEqual([left.allowed, right.allowed].sort(), [false, true]);
  const premium = await reserveOcrQuota({
    totalLimit: null,
    operationKey: "ocr_free_total_v1:premium",
    transaction: store.transaction,
  });
  assert.equal(premium.allowed, true);
  assert.equal(premium.totalLimit, null);
});

test("una reserva fallida se libera sin permitir superar cinco usos concurrentes", async () => {
  const store = quotaStore(Array.from({ length: 4 }, (_, index) => `ocr_free_total_v1:old_${index}`));
  const reserved = await reserveOcrQuota({
    totalLimit: 5,
    operationKey: "ocr_free_total_v1:failed",
    transaction: store.transaction,
  });
  const blocked = await reserveOcrQuota({
    totalLimit: 5,
    operationKey: "ocr_free_total_v1:blocked",
    transaction: store.transaction,
  });
  assert.equal(reserved.allowed, true);
  assert.equal(blocked.allowed, false);

  await store.release("ocr_free_total_v1:failed");
  const retry = await reserveOcrQuota({
    totalLimit: 5,
    operationKey: "ocr_free_total_v1:blocked",
    transaction: store.transaction,
  });
  assert.equal(retry.allowed, true);
  assert.equal(store.events.filter((event) => event.startsWith("ocr_free_total_v1:")).length, 5);
});
