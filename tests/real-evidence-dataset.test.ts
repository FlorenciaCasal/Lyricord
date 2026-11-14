import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import type { AudioEvidenceFrame } from "../mobile/src/music/audioEvidence.ts";
import { deriveChordTimeline } from "../mobile/src/music/chordTimeline.ts";
import type { ChordCandidate, SupportedChord } from "../mobile/src/music/chordDetection.ts";
import { createExpectedMusicSequenceFromTimeline } from "../mobile/src/music/expectedMusic.ts";
import {
  createRealTrackingFixture,
  createGroundTruthSegmentsFromAnnotation,
  createRealTrackingFixtureFromRecordingAndAnnotation,
  createDevAudioEvidenceRecording,
  parseTimecodeMs,
  parseRealTrackingFixture,
  rescoreAudioEvidenceFramesForExpectedSequence,
  serializeRealTrackingFixture,
  toEvaluationEvidenceRecording,
} from "../mobile/src/music/realEvidenceDataset.ts";
import {
  createChordPositionFollowerTracker,
  createOnlineChordAlignerTracker,
  evaluatePositionTracker,
  evaluateVisualPolicy,
} from "../mobile/src/music/positionTrackerEvaluation.ts";
import { parseAudioEvidenceRecording } from "../mobile/src/music/audioEvidence.ts";
import { suggestGroundTruthForRecording } from "../mobile/src/music/groundTruthSuggestion.ts";
import { getChordPitchClasses } from "../mobile/src/music/chordTheory.ts";

