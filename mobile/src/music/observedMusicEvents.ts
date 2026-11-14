import type { AudioEvidenceCandidate, AudioEvidenceFrame } from "./audioEvidence.ts";
import type { SupportedChord } from "./chordDetection.ts";
import type { GroundTruthSegment } from "./positionTrackerEvaluation.ts";

export type ObservedMusicEventType = "chord" | "silence" | "uncertain";

export type ObservedChordDistributionItem = {
  chord: SupportedChord;
  score: number;
  confidence: number;
};

export type ObservedMusicEvent = {
  startTime: number;
  endTime: number;
  durationMs: number;
  eventType: ObservedMusicEventType;
  chordDistribution: ObservedChordDistributionItem[];
  topCandidates: AudioEvidenceCandidate[];
  representativeChord: SupportedChord | "unknown";
  representativeChroma: number[];
  confidence: number;
  onsetStrength: number;
  meanOnsetStrength: number;
  maxChromaDelta: number;
  meanChromaDelta: number;
  maxSpectralFlux: number;
  meanSpectralFlux: number;
  meanRms: number;
  maxRms: number;
  frameCount: number;
};

export type ObservedEventSegmenterConfig = {
  silenceRmsThreshold: number;
  minEventDurationMs: number;
  minStableFrames: number;
  candidateDominanceRatio: number;
  chordChangeScore: number;
  repeatedAttackOnset: number;
  repeatedAttackFlux: number;
  repeatedAttackMinDurationMs: number;
  uncertainConfidenceThreshold: number;
  transientAbsorbMs: number;
};

export type SegmenterGroundTruthMetrics = {
  groundTruthEventCount: number;
  detectedEventCount: number;
  matchedEvents: number;
  missedObservedEvents: number;
  falseSplitCount: number;
  falseMergeCount: number;
  repeatedChordMatches: number;
  repeatedChordMisses: number;
  meanBoundaryTimingErrorMs: number | null;
  maxBoundaryTimingErrorMs: number | null;
};

type DraftEvent = {
  frames: AudioEvidenceFrame[];
};

const DEFAULT_CONFIG: ObservedEventSegmenterConfig = {
  silenceRmsThreshold: 0.006,
  minEventDurationMs: 220,
  minStableFrames: 2,
  candidateDominanceRatio: 0.58,
  chordChangeScore: 0.52,
  repeatedAttackOnset: 0.62,
  repeatedAttackFlux: 0.48,
  repeatedAttackMinDurationMs: 320,
  uncertainConfidenceThreshold: 0.42,
  transientAbsorbMs: 260,
};

export function segmentObservedMusicEvents(
  frames: readonly AudioEvidenceFrame[],
  config: Partial<ObservedEventSegmenterConfig> = {},
): ObservedMusicEvent[] {
  const options = { ...DEFAULT_CONFIG, ...config };
  if (frames.length === 0) return [];

  const events: DraftEvent[] = [];
  let current: DraftEvent | null = null;

  for (const frame of frames) {
    if (!current) {
      current = { frames: [frame] };
      continue;
    }

    if (shouldStartNewEvent(current, frame, options)) {
      events.push(current);
      current = { frames: [frame] };
    } else {
      current.frames.push(frame);
    }
  }

  if (current) events.push(current);

  return mergeShortTransients(events, options).map((event) => summarizeDraftEvent(event.frames, options));
}

export function formatObservedMusicEvents(events: readonly ObservedMusicEvent[], recordingStartTime?: number) {
  const start = recordingStartTime ?? events[0]?.startTime ?? 0;
  return events.map((event) => {
    const from = formatOffset(event.startTime - start);
    const to = formatOffset(event.endTime - start);
    const distribution = event.chordDistribution
      .slice(0, 3)
      .map((item) => `${item.chord}:${item.confidence.toFixed(2)}`)
      .join(" ");
    return `${from}-${to}  ${event.representativeChord.padEnd(7)} ${event.eventType.padEnd(9)} conf=${event.confidence.toFixed(2)} onset=${event.onsetStrength.toFixed(2)} dur=${Math.round(event.durationMs)}ms ${distribution}`;
  });
}

