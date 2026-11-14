import assert from "node:assert/strict";
import test from "node:test";
import type { AudioEvidenceFrame } from "../mobile/src/music/audioEvidence.ts";
import type { ChordCandidate, SupportedChord } from "../mobile/src/music/chordDetection.ts";
import {
  evaluateObservedEventSegmentation,
  observedEventsToRepresentativeFrames,
  segmentObservedMusicEvents,
} from "../mobile/src/music/observedMusicEvents.ts";

const FRAME_MS = 150;

function frame(input: {
  timestamp: number;
  candidate: ChordCandidate;
  previous?: AudioEvidenceFrame | null;
  confidence?: number;
  rms?: number;
  onset?: number;
  chromaDelta?: number;
  spectralFlux?: number;
  secondCandidate?: SupportedChord;
}): AudioEvidenceFrame {
  const previous = input.previous ?? null;
  const confidence = input.candidate === "unknown" ? 0 : input.confidence ?? 0.88;
  const secondScore = input.secondCandidate ? Math.max(0, confidence - 0.2) : 0.12;
  const rms = input.rms ?? (input.candidate === "unknown" ? 0.001 : 0.08);
  const onset = input.onset ?? (previous && previous.candidate === input.candidate ? 0.12 : 0.82);
  const chromaDelta = input.chromaDelta ?? (previous && previous.candidate === input.candidate ? 0.02 : 0.12);
  const spectralFlux = input.spectralFlux ?? (previous && previous.candidate === input.candidate ? 0.08 : 0.42);
  const candidateChanged = previous ? previous.candidate !== input.candidate : input.candidate !== "unknown";
  const observedEventDurationMs =
    previous && previous.candidate === input.candidate && input.candidate !== "unknown"
      ? previous.observedEventDurationMs + (input.timestamp - previous.timestamp)
      : 0;

  return {
    timestamp: input.timestamp,
    sampleRate: 44100,
    windowSize: 4096,
    chroma: Array.from({ length: 12 }, () => 1 / 12),
    rms,
    scores: input.candidate === "unknown"
      ? {}
      : {
        [input.candidate]: confidence,
        ...(input.secondCandidate ? { [input.secondCandidate]: secondScore } : {}),
      },
    topCandidates: input.candidate === "unknown"
      ? []
      : [
        { chord: input.candidate, score: confidence, confidence },
        ...(input.secondCandidate ? [{ chord: input.secondCandidate, score: secondScore, confidence: secondScore }] : []),
      ],
    candidate: input.candidate,
    confidence,
    bestScore: confidence,
    secondScore,
    scoreMargin: Math.max(0, confidence - secondScore),
    deltaMs: previous ? input.timestamp - previous.timestamp : null,
    rmsDelta: previous ? rms - previous.rms : null,
    energyRise: previous ? Math.max(0, rms - previous.rms) : 0,
    onsetStrength: onset,
    chromaDelta,
    chromaDeltaVector: Array.from({ length: 12 }, () => 0),
    spectralFlux,
    observedEventDurationMs,
    candidateChanged,
    repeatedCandidateFrames:
      previous && previous.candidate === input.candidate && input.candidate !== "unknown"
        ? previous.repeatedCandidateFrames + 1
        : input.candidate === "unknown"
          ? 0
          : 1,
  };
}

function framesFromSteps(steps: Array<{
  candidate: ChordCandidate;
  frames?: number;
  attack?: boolean;
  rms?: number;
  transitionNoise?: ChordCandidate[];
}>) {
  const frames: AudioEvidenceFrame[] = [];
  let previous: AudioEvidenceFrame | null = null;
  let timestamp = 0;

  for (const step of steps) {
    for (const noisy of step.transitionNoise ?? []) {
      const noisyFrame = frame({
        timestamp,
        candidate: noisy,
        previous,
        confidence: 0.35,
        onset: 0.38,
        chromaDelta: 0.08,
        spectralFlux: 0.22,
      });
      frames.push(noisyFrame);
      previous = noisyFrame;
      timestamp += FRAME_MS;
    }

    for (let index = 0; index < (step.frames ?? 3); index += 1) {
      const current = frame({
        timestamp,
        candidate: step.candidate,
        previous,
        rms: step.rms,
        onset: index === 0 && step.attack !== false ? 0.86 : 0.1,
        chromaDelta: index === 0 && step.attack !== false ? 0.12 : 0.015,
        spectralFlux: index === 0 && step.attack !== false ? 0.5 : 0.05,
      });
      frames.push(current);
      previous = current;
      timestamp += FRAME_MS;
    }
  }

  return frames;
}

