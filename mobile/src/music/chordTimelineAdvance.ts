import type { ChordCandidate, SupportedChord } from "./chordDetection";
import type { ChordTimelineEvent, DetectableLookahead, DetectableLookaheadEvent } from "./chordTimeline";
import { getChordMatchFamily } from "./chordTheory.ts";

export type TimelineAdvanceConfig = {
  minConfidence: number;
  stableFrames: number;
  cooldownMs: number;
  maxLookaheadEvents: number;
  maxLookaheadLines: number;
  flexibleLookaheadEvents: number;
  flexibleLookaheadLines: number;
  skipConfidenceBonus: number;
  skipStableFramesBonus: number;
  simplifiedConfidenceBonus: number;
  simplifiedStableFramesBonus: number;
  requireUnknownBeforeRepeatedChord: boolean;
};

export type TimelineAdvanceInput = {
  candidate: ChordCandidate;
  confidence: number;
  nowMs: number;
};

export type TimelineAdvanceOutput = {
  index: number;
  status: "unknown" | "listening" | "confirmed" | "advanced";
  advanced: boolean;
  currentEvent: ChordTimelineEvent;
  nextEvent: ChordTimelineEvent | null;
  nextDetectable: DetectableLookahead;
  flexibleLookahead: DetectableLookaheadEvent[];
  expectedChord: SupportedChord;
  nextDetectableChord: SupportedChord | null;
  advancedToSkippedEvents: number;
  stableFrames: number;
};

const DEFAULT_CONFIG: TimelineAdvanceConfig = {
  minConfidence: 0.55,
  stableFrames: 3,
  cooldownMs: 850,
  maxLookaheadEvents: 4,
  maxLookaheadLines: Number.POSITIVE_INFINITY,
  flexibleLookaheadEvents: 4,
  flexibleLookaheadLines: Number.POSITIVE_INFINITY,
  skipConfidenceBonus: 0.08,
  skipStableFramesBonus: 1,
  simplifiedConfidenceBonus: 0.05,
  simplifiedStableFramesBonus: 1,
  requireUnknownBeforeRepeatedChord: true,
};

function findFirstDetectableIndex(events: readonly ChordTimelineEvent[]) {
  return events.findIndex((event) => event.supportedChord !== null);
}

function findNextDetectableEvent(
  events: readonly ChordTimelineEvent[],
  currentIndex: number,
  options: { maxLookaheadEvents: number; maxLookaheadLines: number },
): DetectableLookahead {
  const current = events[currentIndex];
  if (!current) return null;

  for (let index = currentIndex + 1; index < events.length && index <= currentIndex + options.maxLookaheadEvents; index += 1) {
    const event = events[index];
    if (event.lineIndex - current.lineIndex > options.maxLookaheadLines) return null;
    if (!event.supportedChord) continue;

    return {
      event,
      index,
      skippedEvents: index - currentIndex - 1,
    };
  }

  return null;
}

function findDetectableLookaheadEvents(
  events: readonly ChordTimelineEvent[],
  currentIndex: number,
  options: { maxLookaheadEvents: number; maxLookaheadLines: number },
): DetectableLookaheadEvent[] {
  const current = events[currentIndex];
  const lookahead: DetectableLookaheadEvent[] = [];
  if (!current) return lookahead;

  for (let index = currentIndex + 1; index < events.length && index <= currentIndex + options.maxLookaheadEvents; index += 1) {
    const event = events[index];
    if (event.lineIndex - current.lineIndex > options.maxLookaheadLines) break;
    if (!event.supportedChord) continue;

    lookahead.push({
      event,
      index,
      skippedEvents: index - currentIndex - 1,
    });
  }

  return lookahead;
}

export class ChordTimelineAdvanceMachine {
  private readonly events: readonly ChordTimelineEvent[];
  private readonly config: TimelineAdvanceConfig;
  private index: number;
  private lastStableCandidate: ChordCandidate = "unknown";
  private stableCount = 0;
  private lastAdvanceAt = -Infinity;
  private lastCurrentConfirmAt = -Infinity;
  private hasConfirmedCurrent = false;
  private repeatedChordArmed = false;

  constructor(events: readonly ChordTimelineEvent[], config: Partial<TimelineAdvanceConfig> = DEFAULT_CONFIG) {
    const firstDetectableIndex = findFirstDetectableIndex(events);
    if (firstDetectableIndex < 0) {
      throw new Error("Chord timeline must include at least one detectable chord.");
    }

    this.events = events;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.index = firstDetectableIndex;
  }

  get currentIndex() {
    return this.index;
  }

  get currentEvent() {
    return this.events[this.index];
  }

  getExpectedCandidates() {
    const current = this.currentEvent;
    const candidates = [
      ...current.matchChords,
      ...this.getFlexibleLookahead().flatMap((lookahead) => lookahead.event.matchChords),
    ].filter((chord): chord is SupportedChord => chord !== null && chord !== undefined);

    return Array.from(new Set(candidates));
  }

  reset() {
    const firstDetectableIndex = findFirstDetectableIndex(this.events);
    this.index = firstDetectableIndex < 0 ? 0 : firstDetectableIndex;
    this.lastStableCandidate = "unknown";
    this.stableCount = 0;
    this.lastAdvanceAt = -Infinity;
    this.lastCurrentConfirmAt = -Infinity;
    this.hasConfirmedCurrent = false;
    this.repeatedChordArmed = false;
  }

