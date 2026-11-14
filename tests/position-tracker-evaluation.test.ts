import assert from "node:assert/strict";
import test from "node:test";
import type { AudioEvidenceFrame } from "../mobile/src/music/audioEvidence.ts";
import type { ChordCandidate, SupportedChord } from "../mobile/src/music/chordDetection.ts";
import { deriveChordTimeline } from "../mobile/src/music/chordTimeline.ts";
import {
  deriveExpectedMusicSequence,
  parseExpectedMusicSequence,
  serializeExpectedMusicSequence,
} from "../mobile/src/music/expectedMusic.ts";
import {
  detectMusicalTransitionEvidence,
  type MusicalTransitionEvidence,
} from "../mobile/src/music/onlineChordAligner.ts";
import {
  createOnlineChordAlignerTracker,
  createExpectedSequenceAndOldFollowerTracker,
  evaluatePositionTracker,
  evaluateVisualPolicy,
  type EvaluationEvidenceRecording,
} from "../mobile/src/music/positionTrackerEvaluation.ts";

type PlayedStep = {
  timelineIndex: number | null;
  candidate?: ChordCandidate;
  frames?: number;
  confidence?: number;
  silenceBefore?: boolean;
  attack?: "weak" | "strong";
  secondCandidate?: SupportedChord;
  secondConfidence?: number;
};

const FRAME_MS = 150;
const DEFAULT_FRAMES_PER_STEP = 3;

function makeEvidenceFrame(input: {
  timestamp: number;
  candidate: ChordCandidate;
  confidence?: number;
  rms?: number;
  secondCandidate?: SupportedChord;
  secondConfidence?: number;
  groundTruthTimelineIndex?: number | null;
  previous?: AudioEvidenceFrame | null;
}): AudioEvidenceFrame & { groundTruthTimelineIndex?: number } {
  const confidence = input.candidate === "unknown" ? 0 : input.confidence ?? 0.9;
  const score = input.candidate === "unknown" ? 0 : confidence;
  const secondConfidence = input.secondCandidate ? input.secondConfidence ?? Math.max(0, confidence - 0.18) : 0;
  const secondScore = input.candidate === "unknown" ? 0 : Math.max(secondConfidence, confidence - 0.35);
  const previous = input.previous ?? null;
  const rms = input.rms ?? (input.candidate === "unknown" ? 0.001 : 0.08);

  return {
    timestamp: input.timestamp,
    sampleRate: 44100,
    windowSize: 4096,
    chroma: Array.from({ length: 12 }, () => 1 / 12),
    rms,
    scores: input.candidate === "unknown"
      ? {}
      : {
        [input.candidate]: score,
        ...(input.secondCandidate ? { [input.secondCandidate]: secondConfidence } : {}),
      } as Partial<Record<SupportedChord, number>>,
    topCandidates: input.candidate === "unknown"
      ? []
      : [
        { chord: input.candidate, score, confidence: 1 },
        ...(input.secondCandidate ? [{
          chord: input.secondCandidate,
          score: secondConfidence,
          confidence: secondConfidence,
        }] : []),
      ],
    candidate: input.candidate,
    confidence,
    bestScore: score,
    secondScore,
    scoreMargin: Math.max(0, score - secondScore),
    deltaMs: previous ? input.timestamp - previous.timestamp : null,
    rmsDelta: previous ? rms - previous.rms : null,
    energyRise: previous ? Math.max(0, rms - previous.rms) : 0,
    onsetStrength: previous
      ? Math.max(
        previous.candidate !== input.candidate ? 0.78 : 0,
        Math.min(1, Math.max(0, rms - previous.rms) / 0.045 * 0.72),
      )
      : input.candidate === "unknown" ? 0 : 0.92,
    chromaDelta: previous && previous.candidate !== input.candidate ? 0.18 : 0,
    chromaDeltaVector: Array.from({ length: 12 }, () => 0),
    spectralFlux: previous && previous.candidate !== input.candidate ? 0.45 : 0,
    observedEventDurationMs:
      previous && previous.candidate === input.candidate && input.candidate !== "unknown"
        ? previous.observedEventDurationMs + (input.timestamp - previous.timestamp)
        : 0,
    candidateChanged: previous ? previous.candidate !== input.candidate : input.candidate !== "unknown",
    repeatedCandidateFrames:
      previous && previous.candidate === input.candidate && input.candidate !== "unknown"
        ? previous.repeatedCandidateFrames + 1
        : input.candidate === "unknown"
          ? 0
          : 1,
    ...(typeof input.groundTruthTimelineIndex === "number"
      ? { groundTruthTimelineIndex: input.groundTruthTimelineIndex }
      : {}),
  };
}

