import type { ChordCandidate } from "./chordDetection";
import { getChordMatchFamily } from "./chordTheory.ts";
import type { ChordTimelineEvent } from "./chordTimeline";

export type ManualRepositionRange = {
  visibleStartLine: number;
  visibleEndLine: number;
  candidateStartIndex: number;
  candidateEndIndex: number;
  visibleTimelineIndexes: number[];
  candidateTimelineIndexes: number[];
};

export type ManualRepositionSession = ManualRepositionRange & {
  startedAtMs: number;
  expiresAtMs: number;
  stableCandidate: ChordCandidate;
  stableCount: number;
  bestIndex: number | null;
  lastEvidenceAtMs: number | null;
};

export type ManualRepositionEvidenceResult = {
  matched: boolean;
  committed: boolean;
  timelineIndex: number | null;
  reason: "unknown" | "outside-range" | "stable-match" | "waiting-stability";
  stableCount: number;
  candidateRange: number[];
};

export function isDeliberateManualScroll(input: {
  startY: number;
  endY: number;
  durationMs: number;
  minDistancePx?: number;
  minDurationMs?: number;
}) {
  const minDistancePx = input.minDistancePx ?? 48;
  const minDurationMs = input.minDurationMs ?? 90;
  return Math.abs(input.endY - input.startY) >= minDistancePx && input.durationMs >= minDurationMs;
}

export function getVisibleTimelineRange(input: {
  timeline: readonly ChordTimelineEvent[];
  lineYByLineIndex: ReadonlyMap<number, number>;
  currentScrollY: number;
  viewportHeight: number;
  topPaddingPx?: number;
  bottomPaddingPx?: number;
  marginEvents?: number;
}): ManualRepositionRange | null {
  const topPaddingPx = input.topPaddingPx ?? 24;
  const bottomPaddingPx = input.bottomPaddingPx ?? 48;
  const marginEvents = input.marginEvents ?? 3;
  const visibleTop = input.currentScrollY + topPaddingPx;
  const visibleBottom = input.currentScrollY + Math.max(0, input.viewportHeight - bottomPaddingPx);
  const visibleIndexes: number[] = [];

  for (let index = 0; index < input.timeline.length; index += 1) {
    const event = input.timeline[index];
    const y = input.lineYByLineIndex.get(event.lineIndex);
    if (typeof y !== "number") continue;
    if (y >= visibleTop && y <= visibleBottom) {
      visibleIndexes.push(index);
    }
  }

  if (visibleIndexes.length === 0) return null;

  const first = visibleIndexes[0];
  const last = visibleIndexes[visibleIndexes.length - 1];
  const candidateStartIndex = Math.max(0, first - marginEvents);
  const candidateEndIndex = Math.min(input.timeline.length - 1, last + marginEvents);
  const candidateTimelineIndexes: number[] = [];
  for (let index = candidateStartIndex; index <= candidateEndIndex; index += 1) {
    if (input.timeline[index]?.supportedChord) candidateTimelineIndexes.push(index);
  }

  return {
    visibleStartLine: input.timeline[first].lineIndex,
    visibleEndLine: input.timeline[last].lineIndex,
    candidateStartIndex,
    candidateEndIndex,
    visibleTimelineIndexes: visibleIndexes,
    candidateTimelineIndexes,
  };
}

export function createManualRepositionSession(input: ManualRepositionRange & {
  nowMs: number;
  ttlMs?: number;
}): ManualRepositionSession {
  const ttlMs = input.ttlMs ?? 8000;
  return {
    ...input,
    startedAtMs: input.nowMs,
    expiresAtMs: input.nowMs + ttlMs,
    stableCandidate: "unknown",
    stableCount: 0,
    bestIndex: null,
    lastEvidenceAtMs: null,
  };
}

export function processManualRepositionEvidence(
  session: ManualRepositionSession,
  timeline: readonly ChordTimelineEvent[],
  evidence: {
    candidate: ChordCandidate;
    confidence: number;
    nowMs: number;
  },
  options: {
    minConfidence?: number;
    stableFrames?: number;
  } = {},
): ManualRepositionEvidenceResult {
  const minConfidence = options.minConfidence ?? 0.58;
  const stableFrames = options.stableFrames ?? 3;
  const candidateRange = session.candidateTimelineIndexes;

  if (evidence.candidate === "unknown" || evidence.confidence < minConfidence) {
    session.stableCandidate = "unknown";
    session.stableCount = 0;
    session.bestIndex = null;
    session.lastEvidenceAtMs = evidence.nowMs;
    return { matched: false, committed: false, timelineIndex: null, reason: "unknown", stableCount: 0, candidateRange };
  }

  const bestIndex = findBestCandidateIndex(timeline, candidateRange, evidence.candidate);
  if (bestIndex === null) {
    session.stableCandidate = evidence.candidate;
    session.stableCount = 0;
    session.bestIndex = null;
    session.lastEvidenceAtMs = evidence.nowMs;
    return { matched: false, committed: false, timelineIndex: null, reason: "outside-range", stableCount: 0, candidateRange };
  }

  if (session.stableCandidate === evidence.candidate && session.bestIndex === bestIndex) {
    session.stableCount += 1;
  } else {
    session.stableCandidate = evidence.candidate;
    session.stableCount = 1;
    session.bestIndex = bestIndex;
  }
  session.lastEvidenceAtMs = evidence.nowMs;

  const committed = session.stableCount >= stableFrames;
  return {
    matched: true,
    committed,
    timelineIndex: bestIndex,
    reason: committed ? "stable-match" : "waiting-stability",
    stableCount: session.stableCount,
    candidateRange,
  };
}

function findBestCandidateIndex(
  timeline: readonly ChordTimelineEvent[],
  candidateIndexes: readonly number[],
  candidate: Exclude<ChordCandidate, "unknown">,
) {
  let best: { index: number; weight: number } | null = null;
  for (const index of candidateIndexes) {
    const event = timeline[index];
    if (!event) continue;
    const weight = Math.max(...event.matchChords.map((chord) => getChordMatchFamily(chord, candidate).weight));
    if (weight <= 0) continue;
    if (!best || weight > best.weight || (weight === best.weight && index < best.index)) {
      best = { index, weight };
    }
  }
  return best?.index ?? null;
}
