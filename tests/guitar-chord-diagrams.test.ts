import assert from "node:assert/strict";
import test from "node:test";
import { getChordDiagramPresentation } from "../mobile/src/music/chordDiagramPresentation.ts";
import {
  findGuitarChordShapes,
  getCanonicalGuitarChord,
  GUITAR_CHORD_SHAPES,
  validateGuitarChordDictionary,
  validateGuitarChordShape,
  type GuitarChordShape,
} from "../mobile/src/music/guitarChordShapes.ts";
import { normalizeSongContent } from "../mobile/src/music/normalizeSongContent.ts";
import { transposeSongText } from "../mobile/src/music/transpose.ts";

const ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SUFFIXES = ["", "m", "7", "maj7", "m7", "sus2", "sus4", "dim", "aug", "add9", "m7b5", "6", "m6", "9"];

test("el diccionario cubre doce raíces y catorce calidades frecuentes", () => {
  for (const root of ROOTS) {
    for (const suffix of SUFFIXES) {
      assert.ok(findGuitarChordShapes(`${root}${suffix}`).shapes.length >= 1, `${root}${suffix}`);
    }
  }
  assert.equal(GUITAR_CHORD_SHAPES.length, 177);
});

test("todas las digitaciones incorporadas pasan la validación musical y física", () => {
  assert.deepEqual(validateGuitarChordDictionary(), []);
});

test("la auditoría prioriza posiciones convencionales y deja una sola forma sobre el quinto traste", () => {
  const curated = GUITAR_CHORD_SHAPES.filter((shape) => shape.review === "musum-curated");
  const highPositions = GUITAR_CHORD_SHAPES.filter((shape) => shape.baseFret > 5);

  assert.equal(curated.length, 21);
  assert.deepEqual(highPositions.map((shape) => `${shape.chord}@${shape.baseFret}`), ["D#sus2@6"]);
  assert.deepEqual(findGuitarChordShapes("Cmaj7").shapes[0]?.frets, [-1, 3, 2, 0, 0, 0]);
  assert.deepEqual(findGuitarChordShapes("Fmaj7").shapes[0]?.frets, [-1, -1, 3, 2, 1, 0]);
  assert.deepEqual(findGuitarChordShapes("Bm7").shapes[0]?.frets, [-1, 2, 0, 2, 0, 2]);
});

test("normaliza cifrado latino, bemoles y equivalencias enarmónicas sin cambiar la etiqueta solicitada", () => {
  assert.equal(getCanonicalGuitarChord("DO#m7"), "C#m7");
  assert.equal(getCanonicalGuitarChord("SIb7"), "A#7");
  assert.equal(getCanonicalGuitarChord("B#"), "C");
  assert.equal(getCanonicalGuitarChord("Cb"), "B");
  assert.equal(findGuitarChordShapes("FA").requestedChord, "FA");
  assert.ok(findGuitarChordShapes("FA").shapes.length > 0);
});

test("busca inversiones únicamente cuando existe un bajo verificado", () => {
  for (const chord of ["C/E", "C/G", "D/F#", "G/B", "A/C#", "F/A", "Am/C", "Em/G", "Dm/F"]) {
    assert.equal(findGuitarChordShapes(chord).shapes.length, 1, chord);
  }
  assert.equal(findGuitarChordShapes("E/G#").shapes.length, 0);
});

test("un acorde visible transpuesto consulta la digitación de la transposición actual", () => {
  const content = transposeSongText("C   G/B   Am", 2);
  const timeline = normalizeSongContent(content).chordEvents;
  assert.deepEqual(timeline.map((event) => event.normalizedChord), ["D", "A/C#", "Bm"]);
  assert.ok(timeline.every((event) => findGuitarChordShapes(event.normalizedChord).shapes.length > 0));
});

test("un acorde reconocido pero sin digitación no recibe una forma aproximada", () => {
  const lookup = findGuitarChordShapes("C11");
  assert.equal(lookup.canonicalChord, null);
  assert.deepEqual(lookup.shapes, []);
});

test("el validador rechaza notas ajenas, bajo incorrecto y digitaciones físicas incoherentes", () => {
  const invalid: GuitarChordShape = {
    id: "invalid",
    chord: "C/E",
    frets: [-1, 3, 4, 0, 1, 0],
    fingers: [0, 1, 1, 0, 1, 0],
    baseFret: 1,
    barres: [],
    source: "musum",
    review: "musum-verified",
  };
  const errors = validateGuitarChordShape(invalid).errors;
  assert.ok(errors.some((error) => error.startsWith("foreign-note:")));
  assert.ok(errors.some((error) => error.startsWith("incorrect-bass:")));
  assert.ok(errors.some((error) => error.startsWith("finger-used-on-different-frets:")));
});

test("la presentación es inferior en iPhone y centrada en iPad en ambas orientaciones", () => {
  assert.equal(getChordDiagramPresentation(false, 390, 844).mode, "bottom-sheet");
  const portrait = getChordDiagramPresentation(true, 1024, 1366);
  const landscape = getChordDiagramPresentation(true, 1366, 1024);
  assert.equal(portrait.mode, "center-card");
  assert.equal(landscape.mode, "center-card");
  assert.ok(portrait.maxWidth <= 560);
  assert.ok(landscape.diagramSize <= 330);
});
