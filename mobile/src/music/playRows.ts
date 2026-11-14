import type { AudioEvidenceFrame } from "./audioEvidence";
import type { ChordCandidate, SupportedChord } from "./chordDetection";
import type { ChordTimelineEvent } from "./chordTimeline";
import { getChordMatchFamily } from "./chordTheory.ts";

export type PlayRow = {
  id: string;
  chordEvents: ChordTimelineEvent[];
  chordLineIndex: number;
  associatedLineIndexes: number[];
  startTimelineIndex: number;
  endTimelineIndex: number;
  matchChords: SupportedChord[];
};

export type PlayRowFollowerConfig = {
  minConfidence: number;
  stableFrames: number;
  ambiguousStableFrames: number;
  identicalRowSequenceMatches: number;
  maxUnknownGapFrames: number;
  sameChordBoundaryOnset: number;
};

export type PlayRowFollowerOutput = {
  currentRowIndex: number;
  previousRowIndex: number;
  advanced: boolean;
  status: "listening" | "confirmed" | "advanced" | "unknown";
  candidate: ChordCandidate;
  confidence: number;
  candidateInCurrentRow: boolean;
  candidateInNextRow: boolean;
  stableFrames: number;
  ambiguityReason: "none" | "candidate-in-current-and-next" | "no-next-row";
  advanceDecision: "advance" | "hold-current" | "hold-ambiguous" | "hold-unstable" | "hold-unknown" | "hold-end";
  reason: "current-row" | "next-row" | "ambiguous-current-next" | "unknown" | "end";
};

const DEFAULT_CONFIG: PlayRowFollowerConfig = {
  minConfidence: 0.55,
  stableFrames: 3,
  ambiguousStableFrames: 5,
  identicalRowSequenceMatches: 2,
  maxUnknownGapFrames: 1,
  sameChordBoundaryOnset: 0.55,
};

export function derivePlayRows(events: readonly ChordTimelineEvent[], totalLines?: number): PlayRow[] {
  const groups = new Map<number, Array<{ event: ChordTimelineEvent; timelineIndex: number }>>();

  events.forEach((event, timelineIndex) => {
    const row = groups.get(event.lineIndex) ?? [];
    row.push({ event, timelineIndex });
    groups.set(event.lineIndex, row);
  });

  const chordLineIndexes = Array.from(groups.keys()).sort((a, b) => a - b);

  return chordLineIndexes.map((lineIndex, rowIndex) => {
    const rowItems = (groups.get(lineIndex) ?? []).sort(
      (a, b) => a.event.charIndex - b.event.charIndex || a.timelineIndex - b.timelineIndex,
    );
    const nextChordLineIndex = chordLineIndexes[rowIndex + 1];
    const lastAssociatedLine =
      nextChordLineIndex === undefined
        ? Math.max(lineIndex, (totalLines ?? lineIndex + 1) - 1)
        : Math.max(lineIndex, nextChordLineIndex - 1);
    const associatedLineIndexes = Array.from(
      { length: Math.max(1, lastAssociatedLine - lineIndex + 1) },
      (_, index) => lineIndex + index,
    );
    const chordEvents = rowItems.map((item) => item.event);
    const matchChords = Array.from(new Set(chordEvents.flatMap((event) => event.matchChords)));

    return {
      id: `play-row:${lineIndex}:${rowItems[0]?.timelineIndex ?? rowIndex}`,
      chordEvents,
      chordLineIndex: lineIndex,
      associatedLineIndexes,
      startTimelineIndex: rowItems[0]?.timelineIndex ?? 0,
      endTimelineIndex: rowItems[rowItems.length - 1]?.timelineIndex ?? 0,
      matchChords,
    };
  });
}

export function getPlayRowTimelineIndexes(row: PlayRow | null | undefined) {
  if (!row) return new Set<number>();
  return new Set(Array.from({ length: row.endTimelineIndex - row.startTimelineIndex + 1 }, (_, index) => row.startTimelineIndex + index));
}

function candidateMatchesRow(candidate: ChordCandidate, row: PlayRow | null | undefined) {
  if (!row || candidate === "unknown") return false;
  return row.matchChords.some((expected) => getChordMatchFamily(expected, candidate).weight > 0);
}

function rowsHaveEquivalentChordSet(left: PlayRow | null | undefined, right: PlayRow | null | undefined) {
  if (!left || !right) return false;
  const leftSet = new Set(left.matchChords);
  const rightSet = new Set(right.matchChords);
  if (leftSet.size !== rightSet.size) return false;
  return Array.from(leftSet).every((chord) => rightSet.has(chord));
}