  process(input: TimelineAdvanceInput): TimelineAdvanceOutput {
    const current = this.currentEvent;
    const expected = current.supportedChord;
    if (!expected) throw new Error("Current timeline event is not detectable.");

    const nextDetectable = this.getNextDetectable();
    const nextDetectableChord = nextDetectable?.event.supportedChord ?? null;
    const flexibleLookahead = this.getFlexibleLookahead();
    const candidate = input.confidence >= this.config.minConfidence ? input.candidate : "unknown";

    if (candidate === "unknown") {
      if (this.hasConfirmedCurrent && nextDetectable && this.getMatch(expected, nextDetectable.event).kind !== "different") {
        this.repeatedChordArmed = true;
      }
      this.lastStableCandidate = "unknown";
      this.stableCount = 0;
      return this.output("unknown", false);
    }

    if (candidate === this.lastStableCandidate) {
      this.stableCount += 1;
    } else {
      this.lastStableCandidate = candidate;
      this.stableCount = 1;
    }

    if (this.stableCount < this.config.stableFrames) {
      return this.output("listening", false);
    }

    const matchingLookahead =
      flexibleLookahead.find((lookahead) => this.getMatch(candidate, lookahead.event).kind !== "different") ?? null;
    const matchingKind = matchingLookahead ? this.getMatch(candidate, matchingLookahead.event).kind : "different";
    const repeatedChord =
      matchingLookahead !== null &&
      this.getMatch(candidate, matchingLookahead.event).kind !== "different" &&
      this.getMatch(candidate, current).kind !== "different";
    const requiredConfidence = matchingLookahead
      ? this.requiredConfidenceForSkip(matchingLookahead.skippedEvents, matchingKind)
      : Infinity;
    const requiredStableFrames = matchingLookahead
      ? this.requiredStableFramesForSkip(matchingLookahead.skippedEvents, matchingKind)
      : Infinity;
    const canAdvance =
      matchingLookahead !== null &&
      this.hasConfirmedCurrent &&
      input.confidence >= requiredConfidence &&
      this.stableCount >= requiredStableFrames &&
      input.nowMs - this.lastAdvanceAt >= this.config.cooldownMs &&
      (!repeatedChord || !this.config.requireUnknownBeforeRepeatedChord || this.repeatedChordArmed);

    if (canAdvance) {
      this.index = matchingLookahead.index;
      this.lastAdvanceAt = input.nowMs;
      this.lastCurrentConfirmAt = input.nowMs;
      this.hasConfirmedCurrent = true;
      this.repeatedChordArmed = false;
      this.stableCount = 0;
      this.lastStableCandidate = "unknown";
      return this.output("advanced", true, matchingLookahead.skippedEvents);
    }

    if (this.getMatch(candidate, current).kind !== "different") {
      if (!this.hasConfirmedCurrent) {
        this.lastCurrentConfirmAt = input.nowMs;
      }
      this.hasConfirmedCurrent = true;
      return this.output("confirmed", false);
    }

    return this.output("listening", false);
  }

  private getNextDetectable() {
    return findNextDetectableEvent(this.events, this.index, {
      maxLookaheadEvents: this.config.maxLookaheadEvents,
      maxLookaheadLines: this.config.maxLookaheadLines,
    });
  }

  private getFlexibleLookahead() {
    return findDetectableLookaheadEvents(this.events, this.index, {
      maxLookaheadEvents: this.config.flexibleLookaheadEvents,
      maxLookaheadLines: this.config.flexibleLookaheadLines,
    });
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

  private requiredConfidenceForSkip(skippedEvents: number, matchKind: "exact" | "simplified" | "different") {
    const simplifiedBonus = matchKind === "simplified" ? this.config.simplifiedConfidenceBonus : 0;
    return Math.min(0.92, this.config.minConfidence + skippedEvents * this.config.skipConfidenceBonus + simplifiedBonus);
  }

  private requiredStableFramesForSkip(skippedEvents: number, matchKind: "exact" | "simplified" | "different") {
    const simplifiedBonus = matchKind === "simplified" ? this.config.simplifiedStableFramesBonus : 0;
    return this.config.stableFrames + skippedEvents * this.config.skipStableFramesBonus + simplifiedBonus;
  }

  private output(status: TimelineAdvanceOutput["status"], advanced: boolean, advancedToSkippedEvents = 0): TimelineAdvanceOutput {
    const currentEvent = this.currentEvent;
    const nextDetectable = this.getNextDetectable();
    const flexibleLookahead = this.getFlexibleLookahead();
    const expectedChord = currentEvent.supportedChord;
    if (!expectedChord) throw new Error("Current timeline event is not detectable.");

    return {
      index: this.index,
      status,
      advanced,
      currentEvent,
      nextEvent: this.events[this.index + 1] ?? null,
      nextDetectable,
      flexibleLookahead,
      expectedChord,
      nextDetectableChord: nextDetectable?.event.supportedChord ?? null,
      advancedToSkippedEvents,
      stableFrames: this.stableCount,
    };
  }
}
