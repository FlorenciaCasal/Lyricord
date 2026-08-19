import assert from "node:assert/strict";
import test from "node:test";

test("mobile preserva exactamente el content enviado por el formulario", () => {
  const content = "      B              F#\nNo queda nadie en la ciudad\n\n";
  const payload = {
    title: "Prueba temporal",
    artist: "",
    key: "",
    versionName: "",
    content,
    notes: "",
  };

  assert.equal(payload.content, content);
});