export class PlayRowFollower {
  private readonly rows: readonly PlayRow[];
  private readonly config: PlayRowFollowerConfig;
  private currentRowIndex = 0;
  private lastStableCandidate: ChordCandidate = "unknown";
  private stableCount = 0;
  private identicalRowObservedSequence: SupportedChord[] = [];
  private unknownGapFrames = 0;
  private currentRowProgress = -1;
  private completedRowLastCandidate: SupportedChord | null = null;
  private sameChordBoundaryArmedCandidate: SupportedChord | null = null;

  constructor(rows: readonly PlayRow[], config: Partial<PlayRowFollowerConfig> = {}) {
    if (rows.length === 0) throw new Error("PlayRowFollower requires at least one row.");
    this.rows = rows;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  get currentIndex() {
    return this.currentRowIndex;
  }

  get currentRow() {
    return this.rows[this.currentRowIndex];
  }

  reset() {
    this.resetToRow(0);
  }

  resetToRow(rowIndex: number) {
    const clamped = Math.max(0, Math.min(this.rows.length - 1, rowIndex));
    this.currentRowIndex = clamped;
    this.lastStableCandidate = "unknown";
    this.stableCount = 0;
    this.identicalRowObservedSequence = [];
    this.unknownGapFrames = 0;
    this.currentRowProgress = -1;
    this.completedRowLastCandidate = null;
    this.sameChordBoundaryArmedCandidate = null;
  }

  getExpectedCandidates() {
    const current = this.rows[this.currentRowIndex];
    const next = this.rows[this.currentRowIndex + 1];
    return Array.from(new Set([...(current?.matchChords ?? []), ...(next?.matchChords ?? [])]));
  }

  process(
    evidence: Pick<AudioEvidenceFrame, "candidate" | "confidence" | "topCandidates"> &
      Partial<Pick<AudioEvidenceFrame, "onsetStrength" | "energyRise" | "candidateChanged" | "observedEventDurationMs">>,
  ): PlayRowFollowerOutput {
    const previousRowIndex = this.currentRowIndex;
    const candidate = evidence.candidate;

    if (candidate === "unknown" || evidence.confidence < this.config.minConfidence) {
      if (this.lastStableCandidate !== "unknown" && this.unknownGapFrames < this.config.maxUnknownGapFrames) {
        this.unknownGapFrames += 1;
      } else {
        this.lastStableCandidate = "unknown";
        this.stableCount = 0;
        this.identicalRowObservedSequence = [];
        this.sameChordBoundaryArmedCandidate = null;
        this.unknownGapFrames = 0;
      }
      return this.output(previousRowIndex, false, "unknown", candidate, evidence.confidence, "unknown", false, false, "none", "hold-unknown");
    }

    if (candidate === this.lastStableCandidate) this.stableCount += 1;
    else {
      this.lastStableCandidate = candidate;
      this.stableCount = 1;
      this.sameChordBoundaryArmedCandidate = null;
    }
    this.unknownGapFrames = 0;

    const current = this.rows[this.currentRowIndex];
    const next = this.rows[this.currentRowIndex + 1];
    const matchesCurrent = candidateMatchesRow(candidate, current);
    const matchesNext = candidateMatchesRow(candidate, next);
    const identicalRows = rowsHaveEquivalentChordSet(current, next);
    const stableEnough = this.stableCount >= this.config.stableFrames;
    if (
      matchesCurrent &&
      matchesNext &&
      this.completedRowLastCandidate === candidate &&
      this.hasSameChordBoundaryEvidence(evidence)
    ) {
      this.sameChordBoundaryArmedCandidate = candidate;
    }

    if (matchesCurrent || matchesNext) {
      this.rememberIdenticalRowCandidate(candidate);
    } else {
      this.identicalRowObservedSequence = [];
    }

    if (!next) {
      return this.output(previousRowIndex, false, "confirmed", candidate, evidence.confidence, "end", matchesCurrent, false, "no-next-row", "hold-end");
    }

    if (stableEnough && matchesCurrent) {
      this.advanceCurrentRowProgress(candidate);
    }

    if (matchesNext) {
      const canUseAmbiguousNextStart = matchesCurrent ? this.canUseAmbiguousCandidateAsNextRowStart(candidate, next, evidence) : false;
      const requiredFrames = matchesCurrent && !canUseAmbiguousNextStart ? this.config.ambiguousStableFrames : this.config.stableFrames;
      if (this.stableCount >= requiredFrames) {
        if (matchesCurrent && !canUseAmbiguousNextStart) {
          return this.output(
            previousRowIndex,
            false,
            "confirmed",
            candidate,
            evidence.confidence,
            "ambiguous-current-next",
            matchesCurrent,
            true,
            "candidate-in-current-and-next",
            "hold-ambiguous",
          );
        }
        if (
          matchesCurrent &&
          identicalRows &&
          !canUseAmbiguousNextStart &&
          this.identicalRowObservedSequence.length < this.config.identicalRowSequenceMatches
        ) {
          return this.output(
            previousRowIndex,
            false,
            "confirmed",
            candidate,
            evidence.confidence,
            "ambiguous-current-next",
            matchesCurrent,
            true,
            "candidate-in-current-and-next",
            "hold-ambiguous",
          );
        }
        this.currentRowIndex += 1;
        this.lastStableCandidate = "unknown";
        this.stableCount = 0;
        this.identicalRowObservedSequence = [];
        this.unknownGapFrames = 0;
        this.currentRowProgress = -1;
        this.completedRowLastCandidate = null;
        this.sameChordBoundaryArmedCandidate = null;
        this.advanceCurrentRowProgress(candidate);
        return this.output(
          previousRowIndex,
          true,
          "advanced",
          candidate,
          evidence.confidence,
          matchesCurrent ? "ambiguous-current-next" : "next-row",
          matchesCurrent,
          true,
          matchesCurrent ? "candidate-in-current-and-next" : "none",
          "advance",
        );
      }
      return this.output(
        previousRowIndex,
        false,
        matchesCurrent ? "confirmed" : "listening",
        candidate,
        evidence.confidence,
        matchesCurrent ? "ambiguous-current-next" : "next-row",
        matchesCurrent,
        true,
        matchesCurrent ? "candidate-in-current-and-next" : "none",
        "hold-unstable",
      );
    }

    if (matchesCurrent) {
      return this.output(previousRowIndex, false, "confirmed", candidate, evidence.confidence, "current-row", true, false, "none", "hold-current");
    }

    return this.output(previousRowIndex, false, "listening", candidate, evidence.confidence, "unknown", false, false, "none", "hold-unknown");
  }

  private rememberIdenticalRowCandidate(candidate: ChordCandidate) {
    if (candidate === "unknown") return;
    const previous = this.identicalRowObservedSequence[this.identicalRowObservedSequence.length - 1];
    if (previous === candidate) return;
    this.identicalRowObservedSequence = [...this.identicalRowObservedSequence, candidate].slice(-this.config.identicalRowSequenceMatches);
  }

  private advanceCurrentRowProgress(candidate: ChordCandidate) {
    if (candidate === "unknown") return;
    const row = this.rows[this.currentRowIndex];
    if (!row) return;

    const matchingIndex = row.chordEvents.findIndex(
      (event, eventIndex) => eventIndex > this.currentRowProgress && event.matchChords.some((expected) => getChordMatchFamily(expected, candidate).weight > 0),
    );
    if (matchingIndex === -1) return;

    this.currentRowProgress = matchingIndex;
    if (this.currentRowProgress >= row.chordEvents.length - 1) {
      this.completedRowLastCandidate = candidate;
    }
  }

  private canUseAmbiguousCandidateAsNextRowStart(
    candidate: ChordCandidate,
    next: PlayRow | null | undefined,
    evidence: Partial<Pick<AudioEvidenceFrame, "onsetStrength" | "energyRise" | "candidateChanged" | "observedEventDurationMs">>,
  ) {
    if (candidate === "unknown" || !next) return false;
    if (this.currentRowProgress < this.currentRow.chordEvents.length - 1) return false;
    if (this.completedRowLastCandidate === candidate && this.sameChordBoundaryArmedCandidate !== candidate) return false;

    const firstNextEvent = next.chordEvents[0];
    return firstNextEvent?.matchChords.some((expected) => getChordMatchFamily(expected, candidate).weight > 0) ?? false;
  }

  private hasSameChordBoundaryEvidence(
    evidence: Partial<Pick<AudioEvidenceFrame, "onsetStrength" | "energyRise" | "candidateChanged" | "observedEventDurationMs">>,
  ) {
    if (evidence.candidateChanged) return true;
    if ((evidence.onsetStrength ?? 0) >= this.config.sameChordBoundaryOnset) return true;
    if ((evidence.energyRise ?? 0) >= 0.035) return true;
    return false;
  }

  private output(
    previousRowIndex: number,
    advanced: boolean,
    status: PlayRowFollowerOutput["status"],
    candidate: ChordCandidate,
    confidence: number,
    reason: PlayRowFollowerOutput["reason"],
    candidateInCurrentRow: boolean,
    candidateInNextRow: boolean,
    ambiguityReason: PlayRowFollowerOutput["ambiguityReason"],
    advanceDecision: PlayRowFollowerOutput["advanceDecision"],
  ): PlayRowFollowerOutput {
    return {
      currentRowIndex: this.currentRowIndex,
      previousRowIndex,
      advanced,
      status,
      candidate,
      confidence,
      candidateInCurrentRow,
      candidateInNextRow,
      stableFrames: this.stableCount,
      ambiguityReason,
      advanceDecision,
      reason,
    };
  }
}