function evidenceFrame(input: {
  timestamp: number;
  candidate: ChordCandidate;
  previous?: AudioEvidenceFrame | null;
  groundTruthTimelineIndex?: number;
}): AudioEvidenceFrame & { groundTruthTimelineIndex?: number } {
  const confidence = input.candidate === "unknown" ? 0 : 0.9;
  const previous = input.previous ?? null;
  const scores = input.candidate === "unknown" ? {} : { [input.candidate]: confidence } as Partial<Record<SupportedChord, number>>;

  return {
    timestamp: input.timestamp,
    sampleRate: 44100,
    windowSize: 4096,
    chroma: Array.from({ length: 12 }, () => 1 / 12),
    rms: input.candidate === "unknown" ? 0.001 : 0.08,
    scores,
    topCandidates: input.candidate === "unknown" ? [] : [{ chord: input.candidate, score: confidence, confidence: 1 }],
    candidate: input.candidate,
    confidence,
    bestScore: confidence,
    secondScore: 0.2,
    scoreMargin: Math.max(0, confidence - 0.2),
    deltaMs: previous ? input.timestamp - previous.timestamp : null,
    rmsDelta: previous ? (input.candidate === "unknown" ? 0.001 : 0.08) - previous.rms : null,
    energyRise: previous ? Math.max(0, (input.candidate === "unknown" ? 0.001 : 0.08) - previous.rms) : 0,
    onsetStrength: previous
      ? Math.max(
        previous.candidate !== input.candidate ? 0.78 : 0,
        Math.min(1, Math.max(0, (input.candidate === "unknown" ? 0.001 : 0.08) - previous.rms) / 0.045 * 0.72),
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
    groundTruthTimelineIndex: input.groundTruthTimelineIndex,
  };
}

function framesFromChords(chords: readonly SupportedChord[]) {
  const frames: Array<AudioEvidenceFrame & { groundTruthTimelineIndex: number }> = [];
  let previous: AudioEvidenceFrame | null = null;
  let timestamp = 0;
  chords.forEach((chord, timelineIndex) => {
    for (let index = 0; index < 3; index += 1) {
      const frame = evidenceFrame({
        timestamp,
        candidate: chord,
        previous,
        groundTruthTimelineIndex: timelineIndex,
      }) as AudioEvidenceFrame & { groundTruthTimelineIndex: number };
      frames.push(frame);
      previous = frame;
      timestamp += 150;
    }
  });
  return frames;
}

function chromaForChord(chord: SupportedChord) {
  const notes = getChordPitchClasses(chord) ?? [];
  return Array.from({ length: 12 }, (_, index) => notes.includes(index) ? 1 / Math.max(1, notes.length) : 0);
}

function chromaFramesFromChords(chords: readonly SupportedChord[]) {
  return framesFromChords(chords).map((frame) => ({
    ...frame,
    chroma: chromaForChord(frame.candidate as SupportedChord),
  }));
}

test("real evidence dataset serializa features sin PCM y permite replay determinista", () => {
  const timeline = deriveChordTimeline("C G Am F");
  const expectedMusicSequence = createExpectedMusicSequenceFromTimeline(timeline, {
    source: "normalized-content",
    songId: "dev-song",
    songTitle: "Dataset dev",
  });
  const frames = framesFromChords(["C", "G", "Am", "F"]);
  const recording = createDevAudioEvidenceRecording({
    frames,
    songId: "dev-song",
    songTitle: "Dataset dev",
    expectedMusicSequence,
    sampleRate: 44100,
    windowSize: 4096,
    appBuildInfo: { platform: "ios", appVersion: "dev", buildNumber: "dev", expoSdk: "57" },
  });

  const fixture = createRealTrackingFixture({
    name: "Dataset dev normal",
    expectedMusicSequence,
    evidenceRecording: recording,
    groundTruth: {
      segments: [
        { startMs: 0, endMs: 450, timelineIndex: 0 },
        { startMs: 450, endMs: 900, timelineIndex: 1 },
        { startMs: 900, endMs: 1350, timelineIndex: 2 },
        { startMs: 1350, endMs: 1800, timelineIndex: 3 },
      ],
    },
  });
  const restored = parseRealTrackingFixture(serializeRealTrackingFixture(fixture));
  const evidence = toEvaluationEvidenceRecording(restored);

  assert.equal(restored.evidenceRecording.frames.length, 12);
  assert.equal("pcm" in restored.evidenceRecording.frames[0], false);
  assert.equal(restored.evidenceRecording.metadata?.expectedMusicSequence?.events.length, 4);

  const oldResult = evaluatePositionTracker({
    expected: restored.expectedMusicSequence,
    evidence,
    tracker: createChordPositionFollowerTracker(timeline),
  });
  const newResult = evaluatePositionTracker({
    expected: restored.expectedMusicSequence,
    evidence,
    tracker: createOnlineChordAlignerTracker(),
  });
  const visual = evaluateVisualPolicy(newResult);

  assert.equal(oldResult.metrics.backwardsCommits, 0);
  assert.equal(newResult.metrics.backwardsCommits, 0);
  assert.equal(visual.metrics.backwardsDisplayedMoves, 0);
});

test("real evidence replay reconstruye scores contra toda la secuencia y no contra candidatos del follower viejo", () => {
  const timeline = deriveChordTimeline("C#m A E B");
  const expectedMusicSequence = createExpectedMusicSequenceFromTimeline(timeline, {
    source: "normalized-content",
    songId: "cae-dev",
    songTitle: "Cae dev",
  });
  const original = evidenceFrame({
    timestamp: 0,
    candidate: "E",
    groundTruthTimelineIndex: 3,
  });
  const biasedFrame: AudioEvidenceFrame = {
    ...original,
    scores: { "C#m": 0.1, A: 0.2, E: 0.8 },
    topCandidates: [
      { chord: "E", score: 0.8, confidence: 0.72 },
      { chord: "A", score: 0.2, confidence: 0.18 },
      { chord: "C#m", score: 0.1, confidence: 0.1 },
    ],
  };

  const [rescored] = rescoreAudioEvidenceFramesForExpectedSequence([biasedFrame], expectedMusicSequence);

  assert.ok("B" in rescored.scores);
  assert.ok(rescored.topCandidates.length >= 4);
  assert.deepEqual(
    Object.keys(rescored.scores).sort(),
    ["A", "B", "C#m", "E"].sort(),
  );
});

test("ground truth annotation deriva segmentos desde cambios de acorde", () => {
  const recording = createDevAudioEvidenceRecording({
    frames: framesFromChords(["C", "G", "Am"]),
    songId: "annotation-dev",
    songTitle: "Annotation dev",
    expectedMusicSequence: createExpectedMusicSequenceFromTimeline(deriveChordTimeline("C G Am"), {
      source: "normalized-content",
    }),
    sampleRate: 44100,
    windowSize: 4096,
  });

  const segments = createGroundTruthSegmentsFromAnnotation({
    version: 1,
    changes: [
      { time: "00:00.000", timelineIndex: 0 },
      { time: "00:00.450", timelineIndex: 1 },
      { timeMs: 900, timelineIndex: 2 },
    ],
  }, recording);

  assert.deepEqual(segments.slice(0, 2), [
    { startMs: 0, endMs: 450, timelineIndex: 0 },
    { startMs: 450, endMs: 900, timelineIndex: 1 },
  ]);
  assert.equal(segments[2].timelineIndex, 2);
  assert.ok(segments[2].endMs > segments[2].startMs);
  assert.equal(parseTimecodeMs("01:02.500"), 62500);
});

test("ground truth annotation produce fixtures reproducibles con métricas reales", () => {
  const timeline = deriveChordTimeline("C G Am F");
  const expectedMusicSequence = createExpectedMusicSequenceFromTimeline(timeline, {
    source: "normalized-content",
    songTitle: "Annotated dev",
  });
  const recording = createDevAudioEvidenceRecording({
    frames: chromaFramesFromChords(["C", "G", "Am", "F"]),
    songId: "annotated-dev",
    songTitle: "Annotated dev",
    expectedMusicSequence,
    sampleRate: 44100,
    windowSize: 4096,
  });
  const fixture = createRealTrackingFixtureFromRecordingAndAnnotation({
    name: "Annotated dev",
    evidenceRecording: recording,
    annotation: {
      version: 1,
      changes: [
        { timeMs: 0, timelineIndex: 0 },
        { timeMs: 450, timelineIndex: 1 },
        { timeMs: 900, timelineIndex: 2 },
        { timeMs: 1350, timelineIndex: 3 },
      ],
    },
  });
  const evidence = toEvaluationEvidenceRecording(fixture);
  const result = evaluatePositionTracker({
    expected: expectedMusicSequence,
    evidence,
    tracker: createChordPositionFollowerTracker(timeline),
  });

  assert.equal(result.metrics.framesWithGroundTruth, recording.frames.length);
  assert.ok(result.metrics.correctFrameRatio > 0);
});

test("suggest ground truth genera una propuesta editable desde evidencia re-scoreada", () => {
  const timeline = deriveChordTimeline("C G Am F");
  const expectedMusicSequence = createExpectedMusicSequenceFromTimeline(timeline, {
    source: "normalized-content",
    songTitle: "Suggested dev",
  });
  const recording = createDevAudioEvidenceRecording({
    frames: chromaFramesFromChords(["C", "G", "Am", "F"]),
    songId: "suggested-dev",
    songTitle: "Suggested dev",
    expectedMusicSequence,
    sampleRate: 44100,
    windowSize: 4096,
  });

  const suggestion = suggestGroundTruthForRecording({
    recording,
    recordingFile: "suggested-dev.json",
  });

  assert.equal(suggestion.version, 1);
  assert.ok(suggestion.notes.includes("Auto-generated suggestion"));
  assert.ok(suggestion.changes.length >= 3);
  assert.equal(suggestion.changes[0].suggestedTimelineIndex, 0);
  assert.equal(suggestion.changes[0].chord, "C");
  assert.ok(suggestion.changes[0].alternatives.length > 0);
  assert.ok(suggestion.reviewTimeline[0].includes("expected 0 C"));
  assert.equal("timelineIndex" in suggestion.changes[0], false);
});

test("real evidence fixtures exportados desde iPhone cargan y re-scorean offline", () => {
  const fixtureDir = path.join(process.cwd(), "tests", "fixtures", "real-evidence");
  const files = fs.readdirSync(fixtureDir).filter((file) => file.startsWith("lyricord-evidence-") && file.endsWith(".json"));

  assert.ok(files.length >= 2);

  for (const file of files) {
    const recording = parseAudioEvidenceRecording(fs.readFileSync(path.join(fixtureDir, file), "utf8"));
    const expectedMusicSequence = recording.metadata?.expectedMusicSequence;
    assert.ok(expectedMusicSequence, `${file} debe incluir ExpectedMusicSequence`);

    const fixture = createRealTrackingFixture({
      name: file,
      expectedMusicSequence,
      evidenceRecording: recording,
    });
    const evidence = toEvaluationEvidenceRecording(fixture);

    assert.equal(evidence.frames.length, recording.frames.length);
    assert.ok(evidence.frames.some((frame) => Object.keys(frame.scores).length >= 4));

    const newResult = evaluatePositionTracker({
      expected: expectedMusicSequence,
      evidence,
      tracker: createOnlineChordAlignerTracker(),
    });
    const visual = evaluateVisualPolicy(newResult);

    assert.equal(newResult.metrics.backwardsCommits, 0);
    assert.equal(visual.metrics.backwardsDisplayedMoves, 0);
  }
});
