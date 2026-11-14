export type AuthStatus = "loading" | "authenticated" | "unauthenticated";
export type OnboardingStatus = "loading" | "pending" | "completed";
export type InitialScreenDecision = "loading" | "welcome" | "login" | "library";

export function decideInitialScreen(authStatus: AuthStatus, onboardingStatus: OnboardingStatus): InitialScreenDecision {
  if (authStatus === "loading") return "loading";
  if (authStatus === "authenticated") return "library";
  if (onboardingStatus === "loading") return "loading";
  return onboardingStatus === "pending" ? "welcome" : "library";
}
