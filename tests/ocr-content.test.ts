import assert from "node:assert/strict";
import test from "node:test";
import { appendExtractedSongContent } from "../mobile/src/utils/ocrContent.ts";

test("la primera extracción ocupa un editor vacío", () => {
  assert.equal(appendExtractedSongContent("", "C\nPrimera línea"), "C\nPrimera línea");
});

test("las extracciones siguientes se agregan en orden con dos saltos de línea", () => {
  const first = appendExtractedSongContent("", "Fragmento 1");
  const second = appendExtractedSongContent(first, "Fragmento 2");
  const third = appendExtractedSongContent(second, "Fragmento 3");
  assert.equal(third, "Fragmento 1\n\nFragmento 2\n\nFragmento 3");
});

test("conserva texto escrito o editado entre dos extracciones", () => {
  const manual = "Texto pegado\n\nFragmento 1\nCorrección manual";
  assert.equal(
    appendExtractedSongContent(manual, "Fragmento 2"),
    "Texto pegado\n\nFragmento 1\nCorrección manual\n\nFragmento 2",
  );
});

test("un resultado OCR vacío no modifica el contenido existente", () => {
  assert.equal(appendExtractedSongContent("Contenido intacto", ""), "Contenido intacto");
  assert.equal(appendExtractedSongContent("Contenido intacto", "  \n  "), "Contenido intacto");
});
