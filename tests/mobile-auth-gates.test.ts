import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canStartPremiumPurchase,
  canUseCloudOcr,
  CLOUD_OCR_AUTH_REQUIRED_MESSAGE,
  PREMIUM_AUTH_REQUIRED_MESSAGE,
} from "../mobile/src/utils/authGates.ts";
import type { User } from "../mobile/src/types.ts";

const user: User = { id: "user_1", email: "musum@example.com" };

test("OCR cloud queda gated sin sesion y habilitado con usuario", () => {
  assert.equal(canUseCloudOcr(null), false);
  assert.equal(canUseCloudOcr(user), true);
  assert.match(CLOUD_OCR_AUTH_REQUIRED_MESSAGE, /cuenta/i);
});

test("Premium no inicia compra sin sesion y queda habilitado con usuario", () => {
  assert.equal(canStartPremiumPurchase(null), false);
  assert.equal(canStartPremiumPurchase(user), true);
  assert.match(PREMIUM_AUTH_REQUIRED_MESSAGE, /compra/i);
});
