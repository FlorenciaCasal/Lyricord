import assert from "node:assert/strict";
import test from "node:test";
import type { AudioEvidenceFrame } from "../mobile/src/music/audioEvidence.ts";
import { getLineChordSegments, joinLineChordSegments } from "../mobile/src/music/chordLineSegments.ts";
import type { ChordCandidate } from "../mobile/src/music/chordDetection.ts";
import { normalizeSongContent } from "../mobile/src/music/chordTimeline.ts";
import { derivePlayRows, getPlayRowTimelineIndexes, PlayRowFollower } from "../mobile/src/music/playRows.ts";
import { decidePlayRowScroll } from "../mobile/src/music/playRowScroll.ts";

function evidence(
  candidate: ChordCandidate,
  confidence = 0.8,
  temporal: Partial<Pick<AudioEvidenceFrame, "onsetStrength" | "energyRise" | "candidateChanged" | "observedEventDurationMs">> = {},
): Pick<AudioEvidenceFrame, "candidate" | "confidence" | "topCandidates"> &
  Partial<Pick<AudioEvidenceFrame, "onsetStrength" | "energyRise" | "candidateChanged" | "observedEventDurationMs">> {
  return {
    candidate,
    confidence,
    topCandidates: candidate === "unknown" ? [] : [{ chord: candidate, score: confidence, confidence }],
    ...temporal,
  };
}

function feed(follower: PlayRowFollower, candidate: ChordCandidate, times = 3) {
  let output = follower.process(evidence(candidate));
  for (let index = 1; index < times; index += 1) {
    output = follower.process(evidence(candidate));
  }
  return output;
}

function feedEvidence(
  follower: PlayRowFollower,
  candidate: ChordCandidate,
  times = 3,
  temporal: Partial<Pick<AudioEvidenceFrame, "onsetStrength" | "energyRise" | "candidateChanged" | "observedEventDurationMs">> = {},
) {
  let output = follower.process(evidence(candidate, 0.8, temporal));
  for (let index = 1; index < times; index += 1) {
    output = follower.process(evidence(candidate, 0.8, temporal));
  }
  return output;
}

test("PlayRow agrupa una fila C#m A E como una sola unidad", () => {
  const normalized = normalizeSongContent("C # m     A     E\nCae el sol en tu balcon\n\nB");
  const rows = derivePlayRows(normalized.chordEvents, normalized.lines.length);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].chordEvents.map((event) => event.normalizedChord), ["C#m", "A", "E"]);
  assert.equal(rows[0].chordLineIndex, 0);
  assert.deepEqual(rows[0].associatedLineIndexes, [0, 1, 2]);
  assert.equal(rows[0].startTimelineIndex, 0);
  assert.equal(rows[0].endTimelineIndex, 2);
});

test("highlight por PlayRow activa todos los acordes de la fila preservando espacios", () => {
  const line = "C # m     A     E";
  const timeline = normalizeSongContent(`${line}\nletra`).chordEvents;
  const row = derivePlayRows(timeline, 2)[0];
  const segments = getLineChordSegments(line, 0, timeline, -1, {
    activeTimelineIndexes: getPlayRowTimelineIndexes(row),
  });

  assert.equal(joinLineChordSegments(segments), line);
  assert.deepEqual(
    segments.filter((segment) => segment.type === "chord").map((segment) => segment.active),
    [true, true, true],
  );
});

test("PlayRowFollower avanza por evidencia estable de cualquier acorde de la siguiente fila", () => {
  const rows = derivePlayRows(normalizeSongContent("C#m A E\nletra\nF G C").chordEvents, 3);
  const follower = new PlayRowFollower(rows);

  const output = feed(follower, "F");

  assert.equal(output.advanced, true);
  assert.equal(output.currentRowIndex, 1);
});

