import { prisma } from "@/lib/prisma";
import { getOcrDailyLimitForUser, isWithinLimit } from "@/lib/premium/entitlements";

const USAGE_TYPE_OCR = "ocr";

function getStartOfTodayUtc() {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  return startOfDay;
}

export async function getOcrUsageStatus(userId: string) {
  const dailyLimit = await getOcrDailyLimitForUser(userId);
  const usedToday = await prisma.usageEvent.count({
    where: {
      userId,
      type: USAGE_TYPE_OCR,
      createdAt: {
        gte: getStartOfTodayUtc(),
      },
    },
  });

  return {
    usedToday,
    dailyLimit,
    remainingToday: dailyLimit === null ? null : Math.max(0, dailyLimit - usedToday),
    allowed: isWithinLimit(usedToday, dailyLimit),
  };
}

export async function recordOcrUsage(userId: string) {
  await prisma.usageEvent.create({
    data: {
      userId,
      type: USAGE_TYPE_OCR,
    },
  });
}
