import type { AudioEvidenceRecording } from "./audioEvidence.ts";
import type { ExpectedMusicSequence } from "./expectedMusic.ts";
import {
  createRealTrackingFixture,
  toEvaluationEvidenceRecording,
} from "./realEvidenceDataset.ts";
import { getChordMatchFamily } from "./chordTheory.ts";
import { detectMusicalTransitionEvidence } from "./onlineChordAligner.ts";
import type { EvaluationEvidenceRecording } from "./positionTrackerEvaluation.ts";

export type SuggestedGroundTruthAlternative = {
  timelineIndex: number;
  chord: string;
  confidence: number;
};

export type SuggestedGroundTruthChange = {
  time: string;
  timeMs: number;
  suggestedTimelineIndex: number;
  chord: string;
  evidenceChord: string;
  confidence: number;
  alternatives: SuggestedGroundTruthAlternative[];
};

export type SuggestedGroundTruth = {
  version: 1;
  recordingFile?: string;
  name?: string;
  notes: string;
  changes: SuggestedGroundTruthChange[];
  reviewTimeline: string[];
};

type ObservedEvidenceEvent = {
  startMs: number;
  chord: string;
  confidence: number;
  frames: number;
  alternatives: Array<{ chord: string; confidence: number }>;
};

const MIN_OBSERVED_FRAMES = 2;
const MAX_LOOKAHEAD_EVENTS = 8;
const REPEATED_EVIDENCE_DEBOUNCE_MS = 2500;
const MAX_SUGGESTED_EVENTS_PER_SECOND = 2;

export function suggestGroundTruthForRecording(input: {
  recording: AudioEvidenceRecording;
  expectedMusicSequence?: ExpectedMusicSequence;
  recordingFile?: string;
  name?: string;
}): SuggestedGroundTruth {
  const expectedMusicSequence = input.expectedMusicSequence ?? input.recording.metadata?.expectedMusicSequence;
  if (!expectedMusicSequence) {
    throw new Error("Recording must include ExpectedMusicSequence metadata or receive one explicitly.");
  }

  const fixture = createRealTrackingFixture({
    name: input.name ?? input.recording.metadata?.songTitle ?? input.recordingFile ?? "real evidence recording",
    expectedMusicSequence,
    evidenceRecording: input.recording,
  });
  const evidence = toEvaluationEvidenceRecording(fixture);
  const observedEvents = deriveObservedEvidenceEvents(evidence);
  const changes = alignObservedEventsToExpected(observedEvents, expectedMusicSequence, evidence);

  return {
    version: 1,
    recordingFile: input.recordingFile,
    name: input.name ?? input.recording.metadata?.songTitle,
    notes:
      "Auto-generated suggestion only. Review/edit before using as ground truth. It uses chroma-derived evidence, not follower or aligner decisions.",
    changes,
    reviewTimeline: changes.map((change) =>
      `${change.time}   expected ${change.suggestedTimelineIndex} ${change.chord.padEnd(6)} evidence ${change.evidenceChord} confidence ${change.confidence.toFixed(2)}`
    ),
  };
}

export function deriveObservedEvidenceEvents(evidence: EvaluationEvidenceRecording): ObservedEvidenceEvent[] {
  const events: ObservedEvidenceEvent[] = [];
  let current: {
    chord: string;
    startMs: number;
    confidences: number[];
    frames: number;
    alternatives: Map<string, number>;
  } | null = null;
  let previousFrame = evidence.frames[0] ?? null;

  for (const frame of evidence.frames) {
    const top = frame.topCandidates[0];
    const chord = frame.candidate !== "unknown" ? frame.candidate : top?.chord;
    if (!chord) {
      current = flushObservedEvent(events, current);
      previousFrame = frame;
      continue;
    }

    const transition = previousFrame ? detectMusicalTransitionEvidence(frame, previousFrame) : null;
    const startsNewEvent =
      !current ||
      current.chord !== chord ||
      Boolean(transition?.supportsNewEvent && current.frames >= MIN_OBSERVED_FRAMES);

    if (startsNewEvent) {
      current = flushObservedEvent(events, current);
      current = {
        chord,
        startMs: frame.timestamp,
        confidences: [],
        frames: 0,
        alternatives: new Map<string, number>(),
      };
    }

    const active = current;
    if (!active) continue;
    active.confidences.push(top?.confidence ?? frame.confidence);
    active.frames += 1;
    for (const candidate of frame.topCandidates.slice(0, 3)) {
      active.alternatives.set(candidate.chord, Math.max(active.alternatives.get(candidate.chord) ?? 0, candidate.confidence));
    }
    previousFrame = frame;
  }

  flushObservedEvent(events, current);
  return events;
}