function recordingFromSteps(steps: readonly PlayedStep[]): EvaluationEvidenceRecording {
  const frames: Array<AudioEvidenceFrame & { groundTruthTimelineIndex?: number }> = [];
  let timestamp = 0;
  let previous: AudioEvidenceFrame | null = null;

  for (const step of steps) {
    if (step.silenceBefore) {
      const silent = makeEvidenceFrame({
        timestamp,
        candidate: "unknown",
        groundTruthTimelineIndex: step.timelineIndex,
        previous,
      });
      frames.push(silent);
      previous = silent;
      timestamp += FRAME_MS;
    }

    const candidate = step.candidate ?? null;
    const frameCount = step.frames ?? DEFAULT_FRAMES_PER_STEP;
    for (let index = 0; index < frameCount; index += 1) {
      const attackRms = step.attack === "strong" ? 0.13 : step.attack === "weak" ? 0.095 : 0.08;
      const frame = makeEvidenceFrame({
        timestamp,
        candidate: candidate ?? "unknown",
        confidence: step.confidence,
        rms: index === 0 ? attackRms : 0.08,
        secondCandidate: step.secondCandidate,
        secondConfidence: step.secondConfidence,
        groundTruthTimelineIndex: step.timelineIndex,
        previous,
      });
      frames.push(frame);
      previous = frame;
      timestamp += FRAME_MS;
    }
  }

  return {
    version: 1,
    frames,
    metadata: { notes: "synthetic evidence fixture" },
  };
}

function onlyTruthFrames(result: ReturnType<typeof evaluatePositionTracker>) {
  return result.frames.filter((frame) => frame.groundTruthTimelineIndex !== null);
}

function stepsForAllEvents(chords: readonly string[]) {
  return chords.map((candidate, timelineIndex) => ({ timelineIndex, candidate }));
}

function evaluateFixture(name: string, content: string, steps: readonly PlayedStep[]) {
  const timeline = deriveChordTimeline(content);
  const { expected, tracker } = createExpectedSequenceAndOldFollowerTracker(timeline);
  return {
    name,
    result: evaluatePositionTracker({
      expected,
      evidence: recordingFromSteps(steps),
      tracker,
    }),
  };
}

function compareFixture(content: string, steps: readonly PlayedStep[]) {
  const timeline = deriveChordTimeline(content);
  const { expected, tracker: oldTracker } = createExpectedSequenceAndOldFollowerTracker(timeline);
  const evidence = recordingFromSteps(steps);
  const oldResult = evaluatePositionTracker({ expected, evidence, tracker: oldTracker });
  const newResult = evaluatePositionTracker({ expected, evidence, tracker: createOnlineChordAlignerTracker() });
  return { oldResult, newResult };
}

const temporalAlignerVariants = {
  current: {},
  onsetOnly: {
    useOnsetFeatures: true,
  },
  durationOnly: {
    useDurationFeatures: true,
  },
  chromaFluxOnly: {
    useChromaFluxFeatures: true,
  },
  fullTemporal: {
    useOnsetFeatures: true,
    useDurationFeatures: true,
    useChromaFluxFeatures: true,
    useMultiFrameStability: true,
  },
} as const;

function evaluateOnlineVariant(content: string, steps: readonly PlayedStep[], variant: keyof typeof temporalAlignerVariants) {
  const expected = deriveExpectedMusicSequence(content);
  return evaluatePositionTracker({
    expected,
    evidence: recordingFromSteps(steps),
    tracker: createOnlineChordAlignerTracker(temporalAlignerVariants[variant]),
  });
}

function visualSummary(result: ReturnType<typeof evaluatePositionTracker>) {
  return evaluateVisualPolicy(result).metrics;
}

function compactTrace(result: ReturnType<typeof evaluatePositionTracker>) {
  return result.frames
    .filter((frame, index) => frame.advanced || index % DEFAULT_FRAMES_PER_STEP === 0)
    .map((frame) => ({
      timestamp: frame.timestamp,
      groundTruthIndex: frame.groundTruthTimelineIndex,
      estimatedIndex: frame.estimatedTimelineIndex,
      committedIndex: frame.committedTimelineIndex,
      regime: frame.trackingRegime,
      localPlausibility: frame.localPlausibility === null ? null : Number(frame.localPlausibility.toFixed(3)),
      evidenceAgainstLocal: frame.evidenceAgainstLocal,
      relocalizationReason: frame.relocalizationReason,
      transitionEvidence: summarizeTransition(frame.transitionEvidence),
      mode: frame.state,
      topPositions: frame.topPositions.slice(0, 3)
        .map((position) =>
          `${position.timelineIndex} p=${position.probability.toFixed(2)} seq=${position.sequenceScore.toFixed(2)} trans=${position.transitionScore.toFixed(2)} cont=${position.continuityScore.toFixed(2)} total=${position.totalScore.toFixed(2)}`
        )
        .join(" | "),
    }));
}

function summarizeTransition(evidence: MusicalTransitionEvidence | null) {
  if (!evidence) return null;
  return {
    kind: evidence.kind,
    strength: Number(evidence.strength.toFixed(3)),
    supportsNewEvent: evidence.supportsNewEvent,
  };
}

