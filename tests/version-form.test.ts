import assert from "node:assert/strict";
import test from "node:test";
import {
  createVersionFormValues,
  toVersionCreateValues,
  transposeVersionFormValues,
} from "../mobile/src/utils/versionForm.ts";

const source = {
  title: "Prueba musum 001",
  key: "DO",
  content: "DO        SOL\nUna letra larga",
};

test("version form starts from the visible transposition without naming it after a key", () => {
  const values = createVersionFormValues(source, 2);

  assert.equal(values.versionName, "Prueba musum 001 - versión");
  assert.equal(values.key, "RE");
  assert.equal(values.content, "RE        LA\nUna letra larga");
});

test("version form transposes key and content while preserving its editable name", () => {
  const values = transposeVersionFormValues(
    {
      versionName: "Acustica",
      key: "Em",
      content: "Em C G\nLetra",
    },
    2,
  );

  assert.deepEqual(values, {
    versionName: "Acustica",
    key: "F#m",
    content: "F#m D A\nLetra",
  });
});

test("version form transposes B# when creating successive versions", () => {
  const first = createVersionFormValues(
    {
      title: "Enharmonic song",
      key: "F",
      content: "F  B#",
    },
    1,
  );

  assert.equal(first.key, "F#");
  assert.equal(first.content, "F#  C#");

  const second = transposeVersionFormValues(first, 1);
  assert.equal(second.key, "G");
  assert.equal(second.content, "G  D");
});

test("version payload trims its name and key but preserves content spacing", () => {
  assert.deepEqual(
    toVersionCreateValues({
      versionName: "  Ensayo  ",
      key: "  Am  ",
      content: "Am          F\n  letra alineada\n",
    }),
    {
      versionName: "Ensayo",
      key: "Am",
      content: "Am          F\n  letra alineada\n",
    },
  );
});

test("cancelling after preparing or transposing a version leaves the source untouched", () => {
  const snapshot = structuredClone(source);
  const draft = createVersionFormValues(source);

  transposeVersionFormValues(draft, 1);

  assert.deepEqual(source, snapshot);
});
