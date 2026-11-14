import assert from "node:assert/strict";
import test from "node:test";
import { ChordPositionFollower } from "../mobile/src/music/chordPositionFollower.ts";
import { deriveChordTimeline } from "../mobile/src/music/chordTimeline.ts";

function makeFollower(content: string) {
  return new ChordPositionFollower(deriveChordTimeline(content), {
    stableFrames: 2,
    minConfidence: 0.6,
    wrongEvidenceToReacquire: 2,
    reacquireMinMatches: 2,
    reacquireCommitScore: 1.35,
    reacquireCommitMargin: 0.25,
  });
}

function play(
  follower: ChordPositionFollower,
  chord: string,
  options: { confidence?: number; startMs?: number; frames?: number } = {},
) {
  const confidence = options.confidence ?? 0.9;
  const startMs = options.startMs ?? 0;
  const frames = options.frames ?? 2;
  let output = follower.process({ candidate: chord, confidence, nowMs: startMs });
  for (let frame = 1; frame < frames; frame += 1) {
    output = follower.process({ candidate: chord, confidence, nowMs: startMs + frame * 120 });
  }
  return output;
}

function playUntilAdvanced(
  follower: ChordPositionFollower,
  chord: string,
  options: { confidence?: number; startMs?: number; frames?: number } = {},
) {
  const confidence = options.confidence ?? 0.9;
  const startMs = options.startMs ?? 0;
  const frames = options.frames ?? 3;
  let output = follower.process({ candidate: chord, confidence, nowMs: startMs });
  if (output.advanced) return output;
  for (let frame = 1; frame < frames; frame += 1) {
    output = follower.process({ candidate: chord, confidence, nowMs: startMs + frame * 120 });
    if (output.advanced) return output;
  }
  return output;
}

function separate(follower: ChordPositionFollower, nowMs = 0) {
  return follower.process({ candidate: "unknown", confidence: 0, nowMs });
}

test("seguimiento normal avanza por la progresion escrita", () => {
  const follower = makeFollower("C   G   Am   F");

  play(follower, "C", { startMs: 0 });
  assert.equal(follower.currentIndex, 0);
  assert.equal(play(follower, "G", { startMs: 600 }).committedTimelineIndex, 1);
  assert.equal(play(follower, "Am", { startMs: 1200 }).committedTimelineIndex, 2);
  assert.equal(play(follower, "F", { startMs: 1800 }).committedTimelineIndex, 3);
});

test("omite un acorde intermedio sin perder posicion", () => {
  const follower = makeFollower("Am   A11   F   G");

  play(follower, "Am", { startMs: 0 });
  const output = play(follower, "F", { startMs: 700, confidence: 0.9 });

  assert.equal(output.advanced, true);
  assert.equal(output.committedTimelineIndex, 2);
  assert.equal(output.currentEvent.chord, "F");
});

test("omite dos acordes con evidencia fuerte", () => {
  const follower = makeFollower("Am   A11   D11   F   G");

  play(follower, "Am", { startMs: 0 });
  const output = play(follower, "F", { startMs: 700, confidence: 0.96 });

  assert.equal(output.advanced, true);
  assert.equal(output.committedTimelineIndex, 3);
});

test("un acorde incorrecto no mueve la posicion confirmada", () => {
  const follower = makeFollower("Am   F   G   C");

  play(follower, "Am", { startMs: 0 });
  const output = play(follower, "B", { startMs: 700 });

  assert.equal(output.advanced, false);
  assert.equal(output.committedTimelineIndex, 0);
});

test("no resincroniza por un G ambiguo aislado en progresion repetida", () => {
  const follower = makeFollower("Am   F   G   C   F   E\nAm   F   G   C   F   E");

  play(follower, "Am", { startMs: 0 });
  play(follower, "B", { startMs: 700 });
  play(follower, "B", { startMs: 1100 });
  const output = play(follower, "G", { startMs: 1600 });

  assert.equal(output.mode, "reacquiring");
  assert.equal(output.advanced, false);
  assert.equal(output.committedTimelineIndex, 0);
});