const fixtures = [
  {
    name: "A perfect execution",
    content: "C G Am F",
    steps: stepsForAllEvents(["C", "G", "Am", "F"]),
  },
  {
    name: "B omit one chord",
    content: "Am A7 F G",
    steps: [
      { timelineIndex: 0, candidate: "Am" },
      { timelineIndex: 2, candidate: "F" },
      { timelineIndex: 3, candidate: "G" },
    ],
  },
  {
    name: "C omit two chords",
    content: "Am A7 D7 F G",
    steps: [
      { timelineIndex: 0, candidate: "Am" },
      { timelineIndex: 3, candidate: "F", confidence: 0.96 },
      { timelineIndex: 4, candidate: "G" },
    ],
  },
  {
    name: "D wrong chord then recover",
    content: "C G Am F",
    steps: [
      { timelineIndex: 0, candidate: "C" },
      { timelineIndex: 1, candidate: "B" },
      { timelineIndex: 1, candidate: "G" },
      { timelineIndex: 2, candidate: "Am" },
      { timelineIndex: 3, candidate: "F" },
    ],
  },
  {
    name: "E late entry",
    content: "C G Am F D A",
    steps: [
      { timelineIndex: 3, candidate: "F" },
      { timelineIndex: 4, candidate: "D" },
      { timelineIndex: 5, candidate: "A" },
    ],
  },
  {
    name: "F repeated progression",
    content: "Am F G C F E\nAm F G C F E",
    steps: stepsForAllEvents(["Am", "F", "G", "C", "F", "E", "Am", "F", "G", "C", "F", "E"]),
  },
  {
    name: "G two equal verses",
    content: "A A E E B C#m A A E E\nA A E E B C#m A A E E",
    steps: stepsForAllEvents(["A", "A", "E", "E", "B", "C#m", "A", "A", "E", "E", "A", "A", "E", "E", "B", "C#m", "A", "A", "E", "E"]),
  },
  {
    name: "H silence boundary",
    content: "B (silencio)\nC # m A E\nB C # m A",
    steps: [
      { timelineIndex: 0, candidate: "B" },
      { timelineIndex: 1, candidate: "C#m", silenceBefore: true },
      { timelineIndex: 2, candidate: "A" },
      { timelineIndex: 3, candidate: "E" },
      { timelineIndex: 4, candidate: "B" },
    ],
  },
  {
    name: "I repeated same chord",
    content: "B B E E",
    steps: [
      { timelineIndex: 0, candidate: "B" },
      { timelineIndex: 1, candidate: "B", silenceBefore: true },
      { timelineIndex: 2, candidate: "E" },
      { timelineIndex: 3, candidate: "E", silenceBefore: true },
    ],
  },
  {
    name: "J slower tempo",
    content: "C G Am F",
    steps: stepsForAllEvents(["C", "G", "Am", "F"]).map((step) => ({ ...step, frames: 6 })),
  },
  {
    name: "K faster tempo",
    content: "C G Am F",
    steps: stepsForAllEvents(["C", "G", "Am", "F"]).map((step) => ({ ...step, frames: 2 })),
  },
  {
    name: "Regression Me quedo contigo jump 6 to 19",
    content: "Am F G G7 C F E\nAm A7 F G G7 C F E\nG Am G Am G Am",
    steps: [
      { timelineIndex: 0, candidate: "Am" },
      { timelineIndex: 1, candidate: "F" },
      { timelineIndex: 2, candidate: "G" },
      { timelineIndex: 4, candidate: "C" },
      { timelineIndex: 5, candidate: "F" },
      { timelineIndex: 6, candidate: "E" },
      { timelineIndex: 17, candidate: "G" },
      { timelineIndex: 18, candidate: "Am" },
      { timelineIndex: 19, candidate: "G" },
      { timelineIndex: 20, candidate: "Am" },
    ],
  },
  {
    name: "Regression Cae el sol ambiguous long verse",
    content: "C#m A E E B C#m A A E E\nB C#m A E\nA A E E B C#m A A E E\nA A E E B C#m A A E E",
    steps: [
      ...stepsForAllEvents(["C#m", "A", "E", "E", "B", "C#m", "A", "A", "E", "E"]),
      { timelineIndex: 20, candidate: "A" },
      { timelineIndex: 21, candidate: "A" },
      { timelineIndex: 22, candidate: "E" },
      { timelineIndex: 23, candidate: "E" },
      { timelineIndex: 24, candidate: "B" },
      { timelineIndex: 25, candidate: "C#m" },
      { timelineIndex: 26, candidate: "A" },
      { timelineIndex: 27, candidate: "A" },
      { timelineIndex: 28, candidate: "E" },
      { timelineIndex: 29, candidate: "E" },
    ],
  },
] as const;

test("ExpectedMusicSequence conserva orden, repetidos y source ranges", () => {
  const sequence = deriveExpectedMusicSequence("G   Am   G   Am\ntexto");

  assert.deepEqual(sequence.events.map((event) => event.normalizedChord), ["G", "Am", "G", "Am"]);
  assert.deepEqual(sequence.events.map((event) => event.timelineIndex), [0, 1, 2, 3]);
  assert.equal(sequence.events[0].lineIndex, 0);
  assert.ok(sequence.events[0].charStart < sequence.events[1].charStart);

  const restored = parseExpectedMusicSequence(serializeExpectedMusicSequence(sequence));
  assert.deepEqual(restored, sequence);
});

test("evaluatePositionTracker calcula métricas deterministas con el follower actual", () => {
  const { result } = evaluateFixture("perfect", "C G Am F", stepsForAllEvents(["C", "G", "Am", "F"]));

  assert.equal(result.trackerName, "chordPositionFollower");
  assert.equal(result.metrics.totalFrames, 12);
  assert.equal(result.metrics.framesWithGroundTruth, 12);
  assert.ok(result.metrics.correctFrameRatio > 0);
  assert.equal(result.metrics.backwardsCommits, 0);
});