export function evaluateObservedEventSegmentation(input: {
  events: readonly ObservedMusicEvent[];
  groundTruth: readonly GroundTruthSegment[];
  getExpectedChord: (timelineIndex: number) => SupportedChord | null;
}): SegmenterGroundTruthMetrics {
  const truth = input.groundTruth.filter((segment) => Number.isInteger(segment.timelineIndex));
  const matchedTruth = new Set<number>();
  const matchedEvents = new Set<number>();
  const boundaryErrors: number[] = [];

  input.events.forEach((event, eventIndex) => {
    if (event.eventType !== "chord") return;
    const best = truth
      .map((segment, truthIndex) => ({
        truthIndex,
        segment,
        expectedChord: input.getExpectedChord(segment.timelineIndex),
        overlap: overlapMs(event.startTime, event.endTime, segment.startMs, segment.endMs),
      }))
      .filter((item) => item.overlap > 0 && item.expectedChord === event.representativeChord)
      .sort((a, b) => b.overlap - a.overlap)[0];

    if (!best) return;
    matchedTruth.add(best.truthIndex);
    matchedEvents.add(eventIndex);
    boundaryErrors.push(Math.abs(event.startTime - best.segment.startMs));
  });

  const falseSplitCount = countFalseSplits(input.events, truth, input.getExpectedChord);
  const falseMergeCount = countFalseMerges(input.events, truth);
  const repeated = countRepeatedChordMatches(input.events, truth, input.getExpectedChord);

  return {
    groundTruthEventCount: truth.length,
    detectedEventCount: input.events.filter((event) => event.eventType === "chord").length,
    matchedEvents: matchedTruth.size,
    missedObservedEvents: Math.max(0, truth.length - matchedTruth.size),
    falseSplitCount,
    falseMergeCount,
    repeatedChordMatches: repeated.matches,
    repeatedChordMisses: repeated.misses,
    meanBoundaryTimingErrorMs: mean(boundaryErrors),
    maxBoundaryTimingErrorMs: boundaryErrors.length > 0 ? Math.max(...boundaryErrors) : null,
  };
}

export function observedEventsToRepresentativeFrames(events: readonly ObservedMusicEvent[]): AudioEvidenceFrame[] {
  const frames: AudioEvidenceFrame[] = [];
  let previous: AudioEvidenceFrame | null = null;

  for (const event of events) {
    const candidate = event.eventType === "chord" ? event.representativeChord : "unknown";
    const scores = Object.fromEntries(event.chordDistribution.map((item) => [item.chord, item.score])) as Partial<Record<SupportedChord, number>>;
    const frame: AudioEvidenceFrame = {
      timestamp: event.startTime,
      sampleRate: 44100,
      windowSize: 0,
      chroma: [...event.representativeChroma],
      rms: event.meanRms,
      scores,
      topCandidates: event.topCandidates.map((candidateItem) => ({ ...candidateItem })),
      candidate,
      confidence: event.confidence,
      bestScore: event.chordDistribution[0]?.score ?? 0,
      secondScore: event.chordDistribution[1]?.score ?? 0,
      scoreMargin: (event.chordDistribution[0]?.score ?? 0) - (event.chordDistribution[1]?.score ?? 0),
      deltaMs: previous ? event.startTime - previous.timestamp : null,
      rmsDelta: previous ? event.meanRms - previous.rms : null,
      energyRise: event.onsetStrength * 0.045,
      onsetStrength: event.onsetStrength,
      chromaDelta: event.meanChromaDelta,
      chromaDeltaVector: Array.from({ length: event.representativeChroma.length }, () => 0),
      spectralFlux: event.meanSpectralFlux,
      observedEventDurationMs: event.durationMs,
      candidateChanged: previous ? previous.candidate !== candidate : candidate !== "unknown",
      repeatedCandidateFrames:
        previous && previous.candidate === candidate && candidate !== "unknown"
          ? previous.repeatedCandidateFrames + 1
          : candidate === "unknown"
            ? 0
            : 1,
    };
    frames.push(frame);
    previous = frame;
  }

  return frames;
}