test("no resincroniza por una subsecuencia repetida ambigua", () => {
  const follower = makeFollower("Am   F   G   C   F   E\nAm   F   G   C   F   E");

  play(follower, "Am", { startMs: 0 });
  play(follower, "B", { startMs: 700 });
  play(follower, "B", { startMs: 1100 });
  play(follower, "G", { startMs: 1600 });
  const output = play(follower, "C", { startMs: 2200 });

  assert.equal(output.mode, "reacquiring");
  assert.equal(output.sequenceAmbiguous, true);
  assert.equal(output.advanced, false);
  assert.equal(output.committedTimelineIndex, 0);
});

test("resincroniza cuando la continuacion diferencia una repeticion", () => {
  const follower = makeFollower("Am   F   G   C   F   E\nAm   F   G   C   D   A");

  play(follower, "Am", { startMs: 0 });
  play(follower, "B", { startMs: 700 });
  play(follower, "B", { startMs: 1100 });
  play(follower, "G", { startMs: 1600 });
  play(follower, "C", { startMs: 2200 });
  const output = playUntilAdvanced(follower, "D", { startMs: 2800, frames: 3 });

  assert.equal(output.advanced, true);
  assert.equal(output.sequenceAmbiguous, false);
  assert.equal(output.committedTimelineIndex, 10);
  assert.equal(output.currentEvent.chord, "D");
});

test("resincroniza despues de una secuencia coherente hacia adelante", () => {
  const follower = makeFollower("C   G   Am   F   D   A   Bm   G");

  play(follower, "C", { startMs: 0 });
  play(follower, "E", { startMs: 700 });
  play(follower, "E", { startMs: 1100 });
  assert.equal(follower.currentMode, "reacquiring");

  play(follower, "D", { startMs: 1600 });
  const output = playUntilAdvanced(follower, "A", { startMs: 2200, frames: 3 });

  assert.equal(output.advanced, true);
  assert.equal(output.committedTimelineIndex, 5);
  assert.equal(output.currentEvent.chord, "A");
  assert.equal(output.mode, "locked");
});

test("nunca retrocede aunque escuche un acorde anterior", () => {
  const follower = makeFollower("C   G   Am   F");

  play(follower, "C", { startMs: 0 });
  play(follower, "G", { startMs: 700 });
  const output = play(follower, "C", { startMs: 1400 });

  assert.equal(output.advanced, false);
  assert.equal(output.committedTimelineIndex, 1);
});

test("repetidos requieren separacion antes de avanzar", () => {
  const follower = makeFollower("B   B   E   E");

  play(follower, "B", { startMs: 0 });
  const sustained = play(follower, "B", { startMs: 500 });
  assert.equal(sustained.committedTimelineIndex, 0);

  separate(follower, 1000);
  const repeated = play(follower, "B", { startMs: 1200 });
  assert.equal(repeated.committedTimelineIndex, 1);
});

test("highlight no deberia saltar mientras el follower esta dudando", () => {
  const follower = makeFollower("Am   F   G   C   F   E\nAm   F   G   C   F   E");

  play(follower, "Am", { startMs: 0 });
  play(follower, "B", { startMs: 700 });
  play(follower, "B", { startMs: 1100 });
  const output = play(follower, "G", { startMs: 1600 });

  assert.equal(output.advanced, false);
  assert.equal(output.previousCommittedTimelineIndex, output.committedTimelineIndex);
});

test("pausa explicita evita enganchar un B posterior y favorece C#m siguiente", () => {
  const follower = makeFollower(`B      ( silencio )
Sigo aquí esperando por ti

C # m        A        E
Yo quiero ir a algun lugar

B        C # m        A`);

  play(follower, "B", { startMs: 0 });
  assert.equal(follower.currentIndex, 0);

  separate(follower, 700);
  const csharp = play(follower, "C#m", { startMs: 1000 });
  assert.equal(csharp.advanced, true);
  assert.equal(csharp.committedTimelineIndex, 1);
  assert.equal(csharp.currentEvent.normalizedChord, "C#m");

  assert.equal(play(follower, "A", { startMs: 1700 }).committedTimelineIndex, 2);
  assert.equal(play(follower, "E", { startMs: 2400 }).committedTimelineIndex, 3);
});

