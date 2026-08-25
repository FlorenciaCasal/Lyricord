export const REVENUECAT_PREMIUM_ENTITLEMENT_ID = "premium";

export type RevenueCatWebhookEvent = {
  id?: unknown;
  type?: unknown;
  app_user_id?: unknown;
  original_app_user_id?: unknown;
  aliases?: unknown;
  entitlement_id?: unknown;
  entitlement_ids?: unknown;
  product_id?: unknown;
  new_product_id?: unknown;
  environment?: unknown;
  expiration_at_ms?: unknown;
  grace_period_expiration_at_ms?: unknown;
  original_transaction_id?: unknown;
  transaction_id?: unknown;
  event_timestamp_ms?: unknown;
  cancel_reason?: unknown;
  expiration_reason?: unknown;
};

export type RevenueCatWebhookPayload = {
  api_version?: unknown;
  event?: RevenueCatWebhookEvent;
};

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function revenueCatStringOrNull(value: unknown) {
  return stringOrNull(value);
}

export function revenueCatDateFromMs(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value) : null;
}

export function getRevenueCatEntitlementIds(event: RevenueCatWebhookEvent) {
  const entitlementIds = Array.isArray(event.entitlement_ids)
    ? event.entitlement_ids.filter((value): value is string => typeof value === "string")
    : [];
  const entitlementId = stringOrNull(event.entitlement_id);
  return entitlementId ? [...new Set([...entitlementIds, entitlementId])] : entitlementIds;
}

export function hasRevenueCatPremiumEntitlement(event: RevenueCatWebhookEvent) {
  return getRevenueCatEntitlementIds(event).includes(REVENUECAT_PREMIUM_ENTITLEMENT_ID);
}

export function getRevenueCatCandidateAppUserIds(event: RevenueCatWebhookEvent) {
  const ids = [
    stringOrNull(event.app_user_id),
    stringOrNull(event.original_app_user_id),
    ...(Array.isArray(event.aliases) ? event.aliases.map(stringOrNull) : []),
  ];
  return [...new Set(ids.filter((id): id is string => !!id))];
}

export function deriveRevenueCatEntitlementStatus(event: RevenueCatWebhookEvent, now = new Date()) {
  const type = stringOrNull(event.type)?.toUpperCase() ?? "UNKNOWN";
  const cancelReason = stringOrNull(event.cancel_reason)?.toUpperCase() ?? null;
  const expiresAt = revenueCatDateFromMs(event.expiration_at_ms);

  if (type === "EXPIRATION") return "expired";
  if (expiresAt && expiresAt <= now) return "expired";
  if (type === "CANCELLATION" && cancelReason === "CUSTOMER_SUPPORT") return "expired";
  return "active";
}

export type RevenueCatEntitlementCheckpoint = {
  lastEventId?: string | null;
  lastEventAt?: Date | null;
};

export type RevenueCatEventApplication =
  | { apply: true; reason: "fresh-event" }
  | { apply: false; reason: "duplicate-event" | "stale-event" };

export function shouldApplyRevenueCatEvent(
  checkpoint: RevenueCatEntitlementCheckpoint | null | undefined,
  event: RevenueCatWebhookEvent,
): RevenueCatEventApplication {
  const incomingEventId = stringOrNull(event.id);
  const incomingEventAt = revenueCatDateFromMs(event.event_timestamp_ms);

  if (checkpoint?.lastEventId && incomingEventId && checkpoint.lastEventId === incomingEventId) {
    return { apply: false, reason: "duplicate-event" as const };
  }

  if (checkpoint?.lastEventAt && incomingEventAt && incomingEventAt < checkpoint.lastEventAt) {
    return { apply: false, reason: "stale-event" as const };
  }

  return { apply: true, reason: "fresh-event" as const };
}
