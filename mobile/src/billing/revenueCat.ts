import { Platform } from "react-native";
import {
  REVENUECAT_DEFAULT_OFFERING_ID,
  hasPremiumEntitlement,
  selectRevenueCatApiKeyForPlatform,
  selectPremiumPackages,
  type PremiumPackages,
  type RevenueCatOfferingLike,
  type RevenueCatPackageLike,
} from "./revenueCatPackages";

type PurchasesModule = {
  default: {
    LOG_LEVEL?: { DEBUG?: unknown };
    configure: (configuration: { apiKey: string; appUserID?: string }) => void;
    setLogLevel?: (level: unknown) => Promise<void>;
    logIn: (appUserID: string) => Promise<unknown>;
    logOut: () => Promise<unknown>;
    getOfferings: () => Promise<{
      current: RevenueCatOfferingLike | null;
      all: Record<string, RevenueCatOfferingLike>;
    }>;
    purchasePackage: (pack: RevenueCatPackageLike) => Promise<{ customerInfo: unknown }>;
    restorePurchases: () => Promise<unknown>;
  };
};

export type RevenueCatAvailability =
  | { available: true }
  | {
      available: false;
      reason:
        | "unsupported-platform"
        | "disabled"
        | "missing-ios-api-key"
        | "missing-android-api-key"
        | "native-module-unavailable";
    };

let purchasesModulePromise: Promise<PurchasesModule | null> | null = null;
let configured = false;
let configuredUserId: string | null = null;

function getPurchasesModule() {
  if (!purchasesModulePromise) {
    purchasesModulePromise = import("react-native-purchases")
      .then((mod) => mod as unknown as PurchasesModule)
      .catch((error) => {
        if (__DEV__) {
          console.log("[RevenueCat] Native module unavailable.", {
            message: error instanceof Error ? error.message : String(error),
          });
        }
        return null;
      });
  }

  return purchasesModulePromise;
}

export function getRevenueCatAvailability(): RevenueCatAvailability {
  const apiKeySelection = selectRevenueCatApiKeyForPlatform(Platform.OS, {
    EXPO_PUBLIC_REVENUECAT_DISABLED: process.env.EXPO_PUBLIC_REVENUECAT_DISABLED,
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
    EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
  });

  if (!apiKeySelection.available) return { available: false, reason: apiKeySelection.reason };
  return { available: true };
}

export async function configureRevenueCat(appUserID?: string) {
  const availability = getRevenueCatAvailability();
  if (!availability.available) return availability;

  const Purchases = (await getPurchasesModule())?.default;
  if (!Purchases) return { available: false as const, reason: "native-module-unavailable" as const };

  if (!configured) {
    const apiKeySelection = selectRevenueCatApiKeyForPlatform(Platform.OS, {
      EXPO_PUBLIC_REVENUECAT_DISABLED: process.env.EXPO_PUBLIC_REVENUECAT_DISABLED,
      EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
      EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
    });

    if (!apiKeySelection.available) return { available: false as const, reason: apiKeySelection.reason };

    if (__DEV__ && Purchases.LOG_LEVEL?.DEBUG && Purchases.setLogLevel) {
      await Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG).catch(() => undefined);
    }
    Purchases.configure({ apiKey: apiKeySelection.apiKey, appUserID });
    configured = true;
    configuredUserId = appUserID ?? null;
    return { available: true as const };
  }

  if (appUserID && configuredUserId !== appUserID) {
    await Purchases.logIn(appUserID);
    configuredUserId = appUserID;
  }

  return { available: true as const };
}

export async function identifyRevenueCatUser(userId: string) {
  return configureRevenueCat(userId);
}

export async function resetRevenueCatUser() {
  const availability = getRevenueCatAvailability();
  if (!availability.available || !configured) return availability;

  const Purchases = (await getPurchasesModule())?.default;
  if (!Purchases) return { available: false as const, reason: "native-module-unavailable" as const };

  await Purchases.logOut().catch((error) => {
    if (__DEV__) {
      console.log("[RevenueCat] logOut failed.", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
  configuredUserId = null;
  return { available: true as const };
}

export async function loadPremiumPackages(userId: string): Promise<PremiumPackages> {
  const configuredResult = await configureRevenueCat(userId);
  if (!configuredResult.available) throw new Error(configuredResult.reason);

  const Purchases = (await getPurchasesModule())?.default;
  if (!Purchases) throw new Error("native-module-unavailable");

  const offerings = await Purchases.getOfferings();
  const offering = offerings.all[REVENUECAT_DEFAULT_OFFERING_ID]
    ?? (offerings.current?.identifier === REVENUECAT_DEFAULT_OFFERING_ID ? offerings.current : null)
    ?? offerings.current;

  return selectPremiumPackages(offering);
}

export async function purchasePremiumPackage(userId: string, pack: RevenueCatPackageLike) {
  const configuredResult = await configureRevenueCat(userId);
  if (!configuredResult.available) throw new Error(configuredResult.reason);

  const Purchases = (await getPurchasesModule())?.default;
  if (!Purchases) throw new Error("native-module-unavailable");

  const result = await Purchases.purchasePackage(pack);
  return {
    customerInfoHasPremium: hasPremiumEntitlement(result.customerInfo),
  };
}

export async function restorePremiumPurchases(userId: string) {
  const configuredResult = await configureRevenueCat(userId);
  if (!configuredResult.available) throw new Error(configuredResult.reason);

  const Purchases = (await getPurchasesModule())?.default;
  if (!Purchases) throw new Error("native-module-unavailable");

  const customerInfo = await Purchases.restorePurchases();
  return {
    customerInfoHasPremium: hasPremiumEntitlement(customerInfo),
  };
}

export function getRevenueCatErrorMessage(error: unknown) {
  const maybeError = error as { userCancelled?: boolean | null; message?: string; code?: string } | null;
  if (maybeError?.userCancelled) return "Compra cancelada.";
  if (maybeError?.message) return maybeError.message;
  if (typeof error === "string") return error;
  return "No pudimos completar la operación con RevenueCat.";
}
