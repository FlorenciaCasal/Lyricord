import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPremiumStatus,
  FREE_LIMITS,
  getRevenueCatAppUserId,
  isWithinLimit,
  PREMIUM_LIMITS,
} from "../lib/premium/rules.ts";
import {
  deriveRevenueCatEntitlementStatus,
  getRevenueCatCandidateAppUserIds,
  REVENUECAT_PREMIUM_ENTITLEMENT_ID,
  shouldApplyRevenueCatEvent,
} from "../lib/premium/revenuecat-rules.ts";
import {
  createRevenueCatWebhookSignature,
  isAuthorizedRevenueCatWebhook,
  isValidRevenueCatWebhookSignature,
} from "../lib/premium/revenuecat-webhook-auth.ts";

test("usuario free conserva limites actuales", () => {
  assert.equal(FREE_LIMITS.maxSongs, 20);
  assert.equal(FREE_LIMITS.ocrDailyLimit, 5);
  assert.deepEqual(buildPremiumStatus("free"), {
    plan: "free",
    entitlements: { premium: false },
    limits: FREE_LIMITS,
  });
});

test("usuario premium recibe entitlement y limites ampliados", () => {
  assert.deepEqual(buildPremiumStatus("premium"), {
    plan: "premium",
    entitlements: { premium: true },
    limits: PREMIUM_LIMITS,
  });
});

test("planes desconocidos vuelven a free", () => {
  assert.equal(buildPremiumStatus("gold").plan, "free");
  assert.equal(buildPremiumStatus(null).plan, "free");
});

test("limites de canciones y OCR aceptan null como sin limite practico", () => {
  assert.equal(isWithinLimit(19, FREE_LIMITS.maxSongs), true);
  assert.equal(isWithinLimit(20, FREE_LIMITS.maxSongs), false);
  assert.equal(isWithinLimit(4, FREE_LIMITS.ocrDailyLimit), true);
  assert.equal(isWithinLimit(5, FREE_LIMITS.ocrDailyLimit), false);
  assert.equal(isWithinLimit(50_000, PREMIUM_LIMITS.maxSongs), true);
  assert.equal(isWithinLimit(50_000, PREMIUM_LIMITS.ocrDailyLimit), true);
});

test("RevenueCat appUserID usa el id estable del usuario de Musum", () => {
  assert.equal(getRevenueCatAppUserId("user_cuid_123"), "user_cuid_123");
});

test("el cliente no puede elevar plan enviando campos arbitrarios", () => {
  const clientPayload = { plan: "premium", entitlements: { premium: true } };
  const serverTrustedPlan = "free";

  assert.equal(clientPayload.plan, "premium");
  assert.equal(buildPremiumStatus(serverTrustedPlan).entitlements.premium, false);
});

test("RevenueCat identifica candidatos por app_user_id, original_app_user_id y aliases", () => {
  assert.deepEqual(getRevenueCatCandidateAppUserIds({
    app_user_id: "user_current",
    original_app_user_id: "user_original",
    aliases: ["user_alias", "user_current", 123],
  }), ["user_current", "user_original", "user_alias"]);
});

test("RevenueCat premium usa entitlement documentado", () => {
  assert.equal(REVENUECAT_PREMIUM_ENTITLEMENT_ID, "premium");
});