test("omitir acordes de la fila actual no bloquea avanzar a la siguiente fila", () => {
  const rows = derivePlayRows(normalizeSongContent("C#m A E\nletra\nF G C").chordEvents, 3);
  const follower = new PlayRowFollower(rows);

  feed(follower, "C#m");
  const output = feed(follower, "G");

  assert.equal(output.advanced, true);
  assert.equal(follower.currentIndex, 1);
});

test("un acorde extra dentro de la fila no mueve la posicion", () => {
  const rows = derivePlayRows(normalizeSongContent("B\nletra\nC#m A E").chordEvents, 3);
  const follower = new PlayRowFollower(rows);

  const extra = feed(follower, "G");

  assert.equal(extra.advanced, false);
  assert.equal(follower.currentIndex, 0);
});

test("dos filas parcialmente iguales avanzan solo con acorde claro de la siguiente fila", () => {
  const rows = derivePlayRows(normalizeSongContent("A E\nletra\nA B").chordEvents, 3);
  const follower = new PlayRowFollower(rows);

  assert.equal(feed(follower, "A", 5).advanced, false);
  const output = feed(follower, "B");

  assert.equal(output.advanced, true);
  assert.equal(follower.currentIndex, 1);
});

test("dos filas identicas pueden avanzar una fila por continuidad estable sin teletransportar", () => {
  const rows = derivePlayRows(normalizeSongContent("G Am\nletra\nG Am\nmas letra\nG Am").chordEvents, 5);
  const follower = new PlayRowFollower(rows);

  const onlyOneChord = feed(follower, "G", 8);
  assert.equal(onlyOneChord.advanced, false);
  assert.equal(follower.currentIndex, 0);

  feed(follower, "Am", 5);
  assert.equal(follower.currentIndex, 0);

  const firstAdvance = feed(follower, "G", 3);

  assert.equal(firstAdvance.advanced, true);
  assert.equal(follower.currentIndex, 1);

  feed(follower, "G", 1);
  assert.equal(follower.currentIndex, 1);
});

test("filas C#m A E repetidas consumen una sola fila por ciclo observado", () => {
  const rows = derivePlayRows(normalizeSongContent("Intro: C#m A E E\n\nC#m A E\nletra\nC#m A E\notra letra").chordEvents, 6);
  const follower = new PlayRowFollower(rows);

  feed(follower, "C#m", 10);
  assert.equal(follower.currentIndex, 0);

  feed(follower, "A", 5);
  assert.equal(follower.currentIndex, 0);

  feed(follower, "E", 8);
  assert.equal(follower.currentIndex, 0);

  feed(follower, "C#m", 5);
  assert.equal(follower.currentIndex, 1);

  feed(follower, "A", 5);
  feed(follower, "E", 5);
  feed(follower, "C#m", 5);
  assert.equal(follower.currentIndex, 2);
});

test("fila B C#m A permite que un nuevo B inicie la siguiente PlayRow B", () => {
  const rows = derivePlayRows(normalizeSongContent("B C#m A\ntexto\nB").chordEvents, 3);
  const follower = new PlayRowFollower(rows);

  feed(follower, "B", 4);
  assert.equal(follower.currentIndex, 0);
  feed(follower, "C#m", 4);
  assert.equal(follower.currentIndex, 0);
  feed(follower, "A", 4);
  assert.equal(follower.currentIndex, 0);

  const output = feed(follower, "B", 3);
  assert.equal(output.advanced, true);
  assert.equal(follower.currentIndex, 1);
});

test("sustain B al comienzo de B C#m A no avanza hacia la siguiente PlayRow B", () => {
  const rows = derivePlayRows(normalizeSongContent("B C#m A\ntexto\nB").chordEvents, 3);
  const follower = new PlayRowFollower(rows);

  const output = feed(follower, "B", 12);

  assert.equal(output.advanced, false);
  assert.equal(follower.currentIndex, 0);
});

