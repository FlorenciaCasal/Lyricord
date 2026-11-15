export const PREMIUM_TERMS_URL = "https://lyricord.com.ar/terms" as const;
export const PREMIUM_PRIVACY_URL = "https://lyricord.com.ar/privacy" as const;

export type PremiumLegalUrl = typeof PREMIUM_TERMS_URL | typeof PREMIUM_PRIVACY_URL;

export async function openPremiumLegalLink(
  url: PremiumLegalUrl,
  openUrl: (target: string) => Promise<unknown>,
) {
  await openUrl(url);
}
