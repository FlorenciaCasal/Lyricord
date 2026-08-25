import "server-only";

import { prisma } from "@/lib/prisma";
import { buildPremiumStatus, type PremiumStatus } from "@/lib/premium/rules";

export type { MusumPlan, PremiumEntitlements, PremiumLimits, PremiumStatus } from "@/lib/premium/rules";
export { FREE_LIMITS, getRevenueCatAppUserId, isWithinLimit, PREMIUM_LIMITS } from "@/lib/premium/rules";

export async function getPremiumStatusForUser(userId: string): Promise<PremiumStatus> {
  const [user, premiumEntitlement] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    }),
    prisma.revenueCatEntitlement.findFirst({
      where: {
        userId,
        entitlementId: "premium",
        status: "active",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    }),
  ]);

  if (premiumEntitlement) return buildPremiumStatus("premium");
  return buildPremiumStatus(user?.plan);
}

export async function findUserByRevenueCatAppUserId(appUserId: string) {
  return prisma.user.findUnique({
    where: { id: appUserId },
    select: { id: true },
  });
}

export async function getRevenueCatEntitlementCheckpoint(userId: string, entitlementId: string) {
  return prisma.revenueCatEntitlement.findUnique({
    where: {
      userId_entitlementId: {
        userId,
        entitlementId,
      },
    },
    select: {
      lastEventId: true,
      lastEventAt: true,
    },
  });
}

export async function upsertRevenueCatEntitlement(input: {
  userId: string;
  appUserId: string;
  entitlementId: string;
  productId?: string | null;
  status: string;
  expiresAt?: Date | null;
  environment?: string | null;
  originalTransactionId?: string | null;
  lastEventId?: string | null;
  lastEventType?: string | null;
  lastEventAt?: Date | null;
}) {
  return prisma.revenueCatEntitlement.upsert({
    where: {
      userId_entitlementId: {
        userId: input.userId,
        entitlementId: input.entitlementId,
      },
    },
    create: input,
    update: {
      appUserId: input.appUserId,
      productId: input.productId,
      status: input.status,
      expiresAt: input.expiresAt,
      environment: input.environment,
      originalTransactionId: input.originalTransactionId,
      lastEventId: input.lastEventId,
      lastEventType: input.lastEventType,
      lastEventAt: input.lastEventAt,
    },
  });
}

export async function getSongLimitForUser(userId: string) {
  return (await getPremiumStatusForUser(userId)).limits.maxSongs;
}

export async function getOcrDailyLimitForUser(userId: string) {
  return (await getPremiumStatusForUser(userId)).limits.ocrDailyLimit;
}