test("baseline del follower actual corre todos los fixtures sintéticos y regresiones", () => {
  const summary = fixtures.map((fixture) => {
    const { result } = evaluateFixture(fixture.name, fixture.content, fixture.steps);
    return {
      name: fixture.name,
      correctFrameRatio: Number(result.metrics.correctFrameRatio.toFixed(3)),
      meanAbsoluteEventError: result.metrics.meanAbsoluteEventError === null
        ? null
        : Number(result.metrics.meanAbsoluteEventError.toFixed(3)),
      maxDistanceFromGroundTruth: result.metrics.maxDistanceFromGroundTruth,
      incorrectCommits: result.metrics.incorrectCommits,
      prolongedFreezeCount: result.metrics.prolongedFreezeCount,
      timeInLostOrUncertainMs: result.metrics.timeInLostOrUncertainMs,
    };
  });

  assert.equal(summary.length, 13);
  assert.ok(summary.every((item) => item.maxDistanceFromGroundTruth !== null));

  if (process.env.PRINT_TRACKER_BASELINE === "1") {
    console.table(summary);
  }
});

test("onlineChordAligner supera la baseline del follower actual en la mayoria clara de fixtures", () => {
  const comparison = fixtures.map((fixture) => {
    const { oldResult, newResult } = compareFixture(fixture.content, fixture.steps);
    return {
      name: fixture.name,
      oldCorrect: oldResult.metrics.correctFrameRatio,
      newCorrect: newResult.metrics.correctFrameRatio,
      oldMeanError: oldResult.metrics.meanAbsoluteEventError ?? Number.POSITIVE_INFINITY,
      newMeanError: newResult.metrics.meanAbsoluteEventError ?? Number.POSITIVE_INFINITY,
      oldMaxDistance: oldResult.metrics.maxDistanceFromGroundTruth ?? Number.POSITIVE_INFINITY,
      newMaxDistance: newResult.metrics.maxDistanceFromGroundTruth ?? Number.POSITIVE_INFINITY,
      oldIncorrectCommits: oldResult.metrics.incorrectCommits,
      newIncorrectCommits: newResult.metrics.incorrectCommits,
      oldFreeze: oldResult.metrics.prolongedFreezeCount,
      newFreeze: newResult.metrics.prolongedFreezeCount,
      oldAvgStates: oldResult.metrics.averageEvaluatedStatesPerFrame,
      newAvgStates: newResult.metrics.averageEvaluatedStatesPerFrame,
      oldMaxStates: oldResult.metrics.maxEvaluatedStatesPerFrame,
      newMaxStates: newResult.metrics.maxEvaluatedStatesPerFrame,
      visual: visualSummary(newResult),
    };
  });

  const improvedCorrect = comparison.filter((item) => item.newCorrect > item.oldCorrect).length;
  const improvedMeanError = comparison.filter((item) => item.newMeanError < item.oldMeanError).length;
  const improvedMaxDistance = comparison.filter((item) => item.newMaxDistance <= item.oldMaxDistance).length;
  const noBackwards = fixtures.every((fixture) => {
    const { newResult } = compareFixture(fixture.content, fixture.steps);
    return newResult.metrics.backwardsCommits === 0;
  });

  assert.ok(improvedCorrect >= 8, `fixtures con correctFrameRatio mejorado: ${improvedCorrect}`);
  assert.ok(improvedMeanError >= 8, `fixtures con meanAbsoluteEventError mejorado: ${improvedMeanError}`);
  assert.ok(improvedMaxDistance >= 10, `fixtures sin empeorar max distance: ${improvedMaxDistance}`);
  assert.equal(noBackwards, true);

  if (process.env.PRINT_TRACKER_COMPARISON === "1") {
    console.table(comparison.map((item) => ({
      name: item.name,
      oldCorrect: Number(item.oldCorrect.toFixed(3)),
      newCorrect: Number(item.newCorrect.toFixed(3)),
      oldMeanError: Number(item.oldMeanError.toFixed(3)),
      newMeanError: Number(item.newMeanError.toFixed(3)),
      oldMaxDistance: item.oldMaxDistance,
      newMaxDistance: item.newMaxDistance,
      oldIncorrectCommits: item.oldIncorrectCommits,
      newIncorrectCommits: item.newIncorrectCommits,
      oldFreeze: item.oldFreeze,
      newFreeze: item.newFreeze,
      falseLargeJumps: item.visual.falseLargeJumpCount,
      maxDisplayJump: item.visual.maxDisplayedJumpDistance,
      maxFreezeMs: item.visual.maxDisplayedFreezeDurationMs,
      meanLag: item.visual.meanDisplayedLagEvents === null ? null : Number(item.visual.meanDisplayedLagEvents.toFixed(2)),
      maxLag: item.visual.maxDisplayedLagEvents,
      wrongMs: item.visual.wrongHighlightDurationMs,
      catchUps: item.visual.catchUpSteps,
      severity: item.visual.severity,
      newAvgStates: Number(item.newAvgStates.toFixed(1)),
      newMaxStates: item.newMaxStates,
    })));
  }

  if (process.env.PRINT_TRACKER_TRACE === "1") {
    for (const fixture of fixtures.filter((item) =>
      item.name.includes("two equal") ||
      item.name.includes("repeated same") ||
      item.name.includes("Me quedo") ||
      item.name.includes("Cae el sol")
    )) {
      const { newResult } = compareFixture(fixture.content, fixture.steps);
      console.log(fixture.name);
      console.table(compactTrace(newResult));
    }
  }
});

