import assert from "node:assert/strict";
import test from "node:test";
import {
  clampOnboardingPage,
  getOnboardingPresentation,
  getOnboardingPrimaryAction,
} from "../mobile/src/utils/onboardingPresentation.ts";

test("iPhone conserva el onboarding actual con imagen cover", () => {
  assert.deepEqual(getOnboardingPresentation(false, 430, 932), {
    controls: "image",
    imageResizeMode: "cover",
    layout: "phone",
  });
});

test("iPad usa ilustraciones completas y controles nativos en vertical", () => {
  assert.deepEqual(getOnboardingPresentation(true, 1024, 1366), {
    controls: "native",
    imageResizeMode: "contain",
    layout: "tablet-portrait",
  });
});

test("iPad usa ilustraciones completas y controles nativos en horizontal", () => {
  assert.deepEqual(getOnboardingPresentation(true, 1366, 1024), {
    controls: "native",
    imageResizeMode: "contain",
    layout: "tablet-landscape",
  });
});

test("la accion principal termina el onboarding solamente en la ultima pantalla", () => {
  assert.equal(getOnboardingPrimaryAction(0, 3), "next");
  assert.equal(getOnboardingPrimaryAction(1, 3), "next");
  assert.equal(getOnboardingPrimaryAction(2, 3), "finish");
});

test("la navegacion del onboarding queda limitada a sus pantallas", () => {
  assert.equal(clampOnboardingPage(-1, 3), 0);
  assert.equal(clampOnboardingPage(1, 3), 1);
  assert.equal(clampOnboardingPage(4, 3), 2);
});
