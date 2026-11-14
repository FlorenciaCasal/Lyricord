import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOcrTotalLimitForUser } from "@/lib/premium/entitlements";
import { reserveOcrQuota } from "@/lib/premium/ocr-quota";
import { lockAccountQuota } from "@/lib/premium/quota-lock";

export const OCR_FREE_USAGE_PREFIX = "ocr_free_total_v1:";

function normalizeOperationId(operationId: string | null | undefined) {
  const normalized = operationId?.trim();
  return normalized && /^[a-z0-9_.:-]{1,120}$/i.test(normalized) ? normalized : randomUUID();
}

async function countFreeOcrUsage(transaction: Prisma.TransactionClient, userId: string) {
  return transaction.usageEvent.count({
    where: { userId, type: { startsWith: OCR_FREE_USAGE_PREFIX } },
  });
}

export async function getOcrUsageStatus(userId: string) {
  const totalLimit = await getOcrTotalLimitForUser(userId);
  if (totalLimit === null) {
    return { usedTotal: 0, totalLimit: null, remainingTotal: null, allowed: true };
  }

  const usedTotal = await prisma.usageEvent.count({
    where: { userId, type: { startsWith: OCR_FREE_USAGE_PREFIX } },
  });
  return {
    usedTotal,
    totalLimit,
    remainingTotal: Math.max(0, totalLimit - usedTotal),
    allowed: usedTotal < totalLimit,
  };
}

export async function reserveOcrUsage(userId: string, operationId?: string | null) {
  const totalLimit = await getOcrTotalLimitForUser(userId);
  const usageType = `${OCR_FREE_USAGE_PREFIX}${normalizeOperationId(operationId)}`;
  return reserveOcrQuota({
    totalLimit,
    operationKey: usageType,
    transaction: (task) => prisma.$transaction(async (transaction) => {
      await lockAccountQuota(transaction, "ocr", userId);
      return task({
        async hasOperation(operationKey) {
          return Boolean(await transaction.usageEvent.findFirst({
            where: { userId, type: operationKey },
            select: { id: true },
          }));
        },
        countUsage: () => countFreeOcrUsage(transaction, userId),
        async recordOperation(operationKey) {
          await transaction.usageEvent.create({ data: { userId, type: operationKey } });
        },
      });
    }),
  });
}
