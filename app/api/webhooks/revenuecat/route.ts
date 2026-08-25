import { mobileApiError } from "@/lib/mobile-api/errors";
import { processRevenueCatWebhookPayload, type RevenueCatWebhookPayload } from "@/lib/premium/revenuecat";
import {
  isAuthorizedRevenueCatWebhook,
  isValidRevenueCatWebhookSignature,
} from "@/lib/premium/revenuecat-webhook-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const webhookSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
  const webhookSigningSecret = process.env.REVENUECAT_WEBHOOK_HMAC_SECRET;

  if (!webhookSecret) {
    return mobileApiError(503, "INTERNAL_ERROR", "RevenueCat webhook no configurado.");
  }

  if (!webhookSigningSecret) {
    return mobileApiError(503, "INTERNAL_ERROR", "RevenueCat webhook HMAC no configurado.");
  }

  if (!isAuthorizedRevenueCatWebhook(request.headers.get("authorization"), webhookSecret)) {
    return mobileApiError(401, "UNAUTHORIZED", "Webhook no autorizado.");
  }

  const rawBody = await request.text();
  if (!isValidRevenueCatWebhookSignature({
    rawBody,
    signatureHeader: request.headers.get("x-revenuecat-webhook-signature"),
    signingSecret: webhookSigningSecret,
  })) {
    return mobileApiError(401, "UNAUTHORIZED", "Firma de webhook invalida.");
  }

  const payload = (() => {
    try {
      return JSON.parse(rawBody) as RevenueCatWebhookPayload;
    } catch {
      return null;
    }
  })();

  if (!payload || typeof payload !== "object") {
    return mobileApiError(400, "INVALID_REQUEST", "Payload invalido.");
  }

  const result = await processRevenueCatWebhookPayload(payload);
  console.log("RevenueCat webhook recibido.", {
    result,
    eventType: payload.event?.type,
  });

  return Response.json({ received: true, ...result });
}
