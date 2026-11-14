import assert from "node:assert/strict";
import test from "node:test";
import { transposeChordName, transposeSongText } from "../lib/transpose.ts";
import { transposeChordName as transposeChordNameMobile, transposeSongText as transposeSongTextMobile } from "../mobile/src/music/transpose.ts";

test("transpone acordes sin cambiar espacios ni saltos de línea", () => {
  const original = "      B              F#\nNo queda nadie en la ciudad";
  const result = transposeSongText(original, 1);
  assert.equal(result, "      C              G\nNo queda nadie en la ciudad");
});

test("cero semitonos conserva exactamente el contenido", () => {
  const original = "  G   D\nTexto  con  espacios\n";
  assert.equal(transposeSongText(original, 0), original);
});

test("la implementación mobile mantiene paridad con la web", () => {
  const samples = [
    "G D Em C\nUna canción",
    "SOL RE MIm DO\nOtra canción",
    "Bbmaj7 F/A Gm7 Eb",
  ];

  for (const sample of samples) {
    for (const semitones of [-3, -1, 0, 1, 5]) {
      assert.equal(
        transposeSongTextMobile(sample, semitones),
        transposeSongText(sample, semitones),
      );
    }
  }
});

test("transpone a nombres practicos sin dobles sostenidos ni bemoles", () => {
  const cases: Array<[string, number, string]> = [
    ["G#", 1, "A"],
    ["G#m", 1, "Am"],
    ["F#", 1, "G"],
    ["C#", 1, "D"],
    ["B", 1, "C"],
    ["E", 1, "F"],
    ["C", -1, "B"],
    ["F", -1, "E"],
    ["G##m", 1, "Bbm"],
    ["Cbb", 1, "B"],
    ["F#/A#", 1, "G/B"],
    ["C#sus4", 1, "Dsus4"],
    ["G#maj7", 1, "Amaj7"],
  ];

  for (const [chord, semitones, expected] of cases) {
    assert.equal(transposeChordName(chord, semitones), expected);
    assert.equal(transposeChordNameMobile(chord, semitones), expected);
    assert(!transposeChordName(chord, semitones).includes("##"));
    assert(!transposeChordName(chord, semitones).includes("bb"));
  }
});

test("transpone B sostenido y sus variantes desde su equivalencia con C", () => {
  const cases: Array<[string, number, string]> = [
    ["B#", 1, "C#"],
    ["B#", 2, "D"],
    ["B#m", 1, "C#m"],
    ["B#7", 1, "C#7"],
    ["F/B#", 1, "F#/C#"],
    ["SI#", 1, "DO#"],
    ["E#", 1, "F#"],
    ["Cb", 1, "C"],
    ["Fb", 1, "F"],
  ];

  for (const [chord, semitones, expected] of cases) {
    assert.equal(transposeChordName(chord, semitones), expected);
    assert.equal(transposeChordNameMobile(chord, semitones), expected);
  }
});

test("transpone texto con B# y conserva paridad en transposiciones sucesivas", () => {
  const original = "F  B#";
  const firstWeb = transposeSongText(original, 1);
  const firstMobile = transposeSongTextMobile(original, 1);

  assert.equal(firstWeb, "F#  C#");
  assert.equal(firstMobile, firstWeb);

  const secondWeb = transposeSongText(firstWeb, 1);
  const secondMobile = transposeSongTextMobile(firstMobile, 1);
  assert.equal(secondWeb, "G  D");
  assert.equal(secondMobile, secondWeb);
});

test("transpone cifrado latino conservando la familia de notacion", () => {
  const cases: Array<[string, number, string]> = [
    ["DO", 2, "RE"],
    ["DOm", 2, "REm"],
    ["REm", 2, "MIm"],
    ["FA#", 1, "SOL"],
    ["SIb", 1, "SI"],
    ["SIbm", 1, "SIm"],
    ["SOL7", 2, "LA7"],
    ["SOL/SI", 2, "LA/DO#"],
    ["RE/FA#", 2, "MI/SOL#"],
    ["DO", -1, "SI"],
    ["MI", -1, "MIb"],
  ];

  for (const [chord, semitones, expected] of cases) {
    assert.equal(transposeChordNameMobile(chord, semitones), expected);
    assert.equal(transposeChordName(chord, semitones), expected);
  }
});

test("transpone contenido real con accidentales espaciados como lo renderiza SongDetail", () => {
  const original = [
    "Intro : C # m A E E",
    "F #       G # m",
    "B b       C # sus4",
    "E (en segundo tiempo de E)",
    "B C # m A - E (cual intro)",
  ].join("\n");

  const expected = [
    "Intro : Dm Bb F F",
    "G       Am",
    "B       Dsus4",
    "F (en segundo tiempo de E)",
    "C Dm Bb - F (cual intro)",
  ].join("\n");

  assert.equal(transposeSongTextMobile(original, 1), expected);
  assert.equal(transposeSongText(original, 1), expected);
  assert(!transposeSongTextMobile(original, 1).includes("##"));
  assert(!transposeSongTextMobile(original, 1).includes("bb"));
});

test("transpone acordes despues de section marker entre corchetes", () => {
  const original = "[Intro] Em C D B7";
  const expected = "[Intro] Fm C# Eb C7";

  assert.equal(transposeSongTextMobile(original, 1), expected);
  assert.equal(transposeSongText(original, 1), expected);
});

test("transpone cifrado latino en lineas y section markers preservando notacion latina", () => {
  const original = [
    "[Intro] REm SIb DO LA7",
    "FA        DO       REm",
    "Ha llegado tu recuerdo",
    "SIb          SOLm",
    "Solo quiero verte",
  ].join("\n");

  const expected = [
    "[Intro] MIm DO RE SI7",
    "SOL        RE       MIm",
    "Ha llegado tu recuerdo",
    "DO          LAm",
    "Solo quiero verte",
  ].join("\n");

  assert.equal(transposeSongTextMobile(original, 2), expected);
  assert.equal(transposeSongText(original, 2), expected);
});