test("fila B C#m mantiene ambiguedad hasta que aparece A claro de la siguiente fila", () => {
  const rows = derivePlayRows(normalizeSongContent("B C#m\ntexto\nB C#m A").chordEvents, 3);
  const follower = new PlayRowFollower(rows);

  feed(follower, "B", 4);
  feed(follower, "C#m", 4);
  assert.equal(follower.currentIndex, 0);

  const output = feed(follower, "A", 3);
  assert.equal(output.advanced, true);
  assert.equal(follower.currentIndex, 1);
});

test("gaps unknown breves no rompen la frase interna de PlayRow", () => {
  const rows = derivePlayRows(normalizeSongContent("B C#m A\ntexto\nB").chordEvents, 3);
  const follower = new PlayRowFollower(rows);

  follower.process(evidence("B"));
  follower.process(evidence("unknown", 0));
  feed(follower, "B", 2);
  follower.process(evidence("C#m"));
  follower.process(evidence("unknown", 0));
  feed(follower, "C#m", 2);
  follower.process(evidence("A"));
  follower.process(evidence("unknown", 0));
  feed(follower, "A", 2);

  const output = feed(follower, "B", 3);
  assert.equal(output.advanced, true);
  assert.equal(follower.currentIndex, 1);
});

test("boundary E al final de current y E en next no avanza por sustain", () => {
  const rows = derivePlayRows(normalizeSongContent("B C#m A E\ntexto\nE").chordEvents, 3);
  const follower = new PlayRowFollower(rows);

  feed(follower, "B", 3);
  feed(follower, "C#m", 3);
  feed(follower, "A", 3);
  feed(follower, "E", 20);

  assert.equal(follower.currentIndex, 0);
});

test("boundary E al final de current y E en next avanza con nuevo ataque", () => {
  const rows = derivePlayRows(normalizeSongContent("B C#m A E\ntexto\nE").chordEvents, 3);
  const follower = new PlayRowFollower(rows);

  feed(follower, "B", 3);
  feed(follower, "C#m", 3);
  feed(follower, "A", 3);
  feed(follower, "E", 6);
  assert.equal(follower.currentIndex, 0);

  const output = feedEvidence(follower, "E", 1, { onsetStrength: 0.78, energyRise: 0.04 });

  assert.equal(output.advanced, true);
  assert.equal(follower.currentIndex, 1);
});

test("current E next E no avanza por sustain continuo", () => {
  const rows = derivePlayRows(normalizeSongContent("E\ntexto\nE").chordEvents, 3);
  const follower = new PlayRowFollower(rows);

  feed(follower, "E", 20);

  assert.equal(follower.currentIndex, 0);
});

test("current E next E avanza exactamente una row con separacion y nuevo ataque", () => {
  const rows = derivePlayRows(normalizeSongContent("E\ntexto\nE\nmas texto\nE").chordEvents, 5);
  const follower = new PlayRowFollower(rows);

  feed(follower, "E", 6);
  follower.process(evidence("unknown", 0));
  const output = feedEvidence(follower, "E", 1, { onsetStrength: 0.8, energyRise: 0.05, candidateChanged: true });

  assert.equal(output.advanced, true);
  assert.equal(follower.currentIndex, 1);

  feed(follower, "E", 10);
  assert.equal(follower.currentIndex, 1);
});

test("despues de una fila B puede avanzar a la siguiente fila C#m A E", () => {
  const rows = derivePlayRows(normalizeSongContent("B\nLa verdad\nC#m A E\nYo quiero").chordEvents, 4);
  const follower = new PlayRowFollower(rows);

  feed(follower, "B", 4);
  assert.equal(follower.currentIndex, 0);

  const output = feed(follower, "C#m", 3);
  assert.equal(output.advanced, true);
  assert.equal(follower.currentIndex, 1);
});

