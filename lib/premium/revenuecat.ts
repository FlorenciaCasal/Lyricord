import {
  findUserByRevenueCatAppUserId,
  getRevenueCatEntitlementCheckpoint,
  upsertRevenueCatEntitlement,
} from "@/lib/premium/entitlements";
import {
  deriveRevenueCatEntitlementStatus,
  getRevenueCatCandidateAppUserIds,
  hasRevenueCatPremiumEntitlement,
  REVENUECAT_PREMIUM_ENTITLEMENT_ID,
  revenueCatDateFromMs,
  revenueCatStringOrNull,
  shouldApplyRevenueCatEvent,
  type RevenueCatWebhookPayload,
} from "@/lib/premium/revenuecat-rules";

export type { RevenueCatWebhookEvent, RevenueCatWebhookPayload } from "@/lib/premium/revenuecat-rules";

export type RevenueCatProcessResult =
  | { processed: true; userId: string; entitlementId: string; status: string }
  | {
      processed: false;
      reason:
        | "invalid-payload"
        | "missing-user"
        | "not-premium-entitlement"
        | "duplicate-event"
        | "stale-event";
    };

export async function processRevenueCatWebhookPayload(
  payload: RevenueCatWebhookPayload,
): Promise<RevenueCatProcessResult> {
  const event = payload.event;
  if (!event || typeof event !== "object") return { processed: false, reason: "invalid-payload" };
  if (!hasRevenueCatPremiumEntitlement(event)) return { processed: false, reason: "not-premium-entitlement" };

  const appUserIds = getRevenueCatCandidateAppUserIds(event);
  const users = await Promise.all(appUserIds.map(findUserByRevenueCatAppUserId));
  const user = users.find(Boolean);
  if (!user) return { processed: false, reason: "missing-user" };

  const appUserId = revenueCatStringOrNull(event.app_user_id) ?? user.id;
  const checkpoint = await getRevenueCatEntitlementCheckpoint(user.id, REVENUECAT_PREMIUM_ENTITLEMENT_ID);
  const eventApplication = shouldApplyRevenueCatEvent(checkpoint, event);
  if (!eventApplication.apply) return { processed: false, reason: eventApplication.reason };

  const status = deriveRevenueCatEntitlementStatus(event);
  await upsertRevenueCatEntitlement({
    userId: user.id,
    appUserId,
    entitlementId: REVENUECAT_PREMIUM_ENTITLEMENT_ID,
    productId: revenueCatStringOrNull(event.product_id),
    status,
    expiresAt: revenueCatDateFromMs(event.expiration_at_ms),
    environment: revenueCatStringOrNull(event.environment),
    originalTransactionId: revenueCatStringOrNull(event.original_transaction_id),
    lastEventId: revenueCatStringOrNull(event.id),
    lastEventType: revenueCatStringOrNull(event.type),
    lastEventAt: revenueCatDateFromMs(event.event_timestamp_ms),
  });

  return {
    processed: true,
    userId: user.id,
    entitlementId: REVENUECAT_PREMIUM_ENTITLEMENT_ID,
    status,
  };
}
