import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

export const MOBILE_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const MOBILE_REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type AccessTokenPayload = {
  sub: string;
  type: "mobile_access";
  iat: number;
  exp: number;
};

function getMobileAuthSecret() {
  const secret = process.env.MOBILE_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("MOBILE_AUTH_SECRET debe tener al menos 32 caracteres.");
  }
  return secret;
}

function encodeJson(value: object) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(unsignedToken: string) {
  return createHmac("sha256", getMobileAuthSecret())
    .update(unsignedToken)
    .digest("base64url");
}

export function createMobileAccessToken(userId: string, now = Date.now()) {
  const issuedAt = Math.floor(now / 1000);
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const payload = encodeJson({
    sub: userId,
    type: "mobile_access",
    iat: issuedAt,
    exp: issuedAt + MOBILE_ACCESS_TOKEN_TTL_SECONDS,
  } satisfies AccessTokenPayload);
  const unsignedToken = `${header}.${payload}`;
  return `${unsignedToken}.${sign(unsignedToken)}`;
}

export function verifyMobileAccessToken(token: string, now = Date.now()) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const expectedSignature = sign(`${header}.${payload}`);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<AccessTokenPayload>;
    const nowInSeconds = Math.floor(now / 1000);
    if (
      parsed.type !== "mobile_access" ||
      typeof parsed.sub !== "string" ||
      !parsed.sub ||
      typeof parsed.iat !== "number" ||
      typeof parsed.exp !== "number" ||
      parsed.iat > nowInSeconds + 60 ||
      parsed.exp <= nowInSeconds
    ) {
      return null;
    }
    return { userId: parsed.sub, expiresAt: parsed.exp };
  } catch {
    return null;
  }
}

export function createMobileRefreshToken() {
  return randomBytes(48).toString("base64url");
}

export function hashMobileRefreshToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getMobileRefreshTokenExpiresAt(now = Date.now()) {
  return new Date(now + MOBILE_REFRESH_TOKEN_TTL_MS);
}
