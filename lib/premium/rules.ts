export type MusumPlan = "free" | "premium";

export type PremiumEntitlements = {
  premium: boolean;
};

export type PremiumLimits = {
  maxSongs: number | null;
  /** Legacy field kept for installed clients. The backend no longer applies a daily OCR quota. */
  ocrDailyLimit: number | null;
  ocrTotalLimit: number | null;
};

export type PremiumStatus = {
  plan: MusumPlan;
  entitlements: PremiumEntitlements;
  limits: PremiumLimits;
  usage?: {
    activeSongs: number;
  };
};

export const FREE_LIMITS: PremiumLimits = {
  maxSongs: 10,
  ocrDailyLimit: 5,
  ocrTotalLimit: 5,
};

export const PREMIUM_LIMITS: PremiumLimits = {
  maxSongs: null,
  ocrDailyLimit: null,
  ocrTotalLimit: null,
};

export function normalizePlan(plan: string | null | undefined): MusumPlan {
  return plan?.trim().toLowerCase() === "premium" ? "premium" : "free";
}

export function buildPremiumStatus(planInput: string | null | undefined): PremiumStatus {
  const plan = normalizePlan(planInput);
  const premium = plan === "premium";

  return {
    plan,
    entitlements: {
      premium,
    },
    limits: premium ? PREMIUM_LIMITS : FREE_LIMITS,
  };
}

export function getRevenueCatAppUserId(userId: string) {
  return userId;
}

export function isWithinLimit(used: number, limit: number | null) {
  return limit === null || used < limit;
}