test("gap unknown breve entre evidencias de nextRow conserva estabilidad", () => {
  const rows = derivePlayRows(normalizeSongContent("E\ntexto\nG").chordEvents, 3);
  const follower = new PlayRowFollower(rows);

  follower.process(evidence("G", 0.623));
  follower.process(evidence("unknown", 0));
  follower.process(evidence("G", 0.785));
  const output = follower.process(evidence("G", 0.8));

  assert.equal(output.advanced, true);
  assert.equal(follower.currentIndex, 1);
});

test("evidencia fuerte de currentRow entre nextRow no cuenta como gap unknown", () => {
  const rows = derivePlayRows(normalizeSongContent("E\ntexto\nG").chordEvents, 3);
  const follower = new PlayRowFollower(rows);

  follower.process(evidence("G", 0.75));
  follower.process(evidence("E", 0.8));
  follower.process(evidence("G", 0.8));

  assert.equal(follower.currentIndex, 0);
});

test("tap fila futura y fila anterior tiene prioridad explicita", () => {
  const rows = derivePlayRows(normalizeSongContent("A\nB\nC\nD").chordEvents, 4);
  const follower = new PlayRowFollower(rows);

  follower.resetToRow(3);
  assert.equal(follower.currentIndex, 3);

  follower.resetToRow(1);
  assert.equal(follower.currentIndex, 1);
});

test("restart vuelve a la primera PlayRow", () => {
  const rows = derivePlayRows(normalizeSongContent("Intro: C#m A E\nB").chordEvents, 2);
  const follower = new PlayRowFollower(rows);

  follower.resetToRow(1);
  follower.reset();

  assert.equal(follower.currentIndex, 0);
  assert.deepEqual(rows[0].chordEvents.map((event) => event.normalizedChord), ["C#m", "A", "E"]);
});

test("PlayRow ignora anotaciones y parentesis como eventos extra", () => {
  const rows = derivePlayRows(normalizeSongContent("B C # m A - E (cual intro)\nE (en segundo tiempo de E)").chordEvents, 2);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].chordEvents.map((event) => event.normalizedChord), ["B", "C#m", "A", "E"]);
  assert.deepEqual(rows[1].chordEvents.map((event) => event.normalizedChord), ["E"]);
});

test("scroll por PlayRow mantiene la fila activa cerca de un anchor estable", () => {
  const decision = decidePlayRowScroll(
    {
      currentScrollY: 0,
      viewportHeight: 700,
      lastAutomaticScrollY: -1,
      lastScrolledLineIndex: 4,
      animationInProgress: false,
      layoutReady: true,
      layoutValid: true,
    },
    { targetLineIndex: 8, targetLineY: 360 },
  );

  assert.equal(decision.shouldScroll, true);
  assert.equal(decision.reason, "scroll");
  assert.ok(decision.targetY > 0);
});

test("scroll por PlayRow mueve si la fila activa queda abajo del viewport", () => {
  const decision = decidePlayRowScroll(
    {
      currentScrollY: 0,
      viewportHeight: 700,
      lastAutomaticScrollY: -1,
      lastScrolledLineIndex: 4,
      animationInProgress: false,
      layoutReady: true,
      layoutValid: true,
    },
    { targetLineIndex: 20, targetLineY: 650 },
  );

  assert.equal(decision.shouldScroll, true);
  assert.equal(decision.reason, "scroll");
  assert.ok(decision.targetY > 0);
});

test("scroll por PlayRow puede avanzar cuando la geometria target es valida aunque la validacion global haya fallado", () => {
  const decision = decidePlayRowScroll(
    {
      currentScrollY: 0,
      viewportHeight: 743,
      lastAutomaticScrollY: -1,
      lastScrolledLineIndex: 8,
      animationInProgress: false,
      layoutReady: true,
      layoutValid: true,
    },
    { targetLineIndex: 20, targetLineY: 620 },
  );

  assert.equal(decision.shouldScroll, true);
  assert.equal(decision.reason, "scroll");
});
