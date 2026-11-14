import assert from "node:assert/strict";
import test from "node:test";
import { deriveChordTimeline, normalizeSongContent } from "../mobile/src/music/chordTimeline.ts";

test("normalizeSongContent conserva el contenido original exacto", () => {
  const content = "B C # m A - E (cual intro)\nE (en segundo tiempo de E)\n";
  const normalized = normalizeSongContent(content);

  assert.equal(normalized.originalContent, content);
  assert.deepEqual(normalized.lines.map((line) => line.originalText), [
    "B C # m A - E (cual intro)",
    "E (en segundo tiempo de E)",
    "",
  ]);
});

test("normaliza acordes humanos con espacios internos sin alterar source range", () => {
  const cases = [
    ["C # m", "C#m"],
    ["F #", "F#"],
    ["B b", "Bb"],
  ] as const;

  for (const [written, normalizedChord] of cases) {
    const normalized = normalizeSongContent(written);
    const event = normalized.chordEvents[0];

    assert.equal(event.originalChord, written);
    assert.equal(event.normalizedChord, normalizedChord);
    assert.equal(event.charStart, 0);
    assert.equal(event.charEnd, written.length);
  }
});

test("separador dash no genera evento musical", () => {
  const normalized = normalizeSongContent("A -");

  assert.deepEqual(normalized.chordEvents.map((event) => event.normalizedChord), ["A"]);
  assert.deepEqual(normalized.lines[0].separators.map((separator) => separator.kind), ["dash"]);
  assert.equal(normalized.lines[0].separators[0].originalText, "-");
});

test("separador de compas no genera evento musical", () => {
  const normalized = normalizeSongContent("A | E");

  assert.deepEqual(normalized.chordEvents.map((event) => event.normalizedChord), ["A", "E"]);
  assert.deepEqual(normalized.lines[0].separators.map((separator) => separator.kind), ["bar"]);
  assert.equal(normalized.lines[0].separators[0].originalText, "|");
});

test("silencio explicito se representa como pausa y no como acorde", () => {
  const normalized = normalizeSongContent("B (silencio)");

  assert.deepEqual(normalized.chordEvents.map((event) => event.normalizedChord), ["B"]);
  assert.deepEqual(normalized.lines[0].boundaries, ["silencio"]);
  assert.equal(normalized.chordEvents[0].boundaryAfter, "silencio");
});

test("anotacion cual intro no corta el seguimiento ni genera acorde", () => {
  const normalized = normalizeSongContent("B C # m A - E (cual intro)");

  assert.deepEqual(normalized.chordEvents.map((event) => event.originalChord), ["B", "C # m", "A", "E"]);
  assert.deepEqual(normalized.chordEvents.map((event) => event.normalizedChord), ["B", "C#m", "A", "E"]);
  assert.deepEqual(normalized.lines[0].annotations, ["cual intro"]);
  assert.deepEqual(normalized.lines[0].boundaries, []);
  assert.deepEqual(normalized.chordEvents.map((event) => event.boundaryAfter), [null, null, null, null]);
  assert.deepEqual(normalized.lines[0].separators.map((separator) => separator.kind), ["dash"]);
});

test("anotacion de tiempo no parsea acordes internos", () => {
  const normalized = normalizeSongContent("E (en segundo tiempo de E)");

  assert.deepEqual(normalized.chordEvents.map((event) => event.normalizedChord), ["E"]);
  assert.deepEqual(normalized.lines[0].annotations, ["en segundo tiempo de e"]);
  assert.deepEqual(normalized.lines[0].boundaries, []);
});

test("deriveChordTimeline usa la estructura normalizada", () => {
  const timeline = deriveChordTimeline("B C # m A - E (cual intro)");

  assert.deepEqual(timeline.map((event) => event.normalizedChord), ["B", "C#m", "A", "E"]);
  assert.equal(timeline[1].originalChord, "C # m");
  assert.equal(timeline[1].charStart, 2);
  assert.equal(timeline[1].charEnd, 7);
});
