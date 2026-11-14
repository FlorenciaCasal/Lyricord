import assert from "node:assert/strict";
import test from "node:test";
import { ChordPositionFollower } from "../mobile/src/music/chordPositionFollower.ts";
import { deriveChordTimeline } from "../mobile/src/music/chordTimeline.ts";
import {
  createManualRepositionSession,
  getVisibleTimelineRange,
  isDeliberateManualScroll,
  processManualRepositionEvidence,
} from "../mobile/src/music/manualReposition.ts";

test("micro-scroll accidental no inicia reposicionamiento manual", () => {
  assert.equal(isDeliberateManualScroll({ startY: 100, endY: 125, durationMs: 400 }), false);
  assert.equal(isDeliberateManualScroll({ startY: 100, endY: 220, durationMs: 30 }), false);
  assert.equal(isDeliberateManualScroll({ startY: 100, endY: 220, durationMs: 200 }), true);
});

test("rango visible deriva eventos visibles mas margen local", () => {
  const timeline = deriveChordTimeline([
    "C#m A E",
    "letra",
    "B C#m A",
    "letra",
    "E B C#m",
  ].join("\n"));
  const lineY = new Map([
    [0, 0],
    [2, 300],
    [4, 600],
  ]);

  const range = getVisibleTimelineRange({
    timeline,
    lineYByLineIndex: lineY,
    currentScrollY: 260,
    viewportHeight: 260,
    topPaddingPx: 0,
    bottomPaddingPx: 0,
    marginEvents: 1,
  });

  assert.ok(range);
  assert.deepEqual(range.visibleTimelineIndexes, [3, 4, 5]);
  assert.deepEqual(range.candidateTimelineIndexes, [2, 3, 4, 5, 6]);
});

test("reposicionamiento manual confirma solo con evidencia estable dentro del rango visible", () => {
  const timeline = deriveChordTimeline("G Am C D\nEm F G C");
  const range = {
    visibleStartLine: 1,
    visibleEndLine: 1,
    candidateStartIndex: 4,
    candidateEndIndex: 7,
    visibleTimelineIndexes: [4, 5, 6, 7],
    candidateTimelineIndexes: [4, 5, 6, 7],
  };
  const session = createManualRepositionSession({ ...range, nowMs: 0 });

  let result = processManualRepositionEvidence(session, timeline, { candidate: "F", confidence: 0.9, nowMs: 100 }, { stableFrames: 3 });
  assert.equal(result.committed, false);
  assert.equal(result.reason, "waiting-stability");

  result = processManualRepositionEvidence(session, timeline, { candidate: "F", confidence: 0.9, nowMs: 250 }, { stableFrames: 3 });
  assert.equal(result.committed, false);

  result = processManualRepositionEvidence(session, timeline, { candidate: "F", confidence: 0.9, nowMs: 400 }, { stableFrames: 3 });
  assert.equal(result.committed, true);
  assert.equal(result.timelineIndex, 5);
});

test("reposicionamiento manual no inventa posicion si el audio no coincide con la zona visible", () => {
  const timeline = deriveChordTimeline("G Am C D\nEm F G C");
  const session = createManualRepositionSession({
    visibleStartLine: 1,
    visibleEndLine: 1,
    candidateStartIndex: 4,
    candidateEndIndex: 7,
    visibleTimelineIndexes: [4, 5, 6, 7],
    candidateTimelineIndexes: [4, 5, 6, 7],
    nowMs: 0,
  });

  const result = processManualRepositionEvidence(session, timeline, { candidate: "Bm", confidence: 0.95, nowMs: 100 });
  assert.equal(result.committed, false);
  assert.equal(result.timelineIndex, null);
  assert.equal(result.reason, "outside-range");
});

test("resetToIndex permite volver atras solo por reposicionamiento explicito", () => {
  const timeline = deriveChordTimeline("G Am C D\nEm F G C");
  const follower = new ChordPositionFollower(timeline, { stableFrames: 1, minConfidence: 0.5 });
  follower.resetToIndex(5);
  assert.equal(follower.currentIndex, 5);
  assert.equal(follower.currentEvent.normalizedChord, "F");

  follower.resetToIndex(0);
  assert.equal(follower.currentIndex, 0);
  assert.equal(follower.currentEvent.normalizedChord, "G");
});
