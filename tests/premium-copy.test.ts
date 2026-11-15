import assert from "node:assert/strict";
import test from "node:test";
import {
  formatImageImportLimit,
  formatLibraryLimit,
} from "../mobile/src/utils/premiumCopy.ts";

test("Premium comunica los límites Free sin términos técnicos", () => {
  assert.equal(formatLibraryLimit(10), "Hasta 10 canciones y versiones");
  assert.equal(formatImageImportLimit(5), "5 veces en total");
});

test("Premium comunica los beneficios ilimitados y el estado de carga", () => {
  assert.equal(formatLibraryLimit(null), "Sin límite");
  assert.equal(formatImageImportLimit(null), "Sin límite");
  assert.equal(formatLibraryLimit(undefined), "Cargando...");
  assert.equal(formatImageImportLimit(undefined), "Cargando...");
});
