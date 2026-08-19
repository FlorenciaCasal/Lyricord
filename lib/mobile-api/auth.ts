import "server-only";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  createMobileAccessToken,
  createMobileRefreshToken,
  getMobileRefreshTokenExpiresAt,
  hashMobileRefreshToken,
  MOBILE_ACCESS_TOKEN_TTL_SECONDS,
} from "@/lib/mobile-api/tokens";

export async function authenticateMobileCredentials(emailInput: string, password: string) {
  const email = emailInput.trim().toLowerCase();
  if (!email || !password) return null;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, passwordHash: true },
  });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return null;
  return { id: user.id, email: user.email };
}

export async function createMobileSession(userId: string) {
  const refreshToken = createMobileRefreshToken();
  const refreshTokenExpiresAt = getMobileRefreshTokenExpiresAt();
  await prisma.mobileSession.create({
    data: {
      userId,
      tokenHash: hashMobileRefreshToken(refreshToken),
      expiresAt: refreshTokenExpiresAt,
    },
  });
  return {
    accessToken: createMobileAccessToken(userId),
    accessTokenExpiresIn: MOBILE_ACCESS_TOKEN_TTL_SECONDS,
    refreshToken,
    refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
  };
}

export async function rotateMobileSession(refreshToken: string) {
  const tokenHash = hashMobileRefreshToken(refreshToken);
  const session = await prisma.mobileSession.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true, revokedAt: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;

  const nextRefreshToken = createMobileRefreshToken();
  const nextTokenHash = hashMobileRefreshToken(nextRefreshToken);
  const nextExpiresAt = getMobileRefreshTokenExpiresAt();
  const rotated = await prisma.mobileSession.updateMany({
    where: { id: session.id, tokenHash, revokedAt: null },
    data: { tokenHash: nextTokenHash, expiresAt: nextExpiresAt },
  });
  if (rotated.count !== 1) return null;

  return {
    accessToken: createMobileAccessToken(session.userId),
    accessTokenExpiresIn: MOBILE_ACCESS_TOKEN_TTL_SECONDS,
    refreshToken: nextRefreshToken,
    refreshTokenExpiresAt: nextExpiresAt.toISOString(),
  };
}

export async function revokeMobileSession(refreshToken: string) {
  await prisma.mobileSession.updateMany({
    where: { tokenHash: hashMobileRefreshToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
