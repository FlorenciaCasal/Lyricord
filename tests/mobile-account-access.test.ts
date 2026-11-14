import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRegistrationUrl } from "../mobile/src/api/config.ts";
import {
  decideLoginBackAction,
  decideLoginSuccessAction,
  shouldShowGuestAccountAccess,
} from "../mobile/src/utils/accountAccess.ts";

test("library exposes account access only to guests", () => {
  assert.equal(shouldShowGuestAccountAccess(null), true);
  assert.equal(shouldShowGuestAccountAccess(undefined), true);
  assert.equal(shouldShowGuestAccountAccess("user_1"), false);
});

test("login opened from library returns through access without duplicating library", () => {
  assert.equal(decideLoginBackAction({
    mode: "form",
    fromWelcome: false,
    fromLibrary: true,
    canGoBack: true,
  }), "showAccess");
  assert.equal(decideLoginBackAction({
    mode: "access",
    fromWelcome: false,
    fromLibrary: true,
    canGoBack: true,
  }), "goBack");
  assert.equal(decideLoginSuccessAction({ fromLibrary: true, canGoBack: true }), "goBack");
});

test("welcome login keeps its existing back and success behavior", () => {
  assert.equal(decideLoginBackAction({
    mode: "form",
    fromWelcome: true,
    fromLibrary: false,
    canGoBack: true,
  }), "goBack");
  assert.equal(decideLoginSuccessAction({ fromLibrary: false, canGoBack: true }), "replaceLibrary");
});

test("registration URL accepts explicit HTTPS and local development HTTP only", () => {
  assert.equal(normalizeRegistrationUrl(undefined), null);
  assert.equal(normalizeRegistrationUrl(""), null);
  assert.equal(normalizeRegistrationUrl("javascript:alert(1)"), null);
  assert.equal(normalizeRegistrationUrl("http://example.com/register"), null);
  assert.equal(normalizeRegistrationUrl("https://example.com/register"), "https://example.com/register");
  assert.equal(normalizeRegistrationUrl("http://192.168.1.61:3000/register"), "http://192.168.1.61:3000/register");
});