test("evaluateVisualPolicy separa estimated committed y displayed sin retroceder", () => {
  const { newResult } = compareFixture("C G Am F", stepsForAllEvents(["C", "G", "Am", "F"]));
  const visual = evaluateVisualPolicy(newResult);

  assert.equal(visual.metrics.backwardsDisplayedMoves, 0);
  assert.ok(visual.frames.every((frame) => frame.displayedTimelineIndex <= Math.max(
    frame.committedTimelineIndex,
    frame.estimatedTimelineIndex ?? frame.committedTimelineIndex,
  )));
  assert.ok(visual.frames.some((frame) => frame.displayedTimelineIndex !== null));
});

test("evaluateVisualPolicy evita saltos visuales grandes y usa catch-up progresivo", () => {
  const { newResult } = compareFixture("C G Am F D A E B", [
    { timelineIndex: 0, candidate: "C" },
    { timelineIndex: 1, candidate: "G" },
    { timelineIndex: 6, candidate: "E" },
    { timelineIndex: 7, candidate: "B" },
  ]);
  const visual = evaluateVisualPolicy(newResult, {
    maxImmediateDisplayAdvance: 1,
    maxCatchUpAdvance: 1,
  });

  assert.equal(visual.metrics.backwardsDisplayedMoves, 0);
  assert.ok(visual.metrics.maxDisplayedJumpDistance <= 1);
});

test("evaluateVisualPolicy mide freeze y lag visual en regresiones reales", () => {
  const cae = fixtures.find((fixture) => fixture.name.includes("Cae el sol"));
  assert.ok(cae);
  const { newResult } = compareFixture(cae.content, cae.steps);
  const visual = evaluateVisualPolicy(newResult);

  assert.ok(visual.metrics.wrongHighlightDurationMs > 0);
  assert.ok(visual.metrics.maxDisplayedLagEvents > 0);
  assert.notEqual(visual.metrics.severity, "acceptable");
});

test("detectMusicalTransitionEvidence distingue sustain de nuevo evento aproximado", () => {
  const first = makeEvidenceFrame({
    timestamp: 0,
    candidate: "E",
    groundTruthTimelineIndex: 0,
    previous: null,
  });
  const sustain = makeEvidenceFrame({
    timestamp: 150,
    candidate: "E",
    groundTruthTimelineIndex: 0,
    previous: first,
  });
  const silence = makeEvidenceFrame({
    timestamp: 300,
    candidate: "unknown",
    groundTruthTimelineIndex: 1,
    previous: sustain,
  });
  const repeatedAttack = makeEvidenceFrame({
    timestamp: 450,
    candidate: "E",
    groundTruthTimelineIndex: 1,
    previous: silence,
  });
  const changed = makeEvidenceFrame({
    timestamp: 600,
    candidate: "A",
    groundTruthTimelineIndex: 2,
    previous: repeatedAttack,
  });

  assert.equal(detectMusicalTransitionEvidence(sustain, first).supportsNewEvent, false);
  assert.equal(detectMusicalTransitionEvidence(repeatedAttack, silence).supportsNewEvent, true);
  assert.equal(detectMusicalTransitionEvidence(changed, repeatedAttack).kind, "harmonic-change");
});

test("onlineChordAligner mejora los casos debiles sin sacrificar los casos fuertes", () => {
  const byName = new Map(fixtures.map((fixture) => [fixture.name, compareFixture(fixture.content, fixture.steps)]));

  assert.equal(byName.get("A perfect execution")?.newResult.metrics.correctFrameRatio, 1);
  assert.equal(byName.get("B omit one chord")?.newResult.metrics.correctFrameRatio, 1);
  assert.ok((byName.get("C omit two chords")?.newResult.metrics.correctFrameRatio ?? 0) >= 0.65);
  assert.equal(byName.get("E late entry")?.newResult.metrics.correctFrameRatio, 1);

  assert.ok((byName.get("I repeated same chord")?.newResult.metrics.correctFrameRatio ?? 0) >= 0.8);
  assert.ok((byName.get("G two equal verses")?.newResult.metrics.correctFrameRatio ?? 0) >= 0.55);
  assert.ok((byName.get("Regression Me quedo contigo jump 6 to 19")?.newResult.metrics.correctFrameRatio ?? 0) >= 0.55);
  assert.ok((byName.get("Regression Cae el sol ambiguous long verse")?.newResult.metrics.correctFrameRatio ?? 0) >= 0.3);
});

