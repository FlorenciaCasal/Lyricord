export type LoginMode = "access" | "form";

export function shouldShowGuestAccountAccess(userId: string | null | undefined) {
  return !userId;
}

export function decideLoginBackAction({
  mode,
  fromWelcome,
  fromLibrary,
  canGoBack,
}: {
  mode: LoginMode;
  fromWelcome: boolean;
  fromLibrary: boolean;
  canGoBack: boolean;
}) {
  if (mode === "form") {
    return fromWelcome && canGoBack ? "goBack" : "showAccess";
  }
  return fromLibrary && canGoBack ? "goBack" : null;
}

export function decideLoginSuccessAction({
  fromLibrary,
  canGoBack,
}: {
  fromLibrary: boolean;
  canGoBack: boolean;
}) {
  return fromLibrary && canGoBack ? "goBack" : "replaceLibrary";
}
