import type { ChordCandidate, SupportedChord } from "./chordDetection";
import type { ChordTimelineEvent } from "./chordTimeline";
import { getChordMatchFamily, type ChordMatchKind } from "./chordTheory.ts";

export type FollowerMode = "locked" | "reacquiring";

export type ChordPositionFollowerConfig = {
  minConfidence: number;
  stableFrames: number;
  normalLookaheadEvents: number;
  reacquireLookaheadEvents: number;
  boundaryRecoveryLookaheadEvents: number;
  maxAdvanceEventsLocked: number;
  maxAdvanceEventsReacquiring: number;
  skipConfidenceBonus: number;
  simplifiedConfidenceBonus: number;
  wrongEvidenceToReacquire: number;
  reacquireMinMatches: number;
  reacquireCommitScore: number;
  reacquireCommitMargin: number;
  hypothesisBeamSize: number;
  hypothesisSkipPenalty: number;
  hypothesisSimplifiedPenalty: number;
  hypothesisAmbiguityPenalty: number;
  reacquireStableUpdates: number;
  largeRecommitDistance: number;
  largeRecommitMinMatches: number;
  largeRecommitExtraMargin: number;
};

export type ChordPositionFollowerInput = {
  candidate: ChordCandidate;
  confidence: number;
  nowMs: number;
};

export type ChordPositionHypothesis = {
  timelineIndex: number;
  score: number;
  matchedEvents: number;
  skippedEvents: number;
  lastMatchedAt: number;
  path: number[];
};

export type ChordPositionFollowerOutput = {
  committedTimelineIndex: number;
  previousCommittedTimelineIndex: number;
  advanced: boolean;
  mode: FollowerMode;
  status: "unknown" | "listening" | "confirmed" | "advanced" | "reacquiring";
  currentEvent: ChordTimelineEvent;
  bestHypothesisIndex: number | null;
  followConfidence: number;
  scoreMargin: number;
  sequenceAmbiguous: boolean;
  stableFrames: number;
  hypotheses: ChordPositionHypothesis[];
};

const DEFAULT_CONFIG: ChordPositionFollowerConfig = {
  minConfidence: 0.55,
  stableFrames: 3,
  normalLookaheadEvents: 6,
  reacquireLookaheadEvents: 28,
  boundaryRecoveryLookaheadEvents: 3,
  maxAdvanceEventsLocked: 4,
  maxAdvanceEventsReacquiring: 18,
  skipConfidenceBonus: 0.07,
  simplifiedConfidenceBonus: 0.05,
  wrongEvidenceToReacquire: 4,
  reacquireMinMatches: 2,
  reacquireCommitScore: 1.45,
  reacquireCommitMargin: 0.35,
  hypothesisBeamSize: 8,
  hypothesisSkipPenalty: 0.12,
  hypothesisSimplifiedPenalty: 0.16,
  hypothesisAmbiguityPenalty: 0.04,
  reacquireStableUpdates: 2,
  largeRecommitDistance: 8,
  largeRecommitMinMatches: 3,
  largeRecommitExtraMargin: 0.15,
};