test("onlineChordAligner temporal expone ablation de onset duracion y chroma flux sin degradar invariantes", () => {
  const rows = fixtures.flatMap((fixture) =>
    (Object.keys(temporalAlignerVariants) as Array<keyof typeof temporalAlignerVariants>).map((variant) => {
      const result = evaluateOnlineVariant(fixture.content, fixture.steps, variant);
      const visual = evaluateVisualPolicy(result);
      return {
        fixture: fixture.name,
        variant,
        correct: result.metrics.correctFrameRatio,
        meanError: result.metrics.meanAbsoluteEventError ?? Number.POSITIVE_INFINITY,
        missed: result.metrics.missedExpectedEvents,
        incorrectCommits: result.metrics.incorrectCommits,
        maxJump: result.metrics.maxIncorrectJumpDistance,
        freezes: result.metrics.prolongedFreezeCount,
        wrongMs: visual.metrics.wrongHighlightDurationMs,
        maxLag: visual.metrics.maxDisplayedLagEvents,
        falseLargeJumps: visual.metrics.falseLargeJumpCount,
      };
    })
  );

  const byFixtureVariant = new Map(rows.map((row) => [`${row.fixture}:${row.variant}`, row]));
  const simpleFixtures = ["A perfect execution", "B omit one chord", "E late entry", "J slower tempo", "K faster tempo"];
  for (const fixtureName of simpleFixtures) {
    const full = byFixtureVariant.get(`${fixtureName}:fullTemporal`);
    assert.ok(full, fixtureName);
    assert.equal(full.falseLargeJumps, 0, fixtureName);
    assert.equal(full.maxJump, 0, fixtureName);
    assert.ok(full.correct >= 0.9, fixtureName);
  }

  if (process.env.PRINT_TEMPORAL_ABLATION === "1") {
    console.table(rows.map((row) => ({
      fixture: row.fixture,
      variant: row.variant,
      correct: Number(row.correct.toFixed(3)),
      meanError: Number(row.meanError.toFixed(3)),
      missed: row.missed,
      incorrectCommits: row.incorrectCommits,
      maxJump: row.maxJump,
      freezes: row.freezes,
      wrongMs: row.wrongMs,
      maxLag: row.maxLag,
      falseLargeJumps: row.falseLargeJumps,
    })));
  }

  const fullRows = rows.filter((row) => row.variant === "fullTemporal");
  assert.ok(fullRows.every((row) => row.falseLargeJumps === 0));
  assert.ok(fullRows.every((row) => row.maxJump <= Math.max(13, byFixtureVariant.get(`${row.fixture}:current`)?.maxJump ?? 0)));
});

test("onlineChordAligner tolera evidencia mas realista con ruido, sustain y ataques variables", () => {
  const { newResult } = compareFixture("Am F G C F E", [
    { timelineIndex: 0, candidate: "Am", confidence: 0.78, secondCandidate: "C", secondConfidence: 0.58, attack: "weak" },
    { timelineIndex: 1, candidate: "F", confidence: 0.86, secondCandidate: "C", secondConfidence: 0.63, attack: "strong" },
    { timelineIndex: 2, candidate: "G", confidence: 0.74, secondCandidate: "Em", secondConfidence: 0.57, frames: 4 },
    { timelineIndex: 3, candidate: "C", confidence: 0.82, secondCandidate: "Am", secondConfidence: 0.61, attack: "weak" },
    { timelineIndex: 4, candidate: "B", confidence: 0.8 },
    { timelineIndex: 4, candidate: "F", confidence: 0.84, secondCandidate: "C", secondConfidence: 0.6, attack: "strong" },
    { timelineIndex: 5, candidate: "E", confidence: 0.88, attack: "weak" },
  ]);

  assert.ok(newResult.metrics.correctFrameRatio >= 0.7);
  assert.equal(newResult.metrics.backwardsCommits, 0);
  assert.ok(newResult.metrics.maxIncorrectJumpDistance <= 1);
});

test("onlineChordAligner prioriza continuity ante una seccion futura identica", () => {
  const { newResult } = compareFixture(
    "A A E E B C#m\nA A E E B C#m",
    stepsForAllEvents(["A", "A", "E", "E", "B", "C#m", "A", "A", "E", "E", "B", "C#m"]),
  );

  assert.equal(newResult.metrics.backwardsCommits, 0);
  assert.equal(newResult.metrics.maxIncorrectJumpDistance, 0);
  assert.ok(newResult.metrics.correctFrameRatio >= 0.55);
  assert.ok(newResult.frames.some((frame) => frame.trackingRegime === "continuity"));
});

test("onlineChordAligner no abandona continuity por un acorde incorrecto aislado", () => {
  const { newResult } = compareFixture("C G Am F", [
    { timelineIndex: 0, candidate: "C" },
    { timelineIndex: 1, candidate: "B" },
    { timelineIndex: 1, candidate: "G" },
    { timelineIndex: 2, candidate: "Am" },
    { timelineIndex: 3, candidate: "F" },
  ]);

  assert.equal(newResult.metrics.backwardsCommits, 0);
  assert.equal(newResult.metrics.maxIncorrectJumpDistance, 0);
  assert.ok(newResult.metrics.correctFrameRatio >= 0.75);
});

test("onlineChordAligner entra en relocalization con varios eventos incompatibles acumulados", () => {
  const { newResult } = compareFixture("C G Am F D A E B", [
    { timelineIndex: 0, candidate: "C" },
    { timelineIndex: 1, candidate: "G" },
    { timelineIndex: 6, candidate: "E" },
    { timelineIndex: 7, candidate: "B" },
    { timelineIndex: 7, candidate: "B", silenceBefore: true },
  ]);

  assert.ok(newResult.frames.some((frame) => frame.state !== "locked"));
  assert.equal(newResult.metrics.backwardsCommits, 0);
});

