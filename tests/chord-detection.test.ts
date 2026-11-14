import assert from "node:assert/strict";
import test from "node:test";
import { detectExpectedChord, scoreChord } from "../mobile/src/music/chordDetection.ts";
import { getChordPitchClasses, getChordMatchFamily, getSimplifiedChord, parseChordSymbol } from "../mobile/src/music/chordTheory.ts";

const SAMPLE_RATE = 44100;
const LENGTH = 4096;

const ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const FLAT_EQUIVALENTS = [
  ["C#", "Db"],
  ["D#", "Eb"],
  ["F#", "Gb"],
  ["G#", "Ab"],
  ["A#", "Bb"],
] as const;

function pitchClassToFrequency(pitchClass: number) {
  const midi = 48 + pitchClass;
  return 440 * 2 ** ((midi - 69) / 12);
}

function synthesizeChord(chord: string) {
  const pitchClasses = getChordPitchClasses(chord);
  assert.ok(pitchClasses, `El test necesita un acorde parseable: ${chord}`);
  const frequencies = pitchClasses.map(pitchClassToFrequency);
  const samples = new Float32Array(LENGTH);
  for (let index = 0; index < LENGTH; index += 1) {
    const time = index / SAMPLE_RATE;
    samples[index] = frequencies.reduce(
      (sum, frequency) => sum + Math.sin(2 * Math.PI * frequency * time) * 0.22,
      0,
    );
  }
  return samples;
}

test("scoring favorece el template de G para una señal sintética de G", () => {
  const result = detectExpectedChord(synthesizeChord("G"), SAMPLE_RATE, ["G", "D"]);

  assert.equal(result.candidate, "G");
  assert.ok((result.scores.G ?? 0) > (result.scores.D ?? 0));
});

test("detecta acordes esperados simples contra una lista restringida", () => {
  assert.equal(detectExpectedChord(synthesizeChord("D"), SAMPLE_RATE, ["G", "D"]).candidate, "D");
  assert.equal(detectExpectedChord(synthesizeChord("Em"), SAMPLE_RATE, ["D", "Em"]).candidate, "Em");
  assert.equal(detectExpectedChord(synthesizeChord("C"), SAMPLE_RATE, ["Em", "C"]).candidate, "C");
});

test("detecta acordes comunes agregados contra una lista restringida", () => {
  assert.equal(detectExpectedChord(synthesizeChord("A"), SAMPLE_RATE, ["G", "A"]).candidate, "A");
  assert.equal(detectExpectedChord(synthesizeChord("Am"), SAMPLE_RATE, ["A", "Am"]).candidate, "Am");
  assert.equal(detectExpectedChord(synthesizeChord("B"), SAMPLE_RATE, ["A", "B"]).candidate, "B");
  assert.equal(detectExpectedChord(synthesizeChord("E"), SAMPLE_RATE, ["Em", "E"]).candidate, "E");
  assert.equal(detectExpectedChord(synthesizeChord("F"), SAMPLE_RATE, ["E", "F"]).candidate, "F");
  assert.equal(detectExpectedChord(synthesizeChord("Dm"), SAMPLE_RATE, ["D", "Dm"]).candidate, "Dm");
  assert.equal(detectExpectedChord(synthesizeChord("Bm"), SAMPLE_RATE, ["Am", "Bm"]).candidate, "Bm");
});

test("detecta B mayor frente a acordes cercanos", () => {
  const result = detectExpectedChord(synthesizeChord("B"), SAMPLE_RATE, ["B", "E", "Em", "G", "Bm"]);

  assert.equal(result.candidate, "B");
  assert.ok((result.scores.B ?? 0) > (result.scores.E ?? 0));
  assert.ok((result.scores.B ?? 0) > (result.scores.G ?? 0));
  assert.ok((result.scores.B ?? 0) > (result.scores.Bm ?? 0));
});