test("un B aislado despues de una pausa no salta al B posterior lejano", () => {
  const follower = makeFollower(`B      ( silencio )
Sigo aquí esperando por ti

C # m        A        E

B        C # m        A`);

  play(follower, "B", { startMs: 0 });
  separate(follower, 700);
  const repeatedB = play(follower, "B", { startMs: 1000 });

  assert.equal(repeatedB.advanced, false);
  assert.equal(repeatedB.committedTimelineIndex, 0);
  assert.equal(repeatedB.currentEvent.normalizedChord, "B");
});

test("mismo acorde antes y despues de pausa puede avanzar si es el siguiente evento", () => {
  const follower = makeFollower(`B
(silencio)
B        E`);

  play(follower, "B", { startMs: 0 });
  separate(follower, 700);
  const nextB = play(follower, "B", { startMs: 1000 });

  assert.equal(nextB.advanced, true);
  assert.equal(nextB.committedTimelineIndex, 1);
});

test("lineas de letra normales no limitan el lookahead como pausa", () => {
  const follower = makeFollower(`B
Sigo aquí esperando por ti
otra linea sin marcador
C # m        A`);

  play(follower, "B", { startMs: 0 });
  const csharp = play(follower, "C#m", { startMs: 700 });

  assert.equal(csharp.advanced, true);
  assert.equal(csharp.committedTimelineIndex, 1);
});

test("recommit dudoso no cambia committedTimelineIndex aunque haya hipotesis futura fuerte", () => {
  const follower = makeFollower("Am F G G7 C F E\nAm A7 F G G7 C F E\nG Am G Am G Am");

  play(follower, "Am", { startMs: 0 });
  play(follower, "F", { startMs: 500 });
  play(follower, "G", { startMs: 1000 });
  play(follower, "C", { startMs: 1500 });
  play(follower, "F", { startMs: 2000 });
  play(follower, "E", { startMs: 2500 });
  assert.equal(follower.currentIndex, 6);

  play(follower, "B", { startMs: 3000 });
  play(follower, "B", { startMs: 3500 });
  play(follower, "G", { startMs: 4000, frames: 3 });
  const ambiguous = play(follower, "Am", { startMs: 4500, frames: 3 });

  assert.equal(ambiguous.mode, "reacquiring");
  assert.ok(ambiguous.scoreMargin < 0.25);
  assert.equal(ambiguous.advanced, false);
  assert.equal(ambiguous.committedTimelineIndex, 6);
});

test("un unico update no puede hacer recommit grande despues de ambiguedad", () => {
  const follower = makeFollower("Am F G G7 C F E\nAm A7 F G G7 C F E\nG Am G Am G Am");

  play(follower, "Am", { startMs: 0 });
  play(follower, "F", { startMs: 500 });
  play(follower, "G", { startMs: 1000 });
  play(follower, "C", { startMs: 1500 });
  play(follower, "F", { startMs: 2000 });
  play(follower, "E", { startMs: 2500 });
  play(follower, "B", { startMs: 3000 });
  play(follower, "B", { startMs: 3500 });

  play(follower, "G", { startMs: 4000, frames: 3 });
  play(follower, "Am", { startMs: 4500, frames: 3 });
  const singleUpdate = play(follower, "G", { startMs: 5000, frames: 2 });

  assert.equal(singleUpdate.advanced, false);
  assert.equal(singleUpdate.committedTimelineIndex, 6);
  assert.ok((singleUpdate.bestHypothesisIndex ?? 0) - singleUpdate.committedTimelineIndex >= 10);
});

test("recommit grande requiere hipotesis estable y secuencia no ambigua", () => {
  const follower = makeFollower("C D Em F G Am Bm C\nE A Bm G");

  play(follower, "C", { startMs: 0 });
  assert.equal(follower.currentIndex, 0);

  play(follower, "B", { startMs: 500 });
  play(follower, "B", { startMs: 900 });
  assert.equal(follower.currentMode, "reacquiring");

  play(follower, "E", { startMs: 1400, frames: 3 });
  play(follower, "A", { startMs: 2000, frames: 3 });
  const pending = play(follower, "Bm", { startMs: 2600, frames: 2 });

  assert.equal(pending.advanced, false);
  assert.equal(pending.committedTimelineIndex, 0);

  const committed = playUntilAdvanced(follower, "Bm", { startMs: 3000, frames: 3 });
  assert.equal(committed.advanced, true);
  assert.equal(committed.committedTimelineIndex, 10);
  assert.equal(committed.mode, "locked");
});