test("onlineChordAligner tolera un acorde extra sin crear timelineIndex ni mover display", () => {
  const timeline = deriveChordTimeline("B C#m A E");
  const expected = deriveExpectedMusicSequence("B C#m A E");
  const evidence = recordingFromSteps([
    { timelineIndex: 0, candidate: "B" },
    { timelineIndex: null, candidate: "E" },
    { timelineIndex: 1, candidate: "C#m" },
    { timelineIndex: 2, candidate: "A" },
    { timelineIndex: 3, candidate: "E" },
  ]);
  const result = evaluatePositionTracker({
    expected,
    evidence,
    tracker: createOnlineChordAlignerTracker(),
  });
  const visual = evaluateVisualPolicy(result);
  const extraFrames = visual.frames.filter((frame) => frame.groundTruthTimelineIndex === null);

  assert.ok(extraFrames.length > 0);
  assert.ok(extraFrames.every((frame) => frame.displayedTimelineIndex === 0));
  assert.ok(extraFrames.every((frame) => frame.groundTruthTimelineIndex === null));
  assert.equal(result.metrics.backwardsCommits, 0);
  assert.ok(onlyTruthFrames(result).filter((frame) => frame.error === 0).length >= 9);
  assert.equal(timeline.length, 4);
});

test("onlineChordAligner soporta inserciones musicales comunes y recupera localmente", () => {
  const cases = [
    {
      content: "G C",
      steps: [
        { timelineIndex: 0, candidate: "G" },
        { timelineIndex: null, candidate: "G7" },
        { timelineIndex: 1, candidate: "C" },
      ],
    },
    {
      content: "Am Am",
      steps: [
        { timelineIndex: 0, candidate: "Am" },
        { timelineIndex: null, candidate: "E7" },
        { timelineIndex: 1, candidate: "Am" },
      ],
    },
    {
      content: "D G",
      steps: [
        { timelineIndex: 0, candidate: "D" },
        { timelineIndex: null, candidate: "D/F#" },
        { timelineIndex: 1, candidate: "G" },
      ],
    },
    {
      content: "B C#m A",
      steps: [
        { timelineIndex: 0, candidate: "B" },
        { timelineIndex: null, candidate: "E" },
        { timelineIndex: 1, candidate: "C#m" },
        { timelineIndex: 2, candidate: "A" },
      ],
    },
  ] satisfies Array<{ content: string; steps: PlayedStep[] }>;

  for (const item of cases) {
    const expected = deriveExpectedMusicSequence(item.content);
    const result = evaluatePositionTracker({
      expected,
      evidence: recordingFromSteps(item.steps),
      tracker: createOnlineChordAlignerTracker(),
    });
    const visual = evaluateVisualPolicy(result);

    assert.equal(result.metrics.backwardsCommits, 0, item.content);
    assert.equal(visual.metrics.backwardsDisplayedMoves, 0, item.content);
    assert.ok(result.metrics.correctFrameRatio >= 0.75, item.content);
    assert.ok(visual.metrics.falseLargeJumpCount === 0, item.content);
  }
});

test("onlineChordAligner tolera dos extras y un extra combinado con omision", () => {
  const twoExtras = evaluatePositionTracker({
    expected: deriveExpectedMusicSequence("B C#m A E"),
    evidence: recordingFromSteps([
      { timelineIndex: 0, candidate: "B" },
      { timelineIndex: null, candidate: "E" },
      { timelineIndex: null, candidate: "D" },
      { timelineIndex: 1, candidate: "C#m" },
      { timelineIndex: 2, candidate: "A" },
      { timelineIndex: 3, candidate: "E" },
    ]),
    tracker: createOnlineChordAlignerTracker(),
  });
  const extraAndOmit = evaluatePositionTracker({
    expected: deriveExpectedMusicSequence("Am A7 F G"),
    evidence: recordingFromSteps([
      { timelineIndex: 0, candidate: "Am" },
      { timelineIndex: null, candidate: "E7" },
      { timelineIndex: 2, candidate: "F" },
      { timelineIndex: 3, candidate: "G" },
    ]),
    tracker: createOnlineChordAlignerTracker(),
  });

  assert.equal(twoExtras.metrics.backwardsCommits, 0);
  assert.ok(twoExtras.frames.some((frame) => frame.insertionActive));
  assert.ok(twoExtras.metrics.correctFrameRatio >= 0.65);
  assert.equal(extraAndOmit.metrics.backwardsCommits, 0);
  assert.ok(extraAndOmit.metrics.correctFrameRatio >= 0.65);
});

test("onlineChordAligner no trata una secuencia larga incorrecta como insertion eterna", () => {
  const result = evaluatePositionTracker({
    expected: deriveExpectedMusicSequence("C G Am F D A E B"),
    evidence: recordingFromSteps([
      { timelineIndex: 0, candidate: "C" },
      { timelineIndex: 1, candidate: "G" },
      { timelineIndex: null, candidate: "B" },
      { timelineIndex: null, candidate: "E" },
      { timelineIndex: null, candidate: "D" },
      { timelineIndex: null, candidate: "A" },
      { timelineIndex: 6, candidate: "E" },
      { timelineIndex: 7, candidate: "B" },
    ]),
    tracker: createOnlineChordAlignerTracker(),
  });

  assert.ok(result.frames.some((frame) => frame.state !== "locked" || frame.trackingRegime === "relocalization"));
  assert.equal(result.metrics.backwardsCommits, 0);
});

