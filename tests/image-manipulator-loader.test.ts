import assert from "node:assert/strict";
import test from "node:test";
import {
  IMAGE_MANIPULATOR_UNAVAILABLE_MESSAGE,
  loadImageManipulatorModule,
  type ImageManipulatorImporter,
} from "../mobile/src/utils/imageManipulatorLoader.ts";

test("el modulo de imagenes no se carga hasta que se solicita", async () => {
  let importCalls = 0;
  const importer = (() => {
    importCalls += 1;
    return Promise.resolve({ marker: "loaded" });
  }) as unknown as ImageManipulatorImporter;

  assert.equal(importCalls, 0);
  const module = await loadImageManipulatorModule(importer);

  assert.equal(importCalls, 1);
  assert.equal((module as unknown as { marker: string }).marker, "loaded");
});

test("la ausencia del modulo nativo se convierte en un error comprensible", async () => {
  const importer = (() => Promise.reject(new Error("Cannot find native module 'ExpoImageManipulator'"))) as ImageManipulatorImporter;

  await assert.rejects(loadImageManipulatorModule(importer), {
    message: IMAGE_MANIPULATOR_UNAVAILABLE_MESSAGE,
  });
});
