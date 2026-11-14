import assert from "node:assert/strict";
import test from "node:test";
import { getLineChordSegments, joinLineChordSegments } from "../mobile/src/music/chordLineSegments.ts";
import { ChordTimelineAdvanceMachine } from "../mobile/src/music/chordTimelineAdvance.ts";
import { deriveChordTimeline } from "../mobile/src/music/chordTimeline.ts";

test("resalta el acorde correcto por timelineIndex preservando espacios", () => {
  const line = "        Am             F";
  const timeline = deriveChordTimeline(`${line}\ntexto de la canción`);
  const segments = getLineChordSegments(line, 0, timeline, 0);

  assert.equal(joinLineChordSegments(segments), line);
  assert.deepEqual(
    segments.filter((segment) => segment.type === "chord").map((segment) => ({
      text: segment.text,
      active: segment.active,
      next: segment.next,
    })),
    [
      { text: "Am", active: true, next: false },
      { text: "F", active: false, next: true },
    ],
  );
});

test("distingue dos acordes iguales en lugares distintos", () => {
  const content = "G    Am\ntexto\nG    Am";
  const timeline = deriveChordTimeline(content);
  const firstLine = getLineChordSegments("G    Am", 0, timeline, 0);
  const secondLine = getLineChordSegments("G    Am", 2, timeline, 2);

  const firstG = firstLine.find((segment) => segment.type === "chord" && segment.text === "G");
  const secondG = secondLine.find((segment) => segment.type === "chord" && segment.text === "G");
  assert.equal(firstG?.type === "chord" ? firstG.active : false, true);
  assert.equal(secondG?.type === "chord" ? secondG.active : false, true);
  assert.equal(firstLine.filter((segment) => segment.type === "chord" && segment.active).length, 1);
  assert.equal(secondLine.filter((segment) => segment.type === "chord" && segment.active).length, 1);
});

test("segmenta varios acordes en una misma linea con charIndex correcto", () => {
  const line = "G     D/F#     Em7     Cadd9";
  const timeline = deriveChordTimeline(line);
  const segments = getLineChordSegments(line, 0, timeline, 2);

  assert.equal(joinLineChordSegments(segments), line);
  assert.deepEqual(timeline.map((event) => ({ chord: event.chord, charIndex: event.charIndex })), [
    { chord: "G", charIndex: 0 },
    { chord: "D/F#", charIndex: 6 },
    { chord: "Em7", charIndex: 15 },
    { chord: "Cadd9", charIndex: 23 },
  ]);
  assert.deepEqual(
    segments.filter((segment) => segment.type === "chord").map((segment) => ({
      text: segment.text,
      active: segment.active,
      next: segment.next,
    })),
    [
      { text: "G", active: false, next: false },
      { text: "D/F#", active: false, next: false },
      { text: "Em7", active: true, next: false },
      { text: "Cadd9", active: false, next: true },
    ],
  );
});

test("segmenta acordes despues de un section marker entre corchetes", () => {
  const line = "[Intro] Em C D B7";
  const timeline = deriveChordTimeline(line);
  const segments = getLineChordSegments(line, 0, timeline, 0);

  assert.equal(joinLineChordSegments(segments), line);
  assert.deepEqual(
    segments.map((segment) => segment.type === "chord" ? { type: segment.type, text: segment.text } : segment),
    [
      { type: "text", text: "[Intro] " },
      { type: "chord", text: "Em" },
      { type: "text", text: " " },
      { type: "chord", text: "C" },
      { type: "text", text: " " },
      { type: "chord", text: "D" },
      { type: "text", text: " " },
      { type: "chord", text: "B7" },
    ],
  );
});

test("segmenta cifrado latino preservando el texto original", () => {
  const line = "FA        DO       REm";
  const timeline = deriveChordTimeline(`${line}\nHa llegado tu recuerdo`);
  const segments = getLineChordSegments(line, 0, timeline, 1);

  assert.equal(joinLineChordSegments(segments), line);
  assert.deepEqual(
    segments.filter((segment) => segment.type === "chord").map((segment) => ({
      text: segment.text,
      active: segment.active,
      next: segment.next,
    })),
    [
      { text: "FA", active: false, next: false },
      { text: "DO", active: true, next: false },
      { text: "REm", active: false, next: true },
    ],
  );
});