test("genera templates para las 12 raices mayores", () => {
  for (const root of ROOTS) {
    const result = detectExpectedChord(synthesizeChord(root), SAMPLE_RATE, [root, "C"]);
    assert.equal(result.candidate, root);
  }
});

test("genera templates para las 12 raices menores", () => {
  for (const root of ROOTS) {
    const chord = `${root}m`;
    const result = detectExpectedChord(synthesizeChord(chord), SAMPLE_RATE, [root, chord]);
    assert.equal(result.candidate, chord);
  }
});

test("parsea enharmonicos y slash chords sin codigo especial por acorde", () => {
  for (const [sharp, flat] of FLAT_EQUIVALENTS) {
    assert.equal(parseChordSymbol(flat)?.root, sharp);
    assert.deepEqual(getChordPitchClasses(sharp), getChordPitchClasses(flat));
  }

  const slash = parseChordSymbol("D/F#");
  assert.equal(slash?.root, "D");
  assert.equal(slash?.bass, "F#");
  assert.deepEqual(getChordPitchClasses("D/F#"), getChordPitchClasses("D"));
});

test("parsea cifrado latino como equivalente musical del cifrado americano", () => {
  const equivalents = [
    ["DO", "C"],
    ["REm", "Dm"],
    ["MI", "E"],
    ["FA", "F"],
    ["FA#m", "F#m"],
    ["SOL", "G"],
    ["SOLm", "Gm"],
    ["SOL7", "G7"],
    ["LA7", "A7"],
    ["SI", "B"],
    ["SIb", "Bb"],
    ["SIbm", "Bbm"],
    ["SOL/SI", "G/B"],
    ["RE/FA#", "D/F#"],
  ] as const;

  for (const [latin, english] of equivalents) {
    assert.ok(parseChordSymbol(latin), `${latin} debe parsearse`);
    assert.deepEqual(getChordPitchClasses(latin), getChordPitchClasses(english), `${latin} debe equivaler a ${english}`);
  }
});

test("detecta acordes esperados escritos en cifrado latino", () => {
  const result = detectExpectedChord(synthesizeChord("FA"), SAMPLE_RATE, ["FA", "DO"]);

  assert.equal(result.candidate, "FA");
  assert.ok((result.scores.FA ?? 0) > (result.scores.DO ?? 0));
});

test("soporta familias de septima, suspendidos, disminuidos, aumentados y add9", () => {
  const chords = ["C7", "Cmaj7", "Cm7", "Csus2", "Csus4", "Cdim", "Caug", "Cadd9", "Cm7b5", "C6", "Cm6", "C9"];

  for (const chord of chords) {
    assert.ok(parseChordSymbol(chord), `${chord} debe parsearse`);
    assert.ok(getChordPitchClasses(chord), `${chord} debe generar pitch classes`);
    assert.ok(scoreChord(Array.from({ length: 12 }, () => 1 / 12), chord) >= 0);
  }
});

test("distingue match exacto, simplificacion musical y acorde diferente", () => {
  assert.deepEqual(getChordMatchFamily("G7", "G"), { kind: "simplified", weight: 0.82 });
  assert.deepEqual(getChordMatchFamily("Cadd9", "C"), { kind: "simplified", weight: 0.82 });
  assert.deepEqual(getChordMatchFamily("Em7", "Em"), { kind: "simplified", weight: 0.82 });
  assert.deepEqual(getChordMatchFamily("D/F#", "D"), { kind: "exact", weight: 1 });
  assert.deepEqual(getChordMatchFamily("G", "D"), { kind: "different", weight: 0 });
  assert.equal(getSimplifiedChord("A7"), "A");
});

test("rechaza silencio como unknown", () => {
  const result = detectExpectedChord(new Float32Array(LENGTH), SAMPLE_RATE, ["G", "D"]);

  assert.equal(result.candidate, "unknown");
  assert.equal(result.confidence, 0);
});

test("scoreChord produce valores no negativos", () => {
  assert.ok(scoreChord(Array.from({ length: 12 }, () => 1 / 12), "G") >= 0);
});
