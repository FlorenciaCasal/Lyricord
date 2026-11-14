export const REVENUECAT_PREMIUM_ENTITLEMENT_ID = "premium";
export const REVENUECAT_DEFAULT_OFFERING_ID = "default";
export const REVENUECAT_MONTHLY_PACKAGE_ID = "$rc_monthly";
export const REVENUECAT_ANNUAL_PACKAGE_ID = "$rc_annual";
export const REVENUECAT_MONTHLY_PRODUCT_ID = "com.musum.premium.monthly";
export const REVENUECAT_ANNUAL_PRODUCT_ID = "com.musum.premium.yearly";

export type RevenueCatApiKeyEnvironment = {
  EXPO_PUBLIC_REVENUECAT_DISABLED?: string;
  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?: string;
  EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?: string;
};

export type RevenueCatApiKeySelection =
  | { available: true; apiKey: string }
  | { available: false; reason: "disabled" | "unsupported-platform" | "missing-ios-api-key" | "missing-android-api-key" };

export type RevenueCatStoreProductLike = {
  identifier: string;
  priceString?: string;
  title?: string;
  description?: string;
};

export type RevenueCatPackageLike = {
  identifier: string;
  packageType?: string;
  product: RevenueCatStoreProductLike;
};

export type RevenueCatOfferingLike = {
  identifier: string;
  monthly?: RevenueCatPackageLike | null;
  annual?: RevenueCatPackageLike | null;
  availablePackages?: RevenueCatPackageLike[];
};

export type PremiumPackages = {
  monthly: RevenueCatPackageLike | null;
  annual: RevenueCatPackageLike | null;
};

function findPackageByIdentifier(
  packages: RevenueCatPackageLike[],
  packageIdentifier: string,
  productIdentifier: string,
) {
  return packages.find((candidate) => candidate.identifier === packageIdentifier)
    ?? packages.find((candidate) => candidate.product.identifier === productIdentifier)
    ?? null;
}

export function selectPremiumPackages(offering: RevenueCatOfferingLike | null | undefined): PremiumPackages {
  const availablePackages = offering?.availablePackages ?? [];

  return {
    monthly: offering?.monthly
      ?? findPackageByIdentifier(availablePackages, REVENUECAT_MONTHLY_PACKAGE_ID, REVENUECAT_MONTHLY_PRODUCT_ID),
    annual: offering?.annual
      ?? findPackageByIdentifier(availablePackages, REVENUECAT_ANNUAL_PACKAGE_ID, REVENUECAT_ANNUAL_PRODUCT_ID),
  };
}

export function hasPremiumEntitlement(customerInfo: unknown) {
  if (!customerInfo || typeof customerInfo !== "object") return false;

  const entitlements = (customerInfo as { entitlements?: { active?: Record<string, unknown> } }).entitlements;
  return Boolean(entitlements?.active?.[REVENUECAT_PREMIUM_ENTITLEMENT_ID]);
}

export function selectRevenueCatApiKeyForPlatform(
  platform: string,
  environment: RevenueCatApiKeyEnvironment,
): RevenueCatApiKeySelection {
  if (environment.EXPO_PUBLIC_REVENUECAT_DISABLED === "true") {
    return { available: false, reason: "disabled" };
  }

  if (platform === "ios") {
    const apiKey = environment.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
    return apiKey ? { available: true, apiKey } : { available: false, reason: "missing-ios-api-key" };
  }

  if (platform === "android") {
    const apiKey = environment.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
    return apiKey ? { available: true, apiKey } : { available: false, reason: "missing-android-api-key" };
  }

  return { available: false, reason: "unsupported-platform" };
}