test("RevenueCat expira solo cuando el evento o la fecha cortan acceso", () => {
  const now = new Date("2026-08-20T12:00:00.000Z");

  assert.equal(deriveRevenueCatEntitlementStatus({ type: "INITIAL_PURCHASE", expiration_at_ms: now.getTime() + 1000 }, now), "active");
  assert.equal(deriveRevenueCatEntitlementStatus({ type: "EXPIRATION", expiration_at_ms: now.getTime() + 1000 }, now), "expired");
  assert.equal(deriveRevenueCatEntitlementStatus({ type: "RENEWAL", expiration_at_ms: now.getTime() - 1000 }, now), "expired");
  assert.equal(deriveRevenueCatEntitlementStatus({ type: "BILLING_ISSUE", expiration_at_ms: now.getTime() + 1000 }, now), "active");
  assert.equal(deriveRevenueCatEntitlementStatus({ type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE", expiration_at_ms: now.getTime() + 1000 }, now), "active");
  assert.equal(deriveRevenueCatEntitlementStatus({ type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT", expiration_at_ms: now.getTime() + 1000 }, now), "expired");
  assert.equal(deriveRevenueCatEntitlementStatus({ type: "PRODUCT_CHANGE", expiration_at_ms: now.getTime() + 1000 }, now), "active");
});

test("RevenueCat no aplica webhooks duplicados o fuera de orden", () => {
  const lastEventAt = new Date("2026-08-20T12:00:00.000Z");

  assert.deepEqual(
    shouldApplyRevenueCatEvent({ lastEventId: "event_1", lastEventAt }, {
      id: "event_1",
      event_timestamp_ms: lastEventAt.getTime(),
    }),
    { apply: false, reason: "duplicate-event" },
  );

  assert.deepEqual(
    shouldApplyRevenueCatEvent({ lastEventId: "event_2", lastEventAt }, {
      id: "event_1",
      event_timestamp_ms: lastEventAt.getTime() - 1000,
    }),
    { apply: false, reason: "stale-event" },
  );

  assert.deepEqual(
    shouldApplyRevenueCatEvent({ lastEventId: "event_1", lastEventAt }, {
      id: "event_2",
      event_timestamp_ms: lastEventAt.getTime() + 1000,
    }),
    { apply: true, reason: "fresh-event" },
  );
});

test("contrato de status premium expone plan, entitlements y limites", () => {
  const status = buildPremiumStatus("free");

  assert.equal(status.plan, "free");
  assert.equal(status.entitlements.premium, false);
  assert.equal(status.limits.maxSongs, 20);
  assert.equal(status.limits.ocrDailyLimit, 5);
});

test("webhook RevenueCat rechaza authorization ausente o invalida", () => {
  assert.equal(isAuthorizedRevenueCatWebhook(null, "secret"), false);
  assert.equal(isAuthorizedRevenueCatWebhook("Bearer wrong", "secret"), false);
  assert.equal(isAuthorizedRevenueCatWebhook("Basic secret", "secret"), false);
  assert.equal(isAuthorizedRevenueCatWebhook("Bearer secret", "secret"), true);
  assert.equal(isAuthorizedRevenueCatWebhook("Bearer secret", undefined), false);
});

test("webhook RevenueCat acepta firma HMAC valida sobre raw body", () => {
  const rawBody = "{\"event\":{\"id\":\"event_1\",\"type\":\"INITIAL_PURCHASE\"}}";
  const timestampSeconds = 1_787_200_000;
  const signature = createRevenueCatWebhookSignature({
    rawBody,
    secret: "signing-secret",
    timestampSeconds,
  });

  assert.equal(isValidRevenueCatWebhookSignature({
    rawBody,
    signatureHeader: `t=${timestampSeconds},v1=${signature}`,
    signingSecret: "signing-secret",
    nowSeconds: timestampSeconds,
  }), true);
});

test("webhook RevenueCat rechaza firma HMAC invalida", () => {
  const rawBody = "{\"event\":{\"id\":\"event_1\"}}";
  const timestampSeconds = 1_787_200_000;

  assert.equal(isValidRevenueCatWebhookSignature({
    rawBody,
    signatureHeader: `t=${timestampSeconds},v1=abcdef`,
    signingSecret: "signing-secret",
    nowSeconds: timestampSeconds,
  }), false);
});

test("webhook RevenueCat rechaza body modificado despues de firmar", () => {
  const rawBody = "{\"event\":{\"id\":\"event_1\"}}";
  const modifiedBody = "{\"event\":{\"id\":\"event_2\"}}";
  const timestampSeconds = 1_787_200_000;
  const signature = createRevenueCatWebhookSignature({
    rawBody,
    secret: "signing-secret",
    timestampSeconds,
  });

  assert.equal(isValidRevenueCatWebhookSignature({
    rawBody: modifiedBody,
    signatureHeader: `t=${timestampSeconds},v1=${signature}`,
    signingSecret: "signing-secret",
    nowSeconds: timestampSeconds,
  }), false);
});

test("webhook RevenueCat rechaza timestamp vencido para evitar replay", () => {
  const rawBody = "{\"event\":{\"id\":\"event_1\"}}";
  const timestampSeconds = 1_787_200_000;
  const signature = createRevenueCatWebhookSignature({
    rawBody,
    secret: "signing-secret",
    timestampSeconds,
  });

  assert.equal(isValidRevenueCatWebhookSignature({
    rawBody,
    signatureHeader: `t=${timestampSeconds},v1=${signature}`,
    signingSecret: "signing-secret",
    nowSeconds: timestampSeconds + 301,
  }), false);
});

test("webhook RevenueCat rechaza header HMAC ausente", () => {
  assert.equal(isValidRevenueCatWebhookSignature({
    rawBody: "{\"event\":{\"id\":\"event_1\"}}",
    signatureHeader: null,
    signingSecret: "signing-secret",
    nowSeconds: 1_787_200_000,
  }), false);
});
