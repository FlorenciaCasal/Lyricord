import { prisma } from "@/lib/prisma";

export const OCR_DAILY_LIMIT = 10;

const USAGE_TYPE_OCR = "ocr";

function getStartOfTodayUtc() {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  return startOfDay;
}

export async function getOcrUsageStatus(userId: string) {
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
    remainingToday: Math.max(0, OCR_DAILY_LIMIT - usedToday),
    allowed: usedToday < OCR_DAILY_LIMIT,
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