function alignObservedEventsToExpected(
  observedEvents: readonly ObservedEvidenceEvent[],
  expectedMusicSequence: ExpectedMusicSequence,
  evidence: EvaluationEvidenceRecording,
): SuggestedGroundTruthChange[] {
  const changes: SuggestedGroundTruthChange[] = [];
  let cursor = 0;
  const recordingStartMs = evidence.frames[0]?.timestamp ?? 0;
  let lastAcceptedObservedStartMs = recordingStartMs;

  for (const observed of observedEvents) {
    const previous = changes.at(-1);
    if (
      previous?.evidenceChord === observed.chord &&
      observed.startMs - lastAcceptedObservedStartMs < REPEATED_EVIDENCE_DEBOUNCE_MS
    ) {
      continue;
    }

    const elapsedSinceLastAccepted = Math.max(0, observed.startMs - lastAcceptedObservedStartMs);
    const timeBoundedLookahead = Math.max(
      3,
      Math.floor((elapsedSinceLastAccepted / 1000) * MAX_SUGGESTED_EVENTS_PER_SECOND) + 2,
    );
    const lookaheadEnd = Math.min(
      expectedMusicSequence.events.length,
      cursor + Math.min(MAX_LOOKAHEAD_EVENTS, timeBoundedLookahead),
    );
    const alternatives = expectedMusicSequence.events
      .slice(cursor, lookaheadEnd)
      .map((event) => {
        const match = getChordMatchFamily(event.normalizedChord, observed.chord);
        const continuityPenalty = Math.max(0, event.timelineIndex - cursor) * 0.04;
        return {
          timelineIndex: event.timelineIndex,
          chord: event.normalizedChord,
          confidence: Math.max(0, observed.confidence * match.weight - continuityPenalty),
        };
      })
      .filter((item) => item.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);

    const best = alternatives[0];
    if (!best) continue;
    if (changes.at(-1)?.suggestedTimelineIndex === best.timelineIndex) continue;

    changes.push({
      time: formatTimecodeMs(observed.startMs - recordingStartMs),
      timeMs: Math.max(0, Math.round(observed.startMs - recordingStartMs)),
      suggestedTimelineIndex: best.timelineIndex,
      chord: best.chord,
      evidenceChord: observed.chord,
      confidence: round(best.confidence, 3),
      alternatives: alternatives.map((alternative) => ({
        ...alternative,
        confidence: round(alternative.confidence, 3),
      })),
    });
    cursor = Math.max(cursor, best.timelineIndex + 1);
    lastAcceptedObservedStartMs = observed.startMs;
  }

  return changes;
}

function flushObservedEvent(
  events: ObservedEvidenceEvent[],
  current: {
    chord: string;
    startMs: number;
    confidences: number[];
    frames: number;
    alternatives: Map<string, number>;
  } | null,
) {
  if (!current) return null;
  if (current.frames >= MIN_OBSERVED_FRAMES) {
    const confidence = current.confidences.reduce((sum, value) => sum + value, 0) / current.confidences.length;
    events.push({
      startMs: current.startMs,
      chord: current.chord,
      confidence,
      frames: current.frames,
      alternatives: [...current.alternatives.entries()]
        .map(([chord, alternativeConfidence]) => ({ chord, confidence: alternativeConfidence }))
        .sort((a, b) => b.confidence - a.confidence),
    });
  }
  return null;
}

function formatTimecodeMs(value: number) {
  const totalMs = Math.max(0, Math.round(value));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