function isDevRuntime() {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

function findFirstDetectableIndex(events: readonly ChordTimelineEvent[]) {
  return events.findIndex((event) => event.supportedChord !== null);
}

function unique<T>(values: readonly T[]) {
  return Array.from(new Set(values));
}

export class ChordPositionFollower {
  private readonly events: readonly ChordTimelineEvent[];
  private readonly config: ChordPositionFollowerConfig;
  private committedTimelineIndex: number;
  private mode: FollowerMode = "locked";
  private lastStableCandidate: ChordCandidate = "unknown";
  private stableCount = 0;
  private wrongEvidenceCount = 0;
  private hasConfirmedCurrent = false;
  private repeatedChordArmed = false;
  private hypotheses: ChordPositionHypothesis[] = [];
  private pendingHypothesisIndex: number | null = null;
  private pendingHypothesisPathKey = "";
  private pendingStableUpdates = 0;
  private lastReacquireProcessedCandidate: SupportedChord | null = null;

  constructor(events: readonly ChordTimelineEvent[], config: Partial<ChordPositionFollowerConfig> = {}) {
    const firstDetectableIndex = findFirstDetectableIndex(events);
    if (firstDetectableIndex < 0) {
      throw new Error("Chord timeline must include at least one detectable chord.");
    }

    this.events = events;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.committedTimelineIndex = firstDetectableIndex;
  }

  get currentIndex() {
    return this.committedTimelineIndex;
  }

  get currentEvent() {
    return this.events[this.committedTimelineIndex];
  }

  get currentMode() {
    return this.mode;
  }

  reset() {
    this.committedTimelineIndex = findFirstDetectableIndex(this.events);
    this.resetTrackingState();
  }

  resetToIndex(index: number) {
    const clamped = Math.max(0, Math.min(this.events.length - 1, Math.floor(index)));
    const detectableIndex = this.findNearestDetectableIndex(clamped);
    if (detectableIndex < 0) {
      throw new Error("Chord timeline must include at least one detectable chord.");
    }
    this.committedTimelineIndex = detectableIndex;
    this.resetTrackingState();
  }

  private resetTrackingState() {
    this.mode = "locked";
    this.lastStableCandidate = "unknown";
    this.stableCount = 0;
    this.wrongEvidenceCount = 0;
    this.hasConfirmedCurrent = false;
    this.repeatedChordArmed = false;
    this.hypotheses = [];
    this.resetPendingRecommit();
    this.lastReacquireProcessedCandidate = null;
  }

  private findNearestDetectableIndex(index: number) {
    if (this.events[index]?.supportedChord) return index;
    for (let offset = 1; offset < this.events.length; offset += 1) {
      const forward = index + offset;
      if (this.events[forward]?.supportedChord) return forward;
      const backward = index - offset;
      if (this.events[backward]?.supportedChord) return backward;
    }
    return -1;
  }

  getExpectedCandidates() {
    const lookahead = this.getEffectiveLookaheadEvents(
      this.mode === "locked" ? this.config.normalLookaheadEvents : this.config.reacquireLookaheadEvents,
      this.committedTimelineIndex,
    );
    const end = Math.min(this.events.length - 1, this.committedTimelineIndex + lookahead);
    const candidates: SupportedChord[] = [];

    for (let index = this.committedTimelineIndex; index <= end; index += 1) {
      candidates.push(...this.events[index].matchChords);
    }

    return unique(candidates);
  }

  process(input: ChordPositionFollowerInput): ChordPositionFollowerOutput {
    const previousCommittedTimelineIndex = this.committedTimelineIndex;
    const candidate = input.confidence >= this.config.minConfidence ? input.candidate : "unknown";

    if (candidate === "unknown") {
      const nextMatch = this.findBestFutureMatch(this.currentEvent.supportedChord ?? "", 1);
      if (this.hasConfirmedCurrent && nextMatch && this.getMatch(this.currentEvent.supportedChord ?? "", nextMatch.event).kind !== "different") {
        this.repeatedChordArmed = true;
      }
      this.lastStableCandidate = "unknown";
      this.stableCount = 0;
      this.lastReacquireProcessedCandidate = null;
      return this.output("unknown", false, previousCommittedTimelineIndex);
    }

    if (candidate === this.lastStableCandidate) {
      this.stableCount += 1;
    } else {
      this.lastStableCandidate = candidate;
      this.stableCount = 1;
    }

    if (this.stableCount < this.config.stableFrames) {
      return this.output(this.mode === "locked" ? "listening" : "reacquiring", false, previousCommittedTimelineIndex);
    }

    if (this.mode === "locked") {
      const lockedOutput = this.processLocked(candidate, input.confidence, previousCommittedTimelineIndex);
      if (lockedOutput) return lockedOutput;
    }

    return this.processReacquiring(candidate, input.confidence, input.nowMs, previousCommittedTimelineIndex);
  }

  private processLocked(candidate: SupportedChord, confidence: number, previousCommittedTimelineIndex: number) {
    const current = this.currentEvent;
    const currentMatch = this.getMatch(candidate, current);
    const repeatedFutureMatch = this.findBestFutureMatch(candidate, 1);

    if (
      this.repeatedChordArmed &&
      this.hasConfirmedCurrent &&
      repeatedFutureMatch &&
      this.getMatch(candidate, repeatedFutureMatch.event).kind !== "different"
    ) {
      this.committedTimelineIndex = repeatedFutureMatch.index;
      this.hasConfirmedCurrent = true;
      this.wrongEvidenceCount = 0;
      this.repeatedChordArmed = false;
      this.hypotheses = [];
      this.resetPendingRecommit();
      this.lastStableCandidate = "unknown";
      this.stableCount = 0;
      return this.output("advanced", true, previousCommittedTimelineIndex);
    }

    if (currentMatch.kind !== "different") {
      this.hasConfirmedCurrent = true;
      this.wrongEvidenceCount = 0;
      this.hypotheses = [];
      this.resetPendingRecommit();
      return this.output("confirmed", false, previousCommittedTimelineIndex);
    }

    const futureMatch = this.findBestFutureMatch(candidate, this.config.maxAdvanceEventsLocked);
    if (futureMatch && this.hasConfirmedCurrent) {
      const requiredConfidence = this.requiredConfidence(futureMatch.skippedEvents, futureMatch.match.kind);
      if (confidence >= requiredConfidence) {
        this.committedTimelineIndex = futureMatch.index;
        this.hasConfirmedCurrent = true;
        this.wrongEvidenceCount = 0;
        this.hypotheses = [];
        this.resetPendingRecommit();
        this.lastStableCandidate = "unknown";
        this.stableCount = 0;
        return this.output("advanced", true, previousCommittedTimelineIndex);
      }
    }

    this.wrongEvidenceCount += 1;
    if (this.wrongEvidenceCount >= this.config.wrongEvidenceToReacquire) {
      this.mode = "reacquiring";
      this.hypotheses = [];
      this.resetPendingRecommit();
      return this.output("reacquiring", false, previousCommittedTimelineIndex);
    }

    return this.output("listening", false, previousCommittedTimelineIndex);
  }

  private processReacquiring(
    candidate: SupportedChord,
    confidence: number,
    nowMs: number,
    previousCommittedTimelineIndex: number,
  ) {
    if (candidate !== this.lastReacquireProcessedCandidate || this.hypotheses.length === 0) {
      const observedMatches = this.findFutureMatches(candidate, this.config.maxAdvanceEventsReacquiring);
      const nextHypotheses: ChordPositionHypothesis[] = [];

      for (const match of observedMatches) {
        const ambiguityPenalty = Math.max(0, observedMatches.length - 1) * this.config.hypothesisAmbiguityPenalty;
        nextHypotheses.push({
          timelineIndex: match.index,
          score: this.matchScore(confidence, match.match.kind, match.skippedEvents) - ambiguityPenalty,
          matchedEvents: 1,
          skippedEvents: match.skippedEvents,
          lastMatchedAt: nowMs,
          path: [match.index],
        });
      }

      for (const hypothesis of this.hypotheses) {
        const advancedMatches = this.findFutureMatches(candidate, this.config.maxAdvanceEventsReacquiring, hypothesis.timelineIndex);
        for (const match of advancedMatches) {
          if (match.index <= hypothesis.timelineIndex) continue;
          nextHypotheses.push({
            timelineIndex: match.index,
            score: hypothesis.score + this.matchScore(confidence, match.match.kind, match.index - hypothesis.timelineIndex - 1),
            matchedEvents: hypothesis.matchedEvents + 1,
            skippedEvents: hypothesis.skippedEvents + match.index - hypothesis.timelineIndex - 1,
            lastMatchedAt: nowMs,
            path: [...hypothesis.path, match.index],
          });
        }
      }

      this.hypotheses = this.pruneHypotheses(nextHypotheses);
      this.lastReacquireProcessedCandidate = candidate;
    }

    const best = this.hypotheses[0] ?? null;
    const second = this.hypotheses[1] ?? null;
    const margin = best ? best.score - (second?.score ?? 0) : 0;
    const sequenceAmbiguous = best && second ? this.haveSameObservedSequence(best, second) : false;
    const requiredMargin = this.config.reacquireCommitMargin;
    const requiredMatches = this.config.reacquireMinMatches;
    const distance = best ? best.timelineIndex - this.committedTimelineIndex : 0;
    const isLargeRecommit = distance >= this.config.largeRecommitDistance;
    const requiredMatchesForDistance = isLargeRecommit ? Math.max(requiredMatches, this.config.largeRecommitMinMatches) : requiredMatches;
    const requiredMarginForDistance = isLargeRecommit ? requiredMargin + this.config.largeRecommitExtraMargin : requiredMargin;

    if (best) {
      this.updatePendingRecommit(best);
    } else {
      this.resetPendingRecommit();
    }

    if (
      best &&
      best.timelineIndex > this.committedTimelineIndex &&
      !sequenceAmbiguous &&
      this.pendingStableUpdates >= this.config.reacquireStableUpdates &&
      best.matchedEvents >= requiredMatchesForDistance &&
      best.score >= this.config.reacquireCommitScore &&
      margin >= requiredMarginForDistance
    ) {
      this.logRecommit("commit", {
        fromIndex: this.committedTimelineIndex,
        toIndex: best.timelineIndex,
        distance,
        observedSequence: this.hypothesisSequenceKey(best),
        matchedEvents: best.matchedEvents,
        bestScore: best.score,
        secondScore: second?.score ?? 0,
        scoreMargin: margin,
        sequenceAmbiguous,
        stableUpdates: this.pendingStableUpdates,
        reason: isLargeRecommit ? "large-recommit-confirmed" : "confirmed",
      });
      this.committedTimelineIndex = best.timelineIndex;
      this.mode = "locked";
      this.hasConfirmedCurrent = true;
      this.wrongEvidenceCount = 0;
      this.hypotheses = [];
      this.resetPendingRecommit();
      this.lastStableCandidate = "unknown";
      this.stableCount = 0;
      return this.output("advanced", true, previousCommittedTimelineIndex);
    }

    if (best) {
      this.logRecommit("blocked", {
        fromIndex: this.committedTimelineIndex,
        toIndex: best.timelineIndex,
        distance,
        observedSequence: this.hypothesisSequenceKey(best),
        matchedEvents: best.matchedEvents,
        bestScore: best.score,
        secondScore: second?.score ?? 0,
        scoreMargin: margin,
        sequenceAmbiguous,
        stableUpdates: this.pendingStableUpdates,
        reason: this.getRecommitBlockedReason({
          best,
          sequenceAmbiguous,
          margin,
          requiredMargin: requiredMarginForDistance,
          requiredMatches: requiredMatchesForDistance,
        }),
      });
    }

    return this.output("reacquiring", false, previousCommittedTimelineIndex);
  }

  private findBestFutureMatch(candidate: SupportedChord, maxAdvanceEvents: number) {
    return this.findFutureMatches(candidate, maxAdvanceEvents)[0] ?? null;
  }

  private findFutureMatches(candidate: SupportedChord, maxAdvanceEvents: number, fromIndex = this.committedTimelineIndex) {
    const matches: Array<{ event: ChordTimelineEvent; index: number; skippedEvents: number; match: { kind: ChordMatchKind; weight: number } }> = [];
    const effectiveMaxAdvanceEvents = this.getEffectiveLookaheadEvents(maxAdvanceEvents, fromIndex);
    const end = Math.min(this.events.length - 1, fromIndex + effectiveMaxAdvanceEvents);

    for (let index = fromIndex + 1; index <= end; index += 1) {
      const event = this.events[index];
      if (!event.supportedChord) continue;
      const match = this.getMatch(candidate, event);
      if (match.kind === "different") continue;
      matches.push({ event, index, skippedEvents: index - fromIndex - 1, match });
    }

    return matches.sort((a, b) => {
      const scoreDiff = this.matchScore(1, b.match.kind, b.skippedEvents) - this.matchScore(1, a.match.kind, a.skippedEvents);
      return scoreDiff || a.index - b.index;
    });
  }

  private getEffectiveLookaheadEvents(maxAdvanceEvents: number, fromIndex: number) {
    const fromEvent = this.events[fromIndex];
    if (fromEvent?.boundaryAfter) {
      return Math.min(maxAdvanceEvents, this.config.boundaryRecoveryLookaheadEvents);
    }
    return maxAdvanceEvents;
  }

  private getMatch(candidate: SupportedChord, event: ChordTimelineEvent) {
    return event.matchChords.reduce(
      (best, expectedChord) => {
        const match = getChordMatchFamily(expectedChord, candidate);
        return match.weight > best.weight ? match : best;
      },
      { kind: "different", weight: 0 } as ReturnType<typeof getChordMatchFamily>,
    );
  }

  private requiredConfidence(skippedEvents: number, matchKind: ChordMatchKind) {
    const simplifiedBonus = matchKind === "simplified" ? this.config.simplifiedConfidenceBonus : 0;
    return Math.min(0.93, this.config.minConfidence + skippedEvents * this.config.skipConfidenceBonus + simplifiedBonus);
  }

  private matchScore(confidence: number, matchKind: ChordMatchKind, skippedEvents: number) {
    const simplifiedPenalty = matchKind === "simplified" ? this.config.hypothesisSimplifiedPenalty : 0;
    return confidence - skippedEvents * this.config.hypothesisSkipPenalty - simplifiedPenalty;
  }

  private pruneHypotheses(hypotheses: ChordPositionHypothesis[]) {
    const bestByIndex = new Map<number, ChordPositionHypothesis>();
    for (const hypothesis of hypotheses) {
      const existing = bestByIndex.get(hypothesis.timelineIndex);
      if (!existing || hypothesis.score > existing.score) {
        bestByIndex.set(hypothesis.timelineIndex, hypothesis);
      }
    }

    return Array.from(bestByIndex.values())
      .filter((hypothesis) => hypothesis.timelineIndex > this.committedTimelineIndex)
      .sort((a, b) => b.score - a.score || b.matchedEvents - a.matchedEvents || a.timelineIndex - b.timelineIndex)
      .slice(0, this.config.hypothesisBeamSize);
  }

  private haveSameObservedSequence(a: ChordPositionHypothesis, b: ChordPositionHypothesis) {
    if (a.path.length !== b.path.length || a.path.length < 2) return false;
    return this.hypothesisSequenceKey(a) === this.hypothesisSequenceKey(b);
  }

  private hypothesisSequenceKey(hypothesis: ChordPositionHypothesis) {
    return hypothesis.path
      .map((index) => this.events[index]?.supportedChord ?? this.events[index]?.chord ?? "-")
      .join(">");
  }

  private updatePendingRecommit(best: ChordPositionHypothesis) {
    const pathKey = best.path.join(">");
    if (this.pendingHypothesisIndex === best.timelineIndex) {
      this.pendingStableUpdates += 1;
      this.pendingHypothesisPathKey = pathKey;
      return;
    }

    this.pendingHypothesisIndex = best.timelineIndex;
    this.pendingHypothesisPathKey = pathKey;
    this.pendingStableUpdates = 1;
  }

  private resetPendingRecommit() {
    this.pendingHypothesisIndex = null;
    this.pendingHypothesisPathKey = "";
    this.pendingStableUpdates = 0;
    this.lastReacquireProcessedCandidate = null;
  }

  private getRecommitBlockedReason(input: {
    best: ChordPositionHypothesis;
    sequenceAmbiguous: boolean;
    margin: number;
    requiredMargin: number;
    requiredMatches: number;
  }) {
    if (input.sequenceAmbiguous) return "sequence-ambiguous";
    if (input.margin < input.requiredMargin) return "insufficient-margin";
    if (input.best.matchedEvents < input.requiredMatches || input.best.score < this.config.reacquireCommitScore) {
      return "insufficient-history";
    }
    if (this.pendingStableUpdates < this.config.reacquireStableUpdates) return "unstable-hypothesis";
    return "unknown";
  }

  private logRecommit(kind: "commit" | "blocked", details: {
    fromIndex: number;
    toIndex: number;
    distance: number;
    observedSequence: string;
    matchedEvents: number;
    bestScore: number;
    secondScore: number;
    scoreMargin: number;
    sequenceAmbiguous: boolean;
    stableUpdates: number;
    reason: string;
  }) {
    if (!isDevRuntime()) return;
    console.log(kind === "commit" ? "[follower:recommit]" : "[follower:recommit-blocked]", {
      ...details,
      bestScore: Number(details.bestScore.toFixed(3)),
      secondScore: Number(details.secondScore.toFixed(3)),
      scoreMargin: Number(details.scoreMargin.toFixed(3)),
      timestamp: new Date().toISOString(),
    });
  }

  private output(
    status: ChordPositionFollowerOutput["status"],
    advanced: boolean,
    previousCommittedTimelineIndex: number,
  ): ChordPositionFollowerOutput {
    const best = this.hypotheses[0] ?? null;
    const second = this.hypotheses[1] ?? null;
    const scoreMargin = best ? best.score - (second?.score ?? 0) : 0;
    const sequenceAmbiguous = best && second ? this.haveSameObservedSequence(best, second) : false;
    const followConfidence = this.mode === "locked" ? 1 : Math.max(0, Math.min(1, scoreMargin));

    return {
      committedTimelineIndex: this.committedTimelineIndex,
      previousCommittedTimelineIndex,
      advanced,
      mode: this.mode,
      status,
      currentEvent: this.currentEvent,
      bestHypothesisIndex: best?.timelineIndex ?? null,
      followConfidence,
      scoreMargin,
      sequenceAmbiguous,
      stableFrames: this.stableCount,
      hypotheses: this.hypotheses,
    };
  }
}
