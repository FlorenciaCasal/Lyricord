import type { Prisma } from "@prisma/client";

export async function lockAccountQuota(transaction: Prisma.TransactionClient, scope: string, userId: string) {
  const lockKey = `musum:${scope}:${userId}`;
  await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
}
