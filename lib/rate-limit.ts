import { prisma } from "@/lib/prisma";

type RateLimitOptions = {
  type: string;
  key: string;
  limit: number;
  windowMs: number;
};

export async function checkRateLimit({
  type,
  key,
  limit,
  windowMs,
}: RateLimitOptions) {
  const windowStart = new Date(Date.now() - windowMs);

  const count = await prisma.rateLimitEvent.count({
    where: {
      type,
      key,
      createdAt: {
        gte: windowStart,
      },
    },
  });

  if (count >= limit) {
    return {
      allowed: false,
      remaining: 0,
    };
  }

  await prisma.rateLimitEvent.create({
    data: {
      type,
      key,
    },
  });

  return {
    allowed: true,
    remaining: limit - count - 1,
  };
}