test("segmenta cifrado latino despues de un section marker entre corchetes", () => {
  const line = "[Intro] REm SIb DO LA7";
  const timeline = deriveChordTimeline(line);
  const segments = getLineChordSegments(line, 0, timeline, 0);

  assert.equal(joinLineChordSegments(segments), line);
  assert.deepEqual(
    segments.map((segment) => segment.type === "chord" ? { type: segment.type, text: segment.text } : segment),
    [
      { type: "text", text: "[Intro] " },
      { type: "chord", text: "REm" },
      { type: "text", text: " " },
      { type: "chord", text: "SIb" },
      { type: "text", text: " " },
      { type: "chord", text: "DO" },
      { type: "text", text: " " },
      { type: "chord", text: "LA7" },
    ],
  );
});

test("slash chord simplificado resalta el simbolo original escrito", () => {
  const line = "G     D/F#     Em";
  const timeline = deriveChordTimeline(line);
  const machine = new ChordTimelineAdvanceMachine(timeline, { minConfidence: 0.6, stableFrames: 2, cooldownMs: 400 });

  machine.process({ candidate: "G", confidence: 0.9, nowMs: 0 });
  machine.process({ candidate: "G", confidence: 0.9, nowMs: 120 });
  machine.process({ candidate: "D", confidence: 0.9, nowMs: 700 });
  machine.process({ candidate: "D", confidence: 0.9, nowMs: 820 });

  const segments = getLineChordSegments(line, 0, timeline, machine.currentIndex);
  const active = segments.find((segment) => segment.type === "chord" && segment.active);
  assert.equal(active?.text, "D/F#");
});

test("acorde simplificado resalta el simbolo original escrito", () => {
  const line = "G     G7     C";
  const timeline = deriveChordTimeline(line);
  const machine = new ChordTimelineAdvanceMachine(timeline, { minConfidence: 0.6, stableFrames: 2, cooldownMs: 400 });

  machine.process({ candidate: "G", confidence: 0.9, nowMs: 0 });
  machine.process({ candidate: "G", confidence: 0.9, nowMs: 120 });
  machine.process({ candidate: "unknown", confidence: 0, nowMs: 700 });
  machine.process({ candidate: "G", confidence: 0.9, nowMs: 820 });
  machine.process({ candidate: "G", confidence: 0.9, nowMs: 940 });
  machine.process({ candidate: "G", confidence: 0.9, nowMs: 1060 });

  const segments = getLineChordSegments(line, 0, timeline, machine.currentIndex);
  const active = segments.find((segment) => segment.type === "chord" && segment.active);
  assert.equal(active?.text, "G7");
});

test("acorde omitido salta el highlight al evento confirmado", () => {
  const line = "Am     A11     F";
  const timeline = deriveChordTimeline(line);
  const machine = new ChordTimelineAdvanceMachine(timeline, { minConfidence: 0.6, stableFrames: 2, cooldownMs: 400 });

  machine.process({ candidate: "Am", confidence: 0.9, nowMs: 0 });
  machine.process({ candidate: "Am", confidence: 0.9, nowMs: 120 });
  machine.process({ candidate: "F", confidence: 0.95, nowMs: 700 });
  machine.process({ candidate: "F", confidence: 0.95, nowMs: 820 });
  machine.process({ candidate: "F", confidence: 0.95, nowMs: 940 });

  const segments = getLineChordSegments(line, 0, timeline, machine.currentIndex);
  const active = segments.find((segment) => segment.type === "chord" && segment.active);
  assert.equal(active?.text, "F");
  assert.equal(joinLineChordSegments(segments), line);
});

test("lineas sin acordes y lineas vacias preservan texto visible", () => {
  assert.deepEqual(getLineChordSegments("texto sin acordes", 0, [], -1), [{ type: "text", text: "texto sin acordes" }]);
  assert.deepEqual(getLineChordSegments("", 0, [], -1), [{ type: "text", text: " " }]);
});

test("lineas largas preservan acordes y texto para permitir wrap visual", () => {
  const chordLine = "C#m        A        E";
  const lyricLine =
    "Esta es una linea de letra bastante larga que debe poder envolver en pantalla sin perder el orden del texto";
  const content = `${chordLine}\n${lyricLine}`;
  const timeline = deriveChordTimeline(content);

  const chordSegments = getLineChordSegments(chordLine, 0, timeline, 1);
  const lyricSegments = getLineChordSegments(lyricLine, 1, timeline, 1);

  assert.equal(joinLineChordSegments(chordSegments), chordLine);
  assert.equal(joinLineChordSegments(lyricSegments), lyricLine);
  assert.deepEqual(
    chordSegments.filter((segment) => segment.type === "chord").map((segment) => segment.text),
    ["C#m", "A", "E"],
  );
});