test("ObservedEventSegmenter mantiene un sustain largo como un solo evento", () => {
  const events = segmentObservedMusicEvents(framesFromSteps([{ candidate: "E", frames: 12 }]));

  assert.equal(events.filter((event) => event.eventType === "chord").length, 1);
  assert.equal(events[0].representativeChord, "E");
  assert.ok(events[0].durationMs >= 1500);
});

test("ObservedEventSegmenter separa repeated chords solo con nuevo ataque", () => {
  const withoutAttack = segmentObservedMusicEvents(framesFromSteps([
    { candidate: "B", frames: 4 },
    { candidate: "B", frames: 4, attack: false },
  ]));
  const withAttack = segmentObservedMusicEvents(framesFromSteps([
    { candidate: "B", frames: 4 },
    { candidate: "B", frames: 4, attack: true },
  ]));

  assert.equal(withoutAttack.filter((event) => event.eventType === "chord").length, 1);
  assert.equal(withAttack.filter((event) => event.eventType === "chord").length, 2);
});

test("ObservedEventSegmenter separa cambios limpios y absorbe transiciones ruidosas", () => {
  const clean = segmentObservedMusicEvents(framesFromSteps([
    { candidate: "C#m", frames: 4 },
    { candidate: "A", frames: 4 },
  ]));
  const noisy = segmentObservedMusicEvents(framesFromSteps([
    { candidate: "C#m", frames: 4 },
    { candidate: "A", frames: 4, transitionNoise: ["E", "unknown"] },
  ]));

  assert.deepEqual(clean.filter((event) => event.eventType === "chord").map((event) => event.representativeChord), ["C#m", "A"]);
  assert.deepEqual(noisy.filter((event) => event.eventType === "chord").map((event) => event.representativeChord), ["C#m", "A"]);
});

test("ObservedEventSegmenter representa silencio y acordes extra sin timelineIndex", () => {
  const events = segmentObservedMusicEvents(framesFromSteps([
    { candidate: "B", frames: 3 },
    { candidate: "unknown", frames: 3, rms: 0.001 },
    { candidate: "E", frames: 3 },
    { candidate: "C#m", frames: 3 },
  ]));

  assert.deepEqual(events.map((event) => event.eventType), ["chord", "silence", "chord", "chord"]);
  assert.deepEqual(events.filter((event) => event.eventType === "chord").map((event) => event.representativeChord), ["B", "E", "C#m"]);
});

test("ObservedEventSegmenter conserva distribución de acordes e incertidumbre", () => {
  const events = segmentObservedMusicEvents([
    frame({ timestamp: 0, candidate: "C#m", secondCandidate: "E", confidence: 0.55 }),
    frame({ timestamp: 150, candidate: "C#m", secondCandidate: "E", confidence: 0.5 }),
    frame({ timestamp: 300, candidate: "E", secondCandidate: "C#m", confidence: 0.45 }),
  ]);

  assert.equal(events.length, 1);
  assert.ok(events[0].chordDistribution.some((item) => item.chord === "C#m"));
  assert.ok(events[0].chordDistribution.some((item) => item.chord === "E"));
});

test("ObservedEventSegmenter evalúa métricas básicas contra ground truth", () => {
  const events = segmentObservedMusicEvents(framesFromSteps([
    { candidate: "A", frames: 3 },
    { candidate: "A", frames: 3, attack: true },
    { candidate: "E", frames: 3 },
  ]));
  const metrics = evaluateObservedEventSegmentation({
    events,
    groundTruth: [
      { startMs: 0, endMs: 450, timelineIndex: 0 },
      { startMs: 450, endMs: 900, timelineIndex: 1 },
      { startMs: 900, endMs: 1350, timelineIndex: 2 },
    ],
    getExpectedChord: (index) => ["A", "A", "E"][index] ?? null,
  });

  assert.equal(metrics.groundTruthEventCount, 3);
  assert.equal(metrics.detectedEventCount, 3);
  assert.equal(metrics.repeatedChordMatches, 1);
  assert.equal(metrics.repeatedChordMisses, 0);
});

test("ObservedEventSegmenter puede generar frames representativos para comparación event-based", () => {
  const events = segmentObservedMusicEvents(framesFromSteps([
    { candidate: "G", frames: 3 },
    { candidate: "C", frames: 3 },
  ]));
  const representativeFrames = observedEventsToRepresentativeFrames(events);

  assert.deepEqual(representativeFrames.map((item) => item.candidate), ["G", "C"]);
  assert.ok(representativeFrames[0].topCandidates.length > 0);
});
