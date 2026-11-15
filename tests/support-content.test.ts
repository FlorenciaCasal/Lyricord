import assert from "node:assert/strict";
import test from "node:test";
import {
  CURRENT_SUPPORT_EMAIL,
  SUPPORT_FAQS,
  SUPPORT_LEGAL_LINKS,
} from "../lib/support-content.ts";

test("soporte publica preguntas básicas y conserva las rutas legales existentes", () => {
  assert.equal(SUPPORT_FAQS.length, 4);
  assert.deepEqual(SUPPORT_LEGAL_LINKS, [
    { href: "/terms", label: "Términos de uso" },
    { href: "/privacy", label: "Política de privacidad" },
  ]);
});

test("soporte no anuncia el nuevo correo antes de verificarlo", () => {
  assert.equal(CURRENT_SUPPORT_EMAIL, "contacto.lyricord@gmail.com");
  assert.notEqual(CURRENT_SUPPORT_EMAIL, "soporte@musum.com.ar");
});
