import type { ChordCandidate, SupportedChord } from "./chordDetection";

export type ChordAdvanceConfig = {
  minConfidence: number;
  stableFrames: number;
  cooldownMs: number;
  requireUnknownBeforeRepeatedChord?: boolean;
};

export type ChordAdvanceInput = {
  candidate: ChordCandidate;
  confidence: number;
  nowMs: number;
};

export type ChordAdvanceOutput = {
  index: number;
  status: "unknown" | "listening" | "confirmed" | "advanced";
  advanced: boolean;
  expected: SupportedChord;
  next: SupportedChord | null;
  stableFrames: number;
};

const DEFAULT_CONFIG: ChordAdvanceConfig = {
  minConfidence: 0.55,
  stableFrames: 3,
  cooldownMs: 850,
  requireUnknownBeforeRepeatedChord: true,
};

export class ChordAdvanceMachine {
  private readonly sequence: readonly SupportedChord[];
  private readonly config: ChordAdvanceConfig;
  private index = 0;
  private lastStableCandidate: ChordCandidate = "unknown";
  private stableCount = 0;
  private lastAdvanceAt = -Infinity;
  private lastCurrentConfirmAt = -Infinity;
  private hasConfirmedCurrent = false;
  private repeatedChordArmed = false;

  constructor(sequence: readonly SupportedChord[], config: Partial<ChordAdvanceConfig> = DEFAULT_CONFIG) {
    if (sequence.length === 0) {
      throw new Error("Chord sequence must not be empty.");
    }
    this.sequence = sequence;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  get currentIndex() {
    return this.index;
  }

  reset() {
    this.index = 0;
    this.lastStableCandidate = "unknown";
    this.stableCount = 0;
    this.lastAdvanceAt = -Infinity;
    this.lastCurrentConfirmAt = -Infinity;
    this.hasConfirmedCurrent = false;
    this.repeatedChordArmed = false;
  }

  process(input: ChordAdvanceInput): ChordAdvanceOutput {
    const expected = this.sequence[this.index];
    const next = this.sequence[this.index + 1] ?? null;
    const candidate =
      input.confidence >= this.config.minConfidence ? input.candidate : "unknown";

    if (candidate === "unknown") {
      if (this.hasConfirmedCurrent && next === expected) {
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

    if (
      candidate === expected &&
      next === expected &&
      this.hasConfirmedCurrent &&
      (!this.config.requireUnknownBeforeRepeatedChord || this.repeatedChordArmed) &&
      input.nowMs - this.lastCurrentConfirmAt >= this.config.cooldownMs
    ) {
      this.index += 1;
      this.lastAdvanceAt = input.nowMs;
      this.lastCurrentConfirmAt = input.nowMs;
      this.hasConfirmedCurrent = true;
      this.repeatedChordArmed = false;
      this.stableCount = 0;
      this.lastStableCandidate = "unknown";
      return this.output("advanced", true);
    }

    if (candidate === expected) {
      if (!this.hasConfirmedCurrent) {
        this.lastCurrentConfirmAt = input.nowMs;
      }
      this.hasConfirmedCurrent = true;
      return this.output("confirmed", false);
    }

    const canAdvance =
      candidate === next &&
      this.hasConfirmedCurrent &&
      input.nowMs - this.lastAdvanceAt >= this.config.cooldownMs;

    if (canAdvance) {
      this.index += 1;
      this.lastAdvanceAt = input.nowMs;
      this.hasConfirmedCurrent = true;
      this.repeatedChordArmed = false;
      this.stableCount = 0;
      this.lastStableCandidate = "unknown";
      return this.output("advanced", true);
    }

    return this.output("listening", false);
  }

  private output(status: ChordAdvanceOutput["status"], advanced: boolean): ChordAdvanceOutput {
    return {
      index: this.index,
      status,
      advanced,
      expected: this.sequence[this.index],
      next: this.sequence[this.index + 1] ?? null,
      stableFrames: this.stableCount,
    };
  }
}
