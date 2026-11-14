import assert from "node:assert/strict";
import { test } from "node:test";
import { decideInitialScreen } from "../mobile/src/utils/initialScreen.ts";

test("sin sesión + flag inexistente muestra onboarding", () => {
  assert.equal(decideInitialScreen("unauthenticated", "pending"), "welcome");
});

test("sin sesión + onboarding completado muestra login", () => {
  assert.equal(decideInitialScreen("unauthenticated", "completed"), "library");
});

test("sesión restaurada muestra biblioteca", () => {
  assert.equal(decideInitialScreen("authenticated", "loading"), "library");
  assert.equal(decideInitialScreen("authenticated", "pending"), "library");
  assert.equal(decideInitialScreen("authenticated", "completed"), "library");
});
