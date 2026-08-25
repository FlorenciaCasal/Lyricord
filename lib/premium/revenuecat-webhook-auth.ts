import { createHmac, timingSafeEqual } from "node:crypto";

export const REVENUECAT_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 300;

export function getRevenueCatWebhookBearerToken(authorizationHeader: string | null) {
  const authorization = authorizationHeader ?? "";
  const [scheme, token] = authorization.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

export function isAuthorizedRevenueCatWebhook(authorizationHeader: string | null, expectedSecret: string | undefined) {
  if (!expectedSecret) return false;
  return getRevenueCatWebhookBearerToken(authorizationHeader) === expectedSecret;
}

export function createRevenueCatWebhookSignature(input: {
  rawBody: string;
  secret: string;
  timestampSeconds: number;
}) {
  return createHmac("sha256", input.secret)
    .update(`${input.timestampSeconds}.${input.rawBody}`)
    .digest("hex");
}

function parseRevenueCatSignatureHeader(signatureHeader: string | null) {
  if (!signatureHeader) return null;

  const parts = Object.fromEntries(
    signatureHeader
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf("=");
        return separatorIndex >= 0
          ? [part.slice(0, separatorIndex), part.slice(separatorIndex + 1)]
          : [part, ""];
      }),
  );

  const timestamp = Number.parseInt(parts.t ?? "", 10);
  const signature = parts.v1;

  if (!Number.isFinite(timestamp) || !signature) return null;
  return { timestamp, signature };
}

export function isValidRevenueCatWebhookSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  signingSecret: string | undefined;
  nowSeconds?: number;
  toleranceSeconds?: number;
}) {
  if (!input.signingSecret) return false;

  const parsed = parseRevenueCatSignatureHeader(input.signatureHeader);
  if (!parsed) return false;

  const nowSeconds = input.nowSeconds ?? Date.now() / 1000;
  const toleranceSeconds = input.toleranceSeconds ?? REVENUECAT_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS;
  if (Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) return false;

  const computed = createRevenueCatWebhookSignature({
    rawBody: input.rawBody,
    secret: input.signingSecret,
    timestampSeconds: parsed.timestamp,
  });

  const expectedBuffer = Buffer.from(parsed.signature, "hex");
  const computedBuffer = Buffer.from(computed, "hex");

  if (expectedBuffer.length !== computedBuffer.length) return false;
  return timingSafeEqual(computedBuffer, expectedBuffer);
}