function shouldStartNewEvent(
  current: DraftEvent,
  frame: AudioEvidenceFrame,
  config: ObservedEventSegmenterConfig,
) {
  const currentSummary = summarizeDraftEvent(current.frames, config);
  const currentType = currentSummary.eventType;
  const frameType = classifyFrame(frame, config);
  const currentDuration = currentSummary.durationMs;

  if (currentType === "silence" && frameType !== "silence") return true;
  if (currentType !== "silence" && frameType === "silence" && currentDuration >= config.minEventDurationMs) return true;
  if (frameType !== "chord") return false;

  const representative = currentSummary.representativeChord;
  const candidate = frame.candidate;
  if (candidate === "unknown") return false;

  if (representative !== "unknown" && candidate !== representative) {
    const stableCandidateFrames = countRecentCandidateFrames(current.frames, candidate) + 1;
    const acousticChange = Math.max(frame.chromaDelta / 0.16, frame.spectralFlux / 0.45, frame.onsetStrength);
    return stableCandidateFrames >= config.minStableFrames || acousticChange >= config.chordChangeScore;
  }

  if (candidate === representative && currentDuration >= config.repeatedAttackMinDurationMs) {
    return frame.onsetStrength >= config.repeatedAttackOnset &&
      Math.max(frame.chromaDelta / 0.16, frame.spectralFlux / 0.45) >= config.repeatedAttackFlux;
  }

  return false;
}

function mergeShortTransients(events: readonly DraftEvent[], config: ObservedEventSegmenterConfig) {
  const merged: DraftEvent[] = [];

  for (const event of events) {
    const summary = summarizeDraftEvent(event.frames, config);
    const previous = merged[merged.length - 1];
    if (
      previous &&
      summary.durationMs <= config.transientAbsorbMs &&
      summary.eventType !== "silence"
    ) {
      previous.frames.push(...event.frames);
    } else {
      merged.push({ frames: [...event.frames] });
    }
  }

  return merged;
}

function summarizeDraftEvent(frames: readonly AudioEvidenceFrame[], config: ObservedEventSegmenterConfig): ObservedMusicEvent {
  const first = frames[0];
  const last = frames[frames.length - 1];
  const endTime = last.timestamp + Math.max(1, last.deltaMs ?? inferFrameMs(frames));
  const durationMs = Math.max(0, endTime - first.timestamp);
  const distribution = aggregateChordDistribution(frames);
  const representative = distribution[0]?.chord ?? "unknown";
  const confidence = distribution[0]?.confidence ?? 0;
  const meanChroma = aggregateChroma(frames);
  const eventType = classifyEvent(frames, confidence, config);

  return {
    startTime: first.timestamp,
    endTime,
    durationMs,
    eventType,
    chordDistribution: distribution,
    topCandidates: distribution.slice(0, 5).map((item) => ({
      chord: item.chord,
      score: item.score,
      confidence: item.confidence,
    })),
    representativeChord: eventType === "chord" ? representative : "unknown",
    representativeChroma: meanChroma,
    confidence,
    onsetStrength: Math.max(...frames.map((frame) => frame.onsetStrength)),
    meanOnsetStrength: average(frames.map((frame) => frame.onsetStrength)),
    maxChromaDelta: Math.max(...frames.map((frame) => frame.chromaDelta)),
    meanChromaDelta: average(frames.map((frame) => frame.chromaDelta)),
    maxSpectralFlux: Math.max(...frames.map((frame) => frame.spectralFlux)),
    meanSpectralFlux: average(frames.map((frame) => frame.spectralFlux)),
    meanRms: average(frames.map((frame) => frame.rms)),
    maxRms: Math.max(...frames.map((frame) => frame.rms)),
    frameCount: frames.length,
  };
}

function classifyFrame(frame: AudioEvidenceFrame, config: ObservedEventSegmenterConfig): ObservedMusicEventType {
  if (frame.rms < config.silenceRmsThreshold || frame.candidate === "unknown") return "silence";
  if (frame.confidence < config.uncertainConfidenceThreshold) return "uncertain";
  return "chord";
}

