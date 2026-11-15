import assert from "node:assert/strict";
import test from "node:test";
import {
  openPremiumLegalLink,
  PREMIUM_PRIVACY_URL,
  PREMIUM_TERMS_URL,
} from "../mobile/src/utils/premiumLegalLinks.ts";

test("Premium usa las URLs legales públicas correctas y seguras", () => {
  assert.equal(PREMIUM_TERMS_URL, "https://lyricord.com.ar/terms");
  assert.equal(PREMIUM_PRIVACY_URL, "https://lyricord.com.ar/privacy");
  assert.equal(new URL(PREMIUM_TERMS_URL).protocol, "https:");
  assert.equal(new URL(PREMIUM_PRIVACY_URL).protocol, "https:");
});

test("cada enlace Premium abre únicamente su URL legal", async () => {
  const opened: string[] = [];
  const openUrl = async (url: string) => {
    opened.push(url);
  };

  await openPremiumLegalLink(PREMIUM_TERMS_URL, openUrl);
  await openPremiumLegalLink(PREMIUM_PRIVACY_URL, openUrl);

  assert.deepEqual(opened, [PREMIUM_TERMS_URL, PREMIUM_PRIVACY_URL]);
});
