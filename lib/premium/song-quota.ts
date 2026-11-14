import type { Prisma, Song } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSongLimitForUser } from "@/lib/premium/entitlements";
import { lockAccountQuota } from "@/lib/premium/quota-lock";

export type SongQuotaCreateResult =
  | { status: "created" | "existing"; song: Song }
  | { status: "limit-reached"; limit: number };

export async function createSongWithinLimit(input: {
  userId: string;
  data: Omit<Prisma.SongUncheckedCreateInput, "userId">;
  clientId?: string | null;
}): Promise<SongQuotaCreateResult> {
  const limit = await getSongLimitForUser(input.userId);

  return prisma.$transaction(async (transaction) => {
    await lockAccountQuota(transaction, "songs", input.userId);

    if (input.clientId) {
      const existing = await transaction.song.findUnique({
        where: {
          userId_clientId: {
            userId: input.userId,
            clientId: input.clientId,
          },
        },
      });
      if (existing) return { status: "existing", song: existing };
    }

    if (limit !== null) {
      const activeSongs = await transaction.song.count({
        where: { userId: input.userId, deletedAt: null },
      });
      if (activeSongs >= limit) return { status: "limit-reached", limit };
    }

    const song = await transaction.song.create({
      data: { ...input.data, userId: input.userId },
    });
    return { status: "created", song };
  });
}