function classifyEvent(
  frames: readonly AudioEvidenceFrame[],
  confidence: number,
  config: ObservedEventSegmenterConfig,
): ObservedMusicEventType {
  const silenceFrames = frames.filter((frame) => classifyFrame(frame, config) === "silence").length;
  if (silenceFrames / frames.length >= 0.65) return "silence";
  if (confidence < config.candidateDominanceRatio) return "uncertain";
  return "chord";
}

function aggregateChordDistribution(frames: readonly AudioEvidenceFrame[]): ObservedChordDistributionItem[] {
  const scores = new Map<SupportedChord, number>();
  for (const frame of frames) {
    for (const [chord, score] of Object.entries(frame.scores)) {
      scores.set(chord, (scores.get(chord) ?? 0) + (score ?? 0));
    }
  }

  const total = Array.from(scores.values()).reduce((sum, value) => sum + value, 0);
  return Array.from(scores.entries())
    .map(([chord, score]) => ({
      chord,
      score: score / Math.max(1, frames.length),
      confidence: total > 0 ? score / total : 0,
    }))
    .sort((a, b) => b.score - a.score);
}

function aggregateChroma(frames: readonly AudioEvidenceFrame[]) {
  const length = frames[0]?.chroma.length ?? 12;
  const chroma = Array.from({ length }, () => 0);
  for (const frame of frames) {
    for (let index = 0; index < length; index += 1) {
      chroma[index] += frame.chroma[index] ?? 0;
    }
  }
  return chroma.map((value) => value / Math.max(1, frames.length));
}

function countRecentCandidateFrames(frames: readonly AudioEvidenceFrame[], candidate: SupportedChord) {
  let count = 0;
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    if (frames[index].candidate !== candidate) break;
    count += 1;
  }
  return count;
}

function countFalseSplits(
  events: readonly ObservedMusicEvent[],
  truth: readonly GroundTruthSegment[],
  getExpectedChord: (timelineIndex: number) => SupportedChord | null,
) {
  let count = 0;
  for (const segment of truth) {
    const expectedChord = getExpectedChord(segment.timelineIndex);
    const overlaps = events.filter((event) =>
      event.eventType === "chord" &&
      event.representativeChord === expectedChord &&
      overlapMs(event.startTime, event.endTime, segment.startMs, segment.endMs) > 0
    );
    if (overlaps.length > 1) count += overlaps.length - 1;
  }
  return count;
}

function countFalseMerges(events: readonly ObservedMusicEvent[], truth: readonly GroundTruthSegment[]) {
  return events.filter((event) => {
    if (event.eventType !== "chord") return false;
    const overlapped = truth.filter((segment) => overlapMs(event.startTime, event.endTime, segment.startMs, segment.endMs) > 0);
    return new Set(overlapped.map((segment) => segment.timelineIndex)).size > 1;
  }).length;
}

function countRepeatedChordMatches(
  events: readonly ObservedMusicEvent[],
  truth: readonly GroundTruthSegment[],
  getExpectedChord: (timelineIndex: number) => SupportedChord | null,
) {
  let matches = 0;
  let misses = 0;
  for (let index = 1; index < truth.length; index += 1) {
    const previousChord = getExpectedChord(truth[index - 1].timelineIndex);
    const currentChord = getExpectedChord(truth[index].timelineIndex);
    if (!previousChord || previousChord !== currentChord) continue;
    const eventExists = events.some((event) =>
      event.eventType === "chord" &&
      event.representativeChord === currentChord &&
      overlapMs(event.startTime, event.endTime, truth[index].startMs, truth[index].endMs) > 0
    );
    if (eventExists) matches += 1;
    else misses += 1;
  }
  return { matches, misses };
}

function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function inferFrameMs(frames: readonly AudioEvidenceFrame[]) {
  if (frames.length < 2) return 150;
  return Math.max(1, frames[frames.length - 1].timestamp - frames[frames.length - 2].timestamp);
}

function formatOffset(ms: number) {
  const safeMs = Math.max(0, ms);
  const minutes = Math.floor(safeMs / 60000);
  const seconds = ((safeMs % 60000) / 1000).toFixed(1).padStart(4, "0");
  return `${minutes}:${seconds}`;
}

function average(values: readonly number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function mean(values: readonly number[]) {
  if (values.length === 0) return null;
  return average(values);
}
