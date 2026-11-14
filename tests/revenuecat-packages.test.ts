import assert from "node:assert/strict";
import test from "node:test";
import {
  REVENUECAT_ANNUAL_PRODUCT_ID,
  REVENUECAT_MONTHLY_PRODUCT_ID,
  hasPremiumEntitlement,
  selectRevenueCatApiKeyForPlatform,
  selectPremiumPackages,
} from "../mobile/src/billing/revenueCatPackages.ts";

test("selectPremiumPackages prioriza monthly y annual del offering default", () => {
  const monthly = {
    identifier: "$rc_monthly",
    product: { identifier: REVENUECAT_MONTHLY_PRODUCT_ID, priceString: "US$1.99" },
  };
  const annual = {
    identifier: "$rc_annual",
    product: { identifier: REVENUECAT_ANNUAL_PRODUCT_ID, priceString: "US$17.99" },
  };

  assert.deepEqual(selectPremiumPackages({
    identifier: "default",
    monthly,
    annual,
    availablePackages: [],
  }), { monthly, annual });
});

test("selectPremiumPackages encuentra paquetes por productId si no vienen alias monthly/annual", () => {
  const monthly = {
    identifier: "custom_month",
    product: { identifier: REVENUECAT_MONTHLY_PRODUCT_ID, priceString: "US$1.99" },
  };
  const annual = {
    identifier: "custom_year",
    product: { identifier: REVENUECAT_ANNUAL_PRODUCT_ID, priceString: "US$17.99" },
  };

  assert.deepEqual(selectPremiumPackages({
    identifier: "default",
    availablePackages: [annual, monthly],
  }), { monthly, annual });
});

test("hasPremiumEntitlement lee exclusivamente el entitlement premium activo", () => {
  assert.equal(hasPremiumEntitlement({
    entitlements: {
      active: {
        premium: { identifier: "premium", isActive: true },
      },
    },
  }), true);

  assert.equal(hasPremiumEntitlement({
    entitlements: {
      active: {
        pro: { identifier: "pro", isActive: true },
      },
    },
  }), false);
});

test("selectRevenueCatApiKeyForPlatform usa exclusivamente la key iOS en iOS", () => {
  assert.deepEqual(selectRevenueCatApiKeyForPlatform("ios", {
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: "appl_test",
    EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: "goog_test",
  }), { available: true, apiKey: "appl_test" });
});

test("selectRevenueCatApiKeyForPlatform usa exclusivamente la key Android en Android", () => {
  assert.deepEqual(selectRevenueCatApiKeyForPlatform("android", {
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: "appl_test",
    EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: "goog_test",
  }), { available: true, apiKey: "goog_test" });
});

test("selectRevenueCatApiKeyForPlatform no usa fallback cruzado entre plataformas", () => {
  assert.deepEqual(selectRevenueCatApiKeyForPlatform("android", {
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: "appl_test",
  }), { available: false, reason: "missing-android-api-key" });

  assert.deepEqual(selectRevenueCatApiKeyForPlatform("ios", {
    EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: "goog_test",
  }), { available: false, reason: "missing-ios-api-key" });
});

test("selectRevenueCatApiKeyForPlatform permite deshabilitar compras para una build QA", () => {
  assert.deepEqual(selectRevenueCatApiKeyForPlatform("ios", {
    EXPO_PUBLIC_REVENUECAT_DISABLED: "true",
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: "appl_test",
  }), { available: false, reason: "disabled" });
});
