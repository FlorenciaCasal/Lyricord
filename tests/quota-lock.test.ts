import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { lockAccountQuota } from "../lib/premium/quota-lock.ts";

test("el advisory lock devuelve una columna serializable para Prisma", async () => {
  let sql = "";
  const transaction = {
    async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
      sql = strings.reduce((result, part, index) => (
        result + part + (index < values.length ? "$value" : "")
      ), "");
      return [{ lock: "" }];
    },
  } as unknown as Prisma.TransactionClient;

  await lockAccountQuota(transaction, "ocr", "user-1");

  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /::text AS "lock"/);
});