test("onlineChordAligner mantiene cautela cuando una omision local termina en un acorde repetido ambiguo", () => {
  const expected = deriveExpectedMusicSequence("C#m A E E C#m A E");
  const evidence = recordingFromSteps([
    { timelineIndex: 0, candidate: "C#m" },
    { timelineIndex: 1, candidate: "A" },
    { timelineIndex: 5, candidate: "A" },
    { timelineIndex: 6, candidate: "E" },
  ]);
  const after = evaluatePositionTracker({
    expected,
    evidence,
    tracker: createOnlineChordAlignerTracker(),
  });

  assert.ok(after.frames.every((frame) => frame.committedTimelineIndex <= 4));
  assert.equal(after.metrics.backwardsCommits, 0);
});

test("onlineChordAligner reconcilia omisiones locales cuando la continuacion desambigua el destino", () => {
  const expected = deriveExpectedMusicSequence("C#m A E E F D");
  const result = evaluatePositionTracker({
    expected,
    evidence: recordingFromSteps([
      { timelineIndex: 0, candidate: "C#m" },
      { timelineIndex: 1, candidate: "A" },
      { timelineIndex: 4, candidate: "F" },
      { timelineIndex: 5, candidate: "D" },
    ]),
    tracker: createOnlineChordAlignerTracker(),
  });

  assert.ok(result.frames.some((frame) => frame.committedTimelineIndex >= 4));
  assert.ok(result.metrics.correctFrameRatio >= 0.65);
  assert.equal(result.metrics.backwardsCommits, 0);
});

test("onlineChordAligner soporta omitir uno dos y tres eventos escritos sin relocalization global", () => {
  const cases = [
    {
      content: "C G Am F",
      steps: [
        { timelineIndex: 0, candidate: "C" },
        { timelineIndex: 2, candidate: "Am" },
        { timelineIndex: 3, candidate: "F" },
      ],
    },
    {
      content: "C G D Am F",
      steps: [
        { timelineIndex: 0, candidate: "C" },
        { timelineIndex: 3, candidate: "Am" },
        { timelineIndex: 4, candidate: "F" },
      ],
    },
    {
      content: "C G D E Am F",
      steps: [
        { timelineIndex: 0, candidate: "C" },
        { timelineIndex: 4, candidate: "Am" },
        { timelineIndex: 5, candidate: "F" },
      ],
    },
  ] satisfies Array<{ content: string; steps: PlayedStep[] }>;

  for (const item of cases) {
    const result = evaluatePositionTracker({
      expected: deriveExpectedMusicSequence(item.content),
      evidence: recordingFromSteps(item.steps),
      tracker: createOnlineChordAlignerTracker(),
    });

    assert.equal(result.metrics.backwardsCommits, 0, item.content);
    assert.ok(result.metrics.correctFrameRatio >= 0.65, item.content);
  }
});

test("onlineChordAligner no salta a la misma raiz futura sin contexto secuencial suficiente", () => {
  const expected = deriveExpectedMusicSequence("A E B C#m A E B A");
  const result = evaluatePositionTracker({
    expected,
    evidence: recordingFromSteps([
      { timelineIndex: 0, candidate: "A" },
      { timelineIndex: 1, candidate: "E" },
      { timelineIndex: 7, candidate: "A" },
    ]),
    tracker: createOnlineChordAlignerTracker(),
  });

  const firstFutureA = result.frames.find((frame) => frame.groundTruthTimelineIndex === 7);
  assert.ok(firstFutureA);
  assert.notEqual(firstFutureA.committedTimelineIndex, 7);
  assert.equal(result.metrics.backwardsCommits, 0);
});

test("onlineChordAligner combina insertion y local skip sin crear indices ficticios", () => {
  const expected = deriveExpectedMusicSequence("B C#m A E");
  const evidence = recordingFromSteps([
    { timelineIndex: 0, candidate: "B" },
    { timelineIndex: null, candidate: "E" },
    { timelineIndex: 2, candidate: "A" },
    { timelineIndex: 3, candidate: "E" },
  ]);
  const result = evaluatePositionTracker({
    expected,
    evidence,
    tracker: createOnlineChordAlignerTracker(),
  });
  const visual = evaluateVisualPolicy(result);

  assert.equal(result.metrics.backwardsCommits, 0);
  assert.ok(result.frames.some((frame) => frame.groundTruthTimelineIndex === null));
  assert.ok(result.metrics.correctFrameRatio >= 0.65);
  assert.equal(visual.metrics.falseLargeJumpCount, 0);
});

test("onlineChordAligner local skip seguido de acorde incorrecto no fuerza commit falso", () => {
  const expected = deriveExpectedMusicSequence("C#m A E E C#m A");
  const result = evaluatePositionTracker({
    expected,
    evidence: recordingFromSteps([
      { timelineIndex: 0, candidate: "C#m" },
      { timelineIndex: 1, candidate: "A" },
      { timelineIndex: 5, candidate: "A" },
      { timelineIndex: 5, candidate: "B" },
    ]),
    tracker: createOnlineChordAlignerTracker(),
  });

  assert.equal(result.metrics.backwardsCommits, 0);
  assert.ok(result.metrics.maxIncorrectJumpDistance <= 1);
});
