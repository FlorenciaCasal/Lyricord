import type { AudioEvidenceFrame } from "./audioEvidence.ts";
import type { SupportedChord } from "./chordDetection";
import type { ExpectedMusicEvent, ExpectedMusicSequence } from "./expectedMusic.ts";
import { getChordMatchFamily } from "./chordTheory.ts";

export type OnlineChordAlignerMode = "locked" | "uncertain" | "lost";
export type OnlineChordAlignerRegime = "continuity" | "relocalization";

export type OnlineChordAlignerPosition = {
  timelineIndex: number;
  score: number;
  probability: number;
  insertionCount: number;
  sequenceScore: number;
  transitionScore: number;
  continuityScore: number;
  emissionScore: number;
  totalScore: number;
};

export type MusicalTransitionEvidence = {
  strength: number;
  kind: "none" | "sustain" | "attack" | "harmonic-change" | "after-silence";
  supportsNewEvent: boolean;
  energyComponent: number;
  chromaChange: number;
  candidateChanged: boolean;
  repeatedCandidateFrames: number;
};

export type ObservedMusicPhraseEvent = {
  chord: SupportedChord;
  timestamp: number;
  confidence: number;
  transitionEvidence: MusicalTransitionEvidence;
};

export type ObservedMusicPhrase = {
  events: ObservedMusicPhraseEvent[];
  durationMs: number;
  confidence: number;
};

export type OnlineChordAlignerOutput = {
  estimatedTimelineIndex: number;
  committedTimelineIndex: number;
  confidence: number;
  mode: OnlineChordAlignerMode;
  topPositions: OnlineChordAlignerPosition[];
  advanced: boolean;
  evaluatedStates: number;
  transitionEvidence: MusicalTransitionEvidence;
  trackingRegime: OnlineChordAlignerRegime;
  localPlausibility: number;
  localBestScore: number;
  globalBestScore: number;
  evidenceAgainstLocal: number;
  relocalizationReason: string | null;
  insertionActive: boolean;
  consecutiveInsertions: number;
};

export type OnlineChordAlignerConfig = {
  beamSize: number;
  localLookahead: number;
  reacquireLookahead: number;
  initialSearchEvents: number;
  commitConfidence: number;
  commitMargin: number;
  uncertainConfidence: number;
  silencePenalty: number;
  incompatiblePenalty: number;
  stayBonus: number;
  forwardBonus: number;
  skipPenalty: number;
  largeJumpPenalty: number;
  sameChordAdvancePenalty: number;
  sameChordNewAttackBonus: number;
  repeatedChordAdvanceFrames: number;
  globalSearchWhileInitializedPenalty: number;
  earlyAdvanceTempoPenalty: number;
  transitionRequiredPenalty: number;
  observedPhraseSize: number;
  expectedPhraseWindow: number;
  sequenceScoreWeight: number;
  continuityScoreWeight: number;
  localPlausibilityThreshold: number;
  localRecoveryThreshold: number;
  evidenceAgainstLocalToRelocalize: number;
  relocalizationStableEvents: number;
  maxConsecutiveInsertions: number;
  insertionPenalty: number;
  insertionRepeatPenalty: number;
  insertionRecoveryBonus: number;
  localSkipMaxDistance: number;
  localSkipCommitConfidence: number;
  localSkipCommitMargin: number;
  localSkipMinSequenceScore: number;
  useOnsetFeatures: boolean;
  useDurationFeatures: boolean;
  useChromaFluxFeatures: boolean;
  useMultiFrameStability: boolean;
  onsetAdvanceWeight: number;
  lowOnsetAdvancePenalty: number;
  durationStayWeight: number;
  chromaFluxAdvanceWeight: number;
  stabilityEmissionWeight: number;
};

type BeamState = {
  timelineIndex: number;
  score: number;
  insertionCount: number;
  sequenceScore: number;
  transitionScore: number;
  continuityScore: number;
  emissionScore: number;
  totalScore: number;
};

const DEFAULT_CONFIG: OnlineChordAlignerConfig = {
  beamSize: 16,
  localLookahead: 4,
  reacquireLookahead: 16,
  initialSearchEvents: 36,
  commitConfidence: 0.48,
  commitMargin: 0.08,
  uncertainConfidence: 0.28,
  silencePenalty: -0.18,
  incompatiblePenalty: -1.1,
  stayBonus: 0.2,
  forwardBonus: 0.28,
  skipPenalty: 0.22,
  largeJumpPenalty: 1.15,
  sameChordAdvancePenalty: 0.3,
  sameChordNewAttackBonus: 0.38,
  repeatedChordAdvanceFrames: 4,
  globalSearchWhileInitializedPenalty: 1.4,
  earlyAdvanceTempoPenalty: 0.55,
  transitionRequiredPenalty: 0.42,
  observedPhraseSize: 6,
  expectedPhraseWindow: 10,
  sequenceScoreWeight: 1.15,
  continuityScoreWeight: 0.5,
  localPlausibilityThreshold: 0.34,
  localRecoveryThreshold: 0.52,
  evidenceAgainstLocalToRelocalize: 3,
  relocalizationStableEvents: 2,
  maxConsecutiveInsertions: 2,
  insertionPenalty: 0.3,
  insertionRepeatPenalty: 0.22,
  insertionRecoveryBonus: 0.34,
  localSkipMaxDistance: 5,
  localSkipCommitConfidence: 0.17,
  localSkipCommitMargin: 0.02,
  localSkipMinSequenceScore: 0.48,
  useOnsetFeatures: false,
  useDurationFeatures: false,
  useChromaFluxFeatures: false,
  useMultiFrameStability: false,
  onsetAdvanceWeight: 0.28,
  lowOnsetAdvancePenalty: 0.22,
  durationStayWeight: 0.18,
  chromaFluxAdvanceWeight: 0.18,
  stabilityEmissionWeight: 0.16,
};

export class OnlineChordAligner {
  private readonly expected: ExpectedMusicSequence;
  private readonly config: OnlineChordAlignerConfig;
  private beam: BeamState[] = [];
  private committedTimelineIndex = 0;
  private previousEstimatedTimelineIndex = 0;
  private initialized = false;
  private totalEvaluatedStates = 0;
  private previousFrame: AudioEvidenceFrame | null = null;
  private lastCommittedAt: number | null = null;
  private tempoIntervalMs: number | null = null;
  private observedEvents: ObservedMusicPhraseEvent[] = [];
  private sequenceScoreCache = new Map<number, number>();
  private competingScoreCache: Array<{ index: number; score: number }> | null = null;
  private trackingRegime: OnlineChordAlignerRegime = "continuity";
  private evidenceAgainstLocal = 0;
  private relocalizationReason: string | null = null;
  private stableRelocalizationIndex: number | null = null;
  private stableRelocalizationEvents = 0;
  private consecutiveInsertionEvents = 0;
  private lastInsertionChord: SupportedChord | null = null;
  private recentFrames: AudioEvidenceFrame[] = [];

  constructor(expected: ExpectedMusicSequence, config: Partial<OnlineChordAlignerConfig> = {}) {
    if (expected.events.length === 0) {
      throw new Error("Expected music sequence must include at least one event.");
    }
    this.expected = expected;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.reset();
  }

  reset() {
    this.beam = [this.createState(0, 0)];
    this.committedTimelineIndex = 0;
    this.previousEstimatedTimelineIndex = 0;
    this.initialized = false;
    this.totalEvaluatedStates = 0;
    this.previousFrame = null;
    this.lastCommittedAt = null;
    this.tempoIntervalMs = null;
    this.observedEvents = [];
    this.sequenceScoreCache.clear();
    this.competingScoreCache = null;
    this.trackingRegime = "continuity";
    this.evidenceAgainstLocal = 0;
    this.relocalizationReason = null;
    this.stableRelocalizationIndex = null;
    this.stableRelocalizationEvents = 0;
    this.consecutiveInsertionEvents = 0;
    this.lastInsertionChord = null;
    this.recentFrames = [];
  }

  processEvidence(frame: AudioEvidenceFrame): OnlineChordAlignerOutput {
    const previousCommitted = this.committedTimelineIndex;
    const baseTransitionEvidence = detectMusicalTransitionEvidence(frame, this.previousFrame);
    const transitionEvidence = this.enrichTransitionEvidence(frame, baseTransitionEvidence);
    this.updateObservedPhrase(frame, transitionEvidence);
    this.sequenceScoreCache.clear();
    this.competingScoreCache = null;
    const localPlausibility = this.calculateLocalPlausibility(frame);
    this.updateTrackingRegimeBeforeSearch(frame, transitionEvidence, localPlausibility);
    const candidates = this.buildCandidates(frame, transitionEvidence);
    const nextBeam = this.prune(candidates);
    this.beam = nextBeam.length > 0 ? nextBeam : [this.createState(this.committedTimelineIndex, 0)];
    this.initialized = true;

    const positions = this.toPositions(this.beam);
    const best = positions[0];
    const second = positions[1] ?? null;
    const margin = best.probability - (second?.probability ?? 0);
    const distanceFromCommitted = best.timelineIndex - this.committedTimelineIndex;
    const isModerateSkip = distanceFromCommitted > 2;
    const isInitialLocalization = this.relocalizationReason === "initial-localization";
    const hasSequenceSupportForSkip =
      this.observedEvents.length >= 3 &&
      best.sequenceScore >= 0.45 &&
      transitionEvidence.supportsNewEvent;
    const isLargeRelocalization = distanceFromCommitted > this.config.localLookahead;
    const strongCommit =
      best.timelineIndex >= this.committedTimelineIndex &&
      best.probability >= this.config.commitConfidence &&
      margin >= this.config.commitMargin &&
      (!isModerateSkip || isInitialLocalization || hasSequenceSupportForSkip) &&
      (!isLargeRelocalization || this.canCommitRelocalization(best.timelineIndex, transitionEvidence));
    const localSkipCommit = this.canCommitLocalSkipReconciliation(best, margin, frame, transitionEvidence);
    const localContinuityCommit =
      best.timelineIndex > this.committedTimelineIndex &&
      distanceFromCommitted <= Math.min(2, this.config.localLookahead) &&
      transitionEvidence.supportsNewEvent &&
      best.probability >= this.config.uncertainConfidence &&
      margin >= 0.02;
    const shouldCommit = strongCommit || localContinuityCommit || localSkipCommit;

    if (shouldCommit) {
      this.committedTimelineIndex = Math.max(this.committedTimelineIndex, best.timelineIndex);
      if (this.committedTimelineIndex > previousCommitted) {
        this.updateTempoEstimate(frame.timestamp);
      }
    }
    if (this.lastCommittedAt === null && frame.candidate !== "unknown" && this.committedTimelineIndex === 0) {
      this.lastCommittedAt = frame.timestamp;
    }
    const bestInsertionCount = best.insertionCount;
    this.updateInsertionMemory(frame, transitionEvidence, bestInsertionCount);
    this.updateTrackingRegimeAfterSearch(best.timelineIndex, transitionEvidence, shouldCommit);

    const confidence = best.probability;
    const provisionalModerateSkip = isModerateSkip && !shouldCommit;
    const mode: OnlineChordAlignerMode =
      !provisionalModerateSkip && confidence >= this.config.commitConfidence && margin >= this.config.commitMargin
        ? "locked"
        : confidence >= this.config.uncertainConfidence
          ? "uncertain"
          : "lost";

    this.previousEstimatedTimelineIndex = Math.max(this.previousEstimatedTimelineIndex, best.timelineIndex);
    this.previousFrame = frame;
    this.rememberFrame(frame);

    return {
      estimatedTimelineIndex: best.timelineIndex,
      committedTimelineIndex: this.committedTimelineIndex,
      confidence,
      mode,
      topPositions: positions,
      advanced: this.committedTimelineIndex > previousCommitted,
      evaluatedStates: this.totalEvaluatedStates,
      transitionEvidence,
      trackingRegime: this.trackingRegime,
      localPlausibility,
      localBestScore: localPlausibility,
      globalBestScore: best.probability,
      evidenceAgainstLocal: this.evidenceAgainstLocal,
      relocalizationReason: this.relocalizationReason,
      insertionActive: bestInsertionCount > 0,
      consecutiveInsertions: this.consecutiveInsertionEvents,
    };
  }

  private buildCandidates(frame: AudioEvidenceFrame, transitionEvidence: MusicalTransitionEvidence) {
    const next = new Map<number, BeamState>();
    const rawSourceBeam = this.initialized ? this.beam : [this.createState(this.committedTimelineIndex, 0)];
    const sourceBeam = this.getSourceBeamForRegime(rawSourceBeam);
    const globalSearch = !this.initialized || this.trackingRegime === "relocalization";

    for (const state of sourceBeam) {
      if (this.canTreatFrameAsInsertion(state, frame, transitionEvidence)) {
        const sequenceScore = this.sequenceScore(state.timelineIndex);
        const continuityScore = this.continuityScore(state.timelineIndex, state.timelineIndex);
        const transitionScore = this.insertionScore(state, frame, transitionEvidence);
        const score =
          state.score +
          transitionScore +
          sequenceScore * this.config.sequenceScoreWeight +
          continuityScore * this.config.continuityScoreWeight;
        this.addCandidate(next, {
          timelineIndex: state.timelineIndex,
          insertionCount: state.insertionCount + 1,
          score,
          sequenceScore,
          transitionScore,
          continuityScore,
          emissionScore: 0,
          totalScore: score,
        });
      }

      for (const targetIndex of this.getTransitionTargets(state.timelineIndex, frame, transitionEvidence)) {
        const target = this.expected.events[targetIndex];
        const transitionScore = this.transitionScore(state.timelineIndex, targetIndex, frame, transitionEvidence);
        const emissionScore = this.emissionScore(target, frame);
        const sequenceScore = this.sequenceScore(targetIndex);
        const continuityScore = this.continuityScore(state.timelineIndex, targetIndex);
        const insertionRecoveryBonus = state.insertionCount > 0 && targetIndex > state.timelineIndex
          ? this.config.insertionRecoveryBonus
          : 0;
        const score =
          state.score +
          transitionScore +
          emissionScore +
          insertionRecoveryBonus +
          sequenceScore * this.config.sequenceScoreWeight +
          continuityScore * this.config.continuityScoreWeight;
        this.addCandidate(next, {
          timelineIndex: targetIndex,
          insertionCount: 0,
          score,
          sequenceScore,
          transitionScore,
          continuityScore,
          emissionScore,
          totalScore: score,
        });
      }
    }

    if (globalSearch) {
      const searchEnd = Math.min(this.expected.events.length - 1, this.committedTimelineIndex + this.config.initialSearchEvents);
      for (let index = this.committedTimelineIndex; index <= searchEnd; index += 1) {
        const target = this.expected.events[index];
        const distance = index - this.committedTimelineIndex;
        const sequenceScore = this.sequenceScore(index);
        const emissionScore = this.emissionScore(target, frame);
        const continuityScore = this.continuityScore(this.committedTimelineIndex, index);
        const score =
          emissionScore +
          sequenceScore * this.config.sequenceScoreWeight +
          continuityScore * this.config.continuityScoreWeight -
          distance * 0.12 -
          (distance > this.config.localLookahead ? 0.85 : 0) -
          (this.initialized ? this.config.globalSearchWhileInitializedPenalty : 0);
        this.addCandidate(next, {
          timelineIndex: index,
          insertionCount: 0,
          score,
          sequenceScore,
          transitionScore: 0,
          continuityScore,
          emissionScore,
          totalScore: score,
        });
      }
    }

    this.totalEvaluatedStates = next.size;
    return Array.from(next.values());
  }

  private getTransitionTargets(
    fromIndex: number,
    frame: AudioEvidenceFrame,
    transitionEvidence: MusicalTransitionEvidence,
  ) {
    const maxAdvance = frame.candidate === "unknown"
      ? 0
      : this.trackingRegime === "relocalization" && transitionEvidence.supportsNewEvent
        ? this.config.reacquireLookahead
        : this.config.localLookahead;
    const end = Math.min(this.expected.events.length - 1, fromIndex + maxAdvance);
    const targets: number[] = [];
    for (let index = fromIndex; index <= end; index += 1) {
      targets.push(index);
    }
    return targets;
  }

  private getSourceBeamForRegime(sourceBeam: readonly BeamState[]) {
    if (!this.initialized || this.trackingRegime === "relocalization") return sourceBeam;

    const maxUncommittedLead = 2;
    const filtered = sourceBeam.filter((state) =>
      state.timelineIndex - this.committedTimelineIndex <= maxUncommittedLead ||
      state.insertionCount > 0
    );
    return filtered.length > 0 ? filtered : [this.createState(this.committedTimelineIndex, 0)];
  }

  private transitionScore(
    fromIndex: number,
    toIndex: number,
    frame: AudioEvidenceFrame,
    transitionEvidence: MusicalTransitionEvidence,
  ) {
    const distance = toIndex - fromIndex;
    const from = this.expected.events[fromIndex];
    const to = this.expected.events[toIndex];

    if (distance === 0) {
      return this.config.stayBonus + (1 - transitionEvidence.strength) * 0.18 + this.temporalStayScore(frame);
    }

    let score = this.config.forwardBonus - Math.max(0, distance - 1) * this.config.skipPenalty;
    if (distance > this.config.localLookahead) score -= this.config.largeJumpPenalty;
    if (from?.boundaryAfter) score += 0.25;

    if (!transitionEvidence.supportsNewEvent) {
      score -= this.config.transitionRequiredPenalty + Math.max(0, distance - 1) * 0.16;
    } else {
      score += transitionEvidence.strength * 0.24;
    }

    score += this.temporalAdvanceScore(frame, distance);

    score -= this.tempoPenalty(frame, distance);

    if (
      from &&
      to &&
      from.normalizedChord === to.normalizedChord
    ) {
      if (
        transitionEvidence.supportsNewEvent &&
        this.hasRepeatedChordAttackEvidence(frame) &&
        this.hasEstablishedCurrentEvent(frame)
      ) {
        score += this.config.sameChordNewAttackBonus;
      } else if (
        !transitionEvidence.supportsNewEvent ||
        frame.repeatedCandidateFrames < this.config.repeatedChordAdvanceFrames
      ) {
        score -= this.config.sameChordAdvancePenalty;
      }
    }

    return score;
  }

  private emissionScore(event: ExpectedMusicEvent, frame: AudioEvidenceFrame) {
    if (frame.candidate === "unknown" || frame.rms < 0.006) {
      return this.config.silencePenalty;
    }

    const scoreFromScores = this.bestScoreFromEvidenceScores(event, frame);
    const scoreFromCandidate = this.scoreCandidateAgainstEvent(frame.candidate, event) * frame.confidence;
    const scoreFromTop = frame.topCandidates.reduce(
      (best, candidate) => Math.max(best, this.scoreCandidateAgainstEvent(candidate.chord, event) * candidate.confidence),
      0,
    );
    const acousticScore = Math.max(scoreFromScores, scoreFromCandidate, scoreFromTop);

    if (acousticScore <= 0) return this.config.incompatiblePenalty;

    const onsetLikeBonus = frame.candidateChanged || frame.energyRise > 0.02 ? 0.08 : 0;
    return acousticScore + onsetLikeBonus + this.multiFrameStabilityScore(event, frame);
  }

  private bestScoreFromEvidenceScores(event: ExpectedMusicEvent, frame: AudioEvidenceFrame) {
    let best = 0;
    for (const chord of event.compatibleChords) {
      best = Math.max(best, frame.scores[chord] ?? 0);
    }
    return best;
  }

  private scoreCandidateAgainstEvent(candidate: SupportedChord, event: ExpectedMusicEvent) {
    let best = 0;
    for (const expectedChord of event.compatibleChords) {
      best = Math.max(best, getChordMatchFamily(expectedChord, candidate).weight);
    }
    return best;
  }

  private addCandidate(candidates: Map<number, BeamState>, candidate: BeamState) {
    if (candidate.timelineIndex < this.committedTimelineIndex) return;
    const key = candidate.timelineIndex * (this.config.maxConsecutiveInsertions + 1) + candidate.insertionCount;
    const previous = candidates.get(key);
    if (!previous || candidate.score > previous.score) {
      candidates.set(key, candidate);
    }
  }

  private prune(candidates: readonly BeamState[]) {
    const sorted = [...candidates]
      .filter((candidate) => Number.isFinite(candidate.score))
      .sort((a, b) => b.score - a.score || a.timelineIndex - b.timelineIndex)
      .slice(0, this.config.beamSize);
    const maxScore = sorted[0]?.score ?? 0;
    return sorted.map((candidate) => ({ ...candidate, score: candidate.score - maxScore }));
  }

  private toPositions(beam: readonly BeamState[]): OnlineChordAlignerPosition[] {
    const expScores = beam.map((state) => Math.exp(state.score));
    const total = expScores.reduce((sum, value) => sum + value, 0) || 1;
    return beam.map((state, index) => ({
      timelineIndex: state.timelineIndex,
      score: state.score,
      probability: expScores[index] / total,
      insertionCount: state.insertionCount,
      sequenceScore: state.sequenceScore,
      transitionScore: state.transitionScore,
      continuityScore: state.continuityScore,
      emissionScore: state.emissionScore,
      totalScore: state.totalScore,
    }));
  }

  private tempoPenalty(frame: AudioEvidenceFrame, distance: number) {
    if (distance === 0 || this.lastCommittedAt === null || this.tempoIntervalMs === null) return 0;

    const elapsed = frame.timestamp - this.lastCommittedAt;
    const tooEarlyMs = this.tempoIntervalMs * 0.45;
    if (elapsed >= tooEarlyMs) return 0;

    const earlyRatio = 1 - Math.max(0, elapsed) / Math.max(1, tooEarlyMs);
    return this.config.earlyAdvanceTempoPenalty * earlyRatio * Math.min(2, distance);
  }

  private updateTempoEstimate(timestamp: number) {
    if (this.lastCommittedAt !== null) {
      const interval = timestamp - this.lastCommittedAt;
      if (interval > 0) {
        this.tempoIntervalMs = this.tempoIntervalMs === null
          ? interval
          : this.tempoIntervalMs * 0.75 + interval * 0.25;
      }
    }
    this.lastCommittedAt = timestamp;
  }

  private hasEstablishedCurrentEvent(frame: AudioEvidenceFrame) {
    if (this.lastCommittedAt === null) return false;
    return frame.timestamp - this.lastCommittedAt >= 250;
  }

  private createState(timelineIndex: number, score: number): BeamState {
    return {
      timelineIndex,
      score,
      insertionCount: 0,
      sequenceScore: 0,
      transitionScore: 0,
      continuityScore: 0,
      emissionScore: 0,
      totalScore: score,
    };
  }

  private canTreatFrameAsInsertion(
    state: BeamState,
    frame: AudioEvidenceFrame,
    transitionEvidence: MusicalTransitionEvidence,
  ) {
    if (this.trackingRegime !== "continuity") return false;
    if (frame.candidate === "unknown" || frame.rms < 0.006) return false;
    if (!transitionEvidence.supportsNewEvent) return false;
    if (state.insertionCount >= this.config.maxConsecutiveInsertions) return false;

    const end = Math.min(this.expected.events.length - 1, state.timelineIndex + 1);
    for (let index = state.timelineIndex; index <= end; index += 1) {
      if (this.scoreCandidateAgainstEvent(frame.candidate, this.expected.events[index]) > 0) {
        return false;
      }
    }

    return true;
  }

  private insertionScore(
    state: BeamState,
    frame: AudioEvidenceFrame,
    transitionEvidence: MusicalTransitionEvidence,
  ) {
    return (
      -this.config.insertionPenalty -
      state.insertionCount * this.config.insertionRepeatPenalty +
      transitionEvidence.strength * 0.12 +
      frame.confidence * 0.08
    );
  }

  private updateInsertionMemory(
    frame: AudioEvidenceFrame,
    transitionEvidence: MusicalTransitionEvidence,
    activeInsertionCount: number,
  ) {
    if (activeInsertionCount > 0 && frame.candidate !== "unknown" && transitionEvidence.supportsNewEvent) {
      if (this.lastInsertionChord !== frame.candidate) {
        this.consecutiveInsertionEvents += 1;
        this.lastInsertionChord = frame.candidate;
      }
      return;
    }

    if (activeInsertionCount === 0 && frame.candidate !== "unknown" && transitionEvidence.supportsNewEvent) {
      this.consecutiveInsertionEvents = 0;
      this.lastInsertionChord = null;
    }
  }

  private updateObservedPhrase(frame: AudioEvidenceFrame, transitionEvidence: MusicalTransitionEvidence) {
    if (frame.candidate === "unknown" || frame.rms < 0.006) return;

    const previous = this.observedEvents[this.observedEvents.length - 1] ?? null;
    const shouldAppend =
      !previous ||
      transitionEvidence.supportsNewEvent ||
      previous.chord !== frame.candidate;

    if (!shouldAppend) return;

    if (
      previous &&
      previous.chord === frame.candidate &&
      !transitionEvidence.supportsNewEvent
    ) {
      return;
    }

    this.observedEvents.push({
      chord: frame.candidate,
      timestamp: frame.timestamp,
      confidence: frame.confidence,
      transitionEvidence,
    });

    if (this.observedEvents.length > this.config.observedPhraseSize) {
      this.observedEvents = this.observedEvents.slice(-this.config.observedPhraseSize);
    }
  }

  private getObservedPhrase(): ObservedMusicPhrase {
    const events = [...this.observedEvents];
    const first = events[0];
    const last = events[events.length - 1];
    return {
      events,
      durationMs: first && last ? Math.max(0, last.timestamp - first.timestamp) : 0,
      confidence: events.length === 0
        ? 0
        : events.reduce((sum, event) => sum + event.confidence, 0) / events.length,
    };
  }

  private sequenceScore(targetIndex: number) {
    const observed = this.getObservedPhrase();
    if (observed.events.length === 0) return 0;
    const cached = this.sequenceScoreCache.get(targetIndex);
    if (cached !== undefined) return cached;

    const start = Math.max(0, targetIndex - this.config.expectedPhraseWindow + 1);
    const expected = this.expected.events.slice(start, targetIndex + 1);
    const raw = scoreObservedPhraseAgainstExpected(observed, expected);
    const ambiguityPenalty = this.sequenceAmbiguityPenalty(targetIndex, observed, raw);
    const result = raw - ambiguityPenalty;
    this.sequenceScoreCache.set(targetIndex, result);
    return result;
  }

  private sequenceAmbiguityPenalty(targetIndex: number, observed: ObservedMusicPhrase, score: number) {
    if (observed.events.length < 3 || score < 0.35) return 0;

    const competing = this.findCompetingSequenceScores(targetIndex, observed)
      .filter((item) => Math.abs(item.index - targetIndex) > this.config.localLookahead);
    const bestCompetitor = competing[0];
    if (!bestCompetitor) return 0;

    const margin = score - bestCompetitor.score;
    if (margin > 0.12) return 0;

    const localDistance = Math.abs(targetIndex - this.committedTimelineIndex);
    return localDistance <= this.config.localLookahead ? 0 : 0.18 - Math.max(0, margin);
  }

  private findCompetingSequenceScores(targetIndex: number, observed: ObservedMusicPhrase) {
    if (this.competingScoreCache) return this.competingScoreCache;
    const searchEnd = Math.min(this.expected.events.length - 1, this.committedTimelineIndex + this.config.initialSearchEvents);
    const scores: Array<{ index: number; score: number }> = [];
    for (let index = this.committedTimelineIndex; index <= searchEnd; index += 1) {
      const start = Math.max(0, index - this.config.expectedPhraseWindow + 1);
      scores.push({
        index,
        score: scoreObservedPhraseAgainstExpected(observed, this.expected.events.slice(start, index + 1)),
      });
    }
    this.competingScoreCache = scores.sort((a, b) => b.score - a.score);
    return this.competingScoreCache;
  }

  private continuityScore(fromIndex: number, toIndex: number) {
    const distanceFromCommitted = toIndex - this.committedTimelineIndex;
    if (distanceFromCommitted < 0) return -1;
    if (distanceFromCommitted <= this.config.localLookahead) return 0.22 - distanceFromCommitted * 0.035;
    const penalty = this.trackingRegime === "continuity" ? 0.95 : 0.55;
    return -Math.min(penalty, distanceFromCommitted * 0.035);
  }

  private calculateLocalPlausibility(frame: AudioEvidenceFrame) {
    if (frame.candidate === "unknown" || frame.rms < 0.006) return 0.5;

    const end = Math.min(this.expected.events.length - 1, this.committedTimelineIndex + 1);
    let best = Number.NEGATIVE_INFINITY;
    for (let index = this.committedTimelineIndex; index <= end; index += 1) {
      const event = this.expected.events[index];
      const emission = this.emissionScore(event, frame);
      const sequence = this.sequenceScore(index);
      best = Math.max(best, emission * 0.55 + sequence * 0.45);
    }

    return clamp01((best + 0.25) / 1.35);
  }

  private updateTrackingRegimeBeforeSearch(
    frame: AudioEvidenceFrame,
    transitionEvidence: MusicalTransitionEvidence,
    localPlausibility: number,
  ) {
    if (!this.initialized) {
      this.trackingRegime = "relocalization";
      this.relocalizationReason = "initial-localization";
      return;
    }

    if (transitionEvidence.supportsNewEvent && frame.candidate !== "unknown") {
      if (
        localPlausibility < this.config.localPlausibilityThreshold &&
        this.consecutiveInsertionEvents < this.config.maxConsecutiveInsertions &&
        this.frameIsIncompatibleWithLocalWindow(frame)
      ) {
        this.consecutiveInsertionEvents += 1;
        this.lastInsertionChord = frame.candidate;
        return;
      }

      if (localPlausibility < this.config.localPlausibilityThreshold) {
        this.evidenceAgainstLocal += 1;
      } else if (localPlausibility >= this.config.localRecoveryThreshold) {
        this.evidenceAgainstLocal = Math.max(0, this.evidenceAgainstLocal - 1);
      }
    }

    if (
      this.trackingRegime === "continuity" &&
      this.evidenceAgainstLocal >= this.config.evidenceAgainstLocalToRelocalize
    ) {
      this.trackingRegime = "relocalization";
      this.relocalizationReason = "local-path-implausible";
      this.stableRelocalizationIndex = null;
      this.stableRelocalizationEvents = 0;
    }
  }

  private frameIsIncompatibleWithLocalWindow(frame: AudioEvidenceFrame) {
    if (frame.candidate === "unknown") return false;
    const end = Math.min(this.expected.events.length - 1, this.committedTimelineIndex + this.config.localLookahead);
    for (let index = this.committedTimelineIndex; index <= end; index += 1) {
      if (this.scoreCandidateAgainstEvent(frame.candidate, this.expected.events[index]) > 0) {
        return false;
      }
    }
    return true;
  }

  private updateTrackingRegimeAfterSearch(
    bestTimelineIndex: number,
    transitionEvidence: MusicalTransitionEvidence,
    committed: boolean,
  ) {
    if (this.trackingRegime !== "relocalization") return;

    if (transitionEvidence.supportsNewEvent) {
      if (this.stableRelocalizationIndex === bestTimelineIndex) {
        this.stableRelocalizationEvents += 1;
      } else {
        this.stableRelocalizationIndex = bestTimelineIndex;
        this.stableRelocalizationEvents = 1;
      }
    }

    if (
      committed &&
      bestTimelineIndex === this.committedTimelineIndex &&
      (
        this.relocalizationReason === "initial-localization" ||
        this.stableRelocalizationEvents >= this.config.relocalizationStableEvents
      )
    ) {
      this.trackingRegime = "continuity";
      this.evidenceAgainstLocal = 0;
      this.relocalizationReason = null;
      this.stableRelocalizationIndex = null;
      this.stableRelocalizationEvents = 0;
    }
  }

  private canCommitRelocalization(bestTimelineIndex: number, transitionEvidence: MusicalTransitionEvidence) {
    if (this.trackingRegime !== "relocalization") return false;
    if (!transitionEvidence.supportsNewEvent) return false;

    if (this.stableRelocalizationIndex === bestTimelineIndex) {
      this.stableRelocalizationEvents += 1;
    } else {
      this.stableRelocalizationIndex = bestTimelineIndex;
      this.stableRelocalizationEvents = 1;
    }

    return this.stableRelocalizationEvents >= this.config.relocalizationStableEvents;
  }

  private canCommitLocalSkipReconciliation(
    best: OnlineChordAlignerPosition,
    margin: number,
    frame: AudioEvidenceFrame,
    transitionEvidence: MusicalTransitionEvidence,
  ) {
    if (!this.initialized || this.trackingRegime !== "continuity") return false;
    if (frame.candidate === "unknown" || frame.rms < 0.006) return false;
    if (!transitionEvidence.supportsNewEvent) return false;

    const distance = best.timelineIndex - this.committedTimelineIndex;
    if (distance <= 2 || distance > this.config.localSkipMaxDistance) return false;
    if (best.probability < this.config.localSkipCommitConfidence) return false;
    if (margin < this.config.localSkipCommitMargin) return false;
    if (best.sequenceScore < this.config.localSkipMinSequenceScore) return false;

    const target = this.expected.events[best.timelineIndex];
    if (!target || this.scoreCandidateAgainstEvent(frame.candidate, target) <= 0) return false;

    const observed = this.getObservedPhrase();
    if (observed.events.length < 3) return false;

    const localExpected = this.expected.events.slice(this.committedTimelineIndex, best.timelineIndex + 1);
    const localSequenceScore = scoreObservedPhraseAgainstExpected(observed, localExpected);
    if (localSequenceScore < this.config.localSkipMinSequenceScore) return false;

    const competing = this.findCompetingSequenceScores(best.timelineIndex, observed)
      .filter((item) =>
        item.index !== best.timelineIndex &&
        item.index >= this.committedTimelineIndex &&
        item.index <= this.committedTimelineIndex + this.config.localSkipMaxDistance
      );
    const closeCompetitor = competing.find((item) => item.score >= localSequenceScore - 0.04);
    if (closeCompetitor && Math.abs(closeCompetitor.index - best.timelineIndex) > 1) return false;

    return true;
  }

  private enrichTransitionEvidence(
    frame: AudioEvidenceFrame,
    base: MusicalTransitionEvidence,
  ): MusicalTransitionEvidence {
    if (!this.config.useOnsetFeatures && !this.config.useChromaFluxFeatures) return base;

    const onsetComponent = this.config.useOnsetFeatures ? frame.onsetStrength : 0;
    const fluxComponent = this.config.useChromaFluxFeatures
      ? clamp01(Math.max(frame.chromaDelta / 0.16, frame.spectralFlux / 0.45))
      : 0;
    const strength = clamp01(Math.max(base.strength, onsetComponent * 0.9, fluxComponent * 0.72));
    const supportsNewEvent =
      base.supportsNewEvent ||
      onsetComponent >= 0.48 ||
      fluxComponent >= 0.54;
    const kind: MusicalTransitionEvidence["kind"] = base.kind !== "sustain" || !supportsNewEvent
      ? base.kind
      : onsetComponent >= fluxComponent
        ? "attack"
        : "harmonic-change";

    return {
      ...base,
      strength,
      kind,
      supportsNewEvent,
    };
  }

  private temporalStayScore(frame: AudioEvidenceFrame) {
    let score = 0;
    if (this.config.useOnsetFeatures) {
      score += (1 - frame.onsetStrength) * 0.12;
    }
    if (this.config.useDurationFeatures && frame.candidate !== "unknown") {
      const localDuration = this.tempoIntervalMs ?? 900;
      const durationRatio = clamp01(frame.observedEventDurationMs / Math.max(250, localDuration * 0.8));
      score += durationRatio * this.config.durationStayWeight;
    }
    if (this.config.useChromaFluxFeatures) {
      const calmChroma = 1 - clamp01(Math.max(frame.chromaDelta / 0.16, frame.spectralFlux / 0.45));
      score += calmChroma * 0.08;
    }
    return score;
  }

  private temporalAdvanceScore(frame: AudioEvidenceFrame, distance: number) {
    let score = 0;
    if (this.config.useOnsetFeatures) {
      score += frame.onsetStrength * this.config.onsetAdvanceWeight;
      score -= (1 - frame.onsetStrength) * this.config.lowOnsetAdvancePenalty * Math.min(2, distance);
    }
    if (this.config.useChromaFluxFeatures) {
      const fluxComponent = clamp01(Math.max(frame.chromaDelta / 0.16, frame.spectralFlux / 0.45));
      score += fluxComponent * this.config.chromaFluxAdvanceWeight;
    }
    if (this.config.useDurationFeatures && this.tempoIntervalMs !== null) {
      const minimumTransitionMs = Math.max(220, this.tempoIntervalMs * 0.35);
      if (frame.observedEventDurationMs < minimumTransitionMs && distance > 0) {
        score -= (1 - frame.observedEventDurationMs / minimumTransitionMs) * 0.18 * Math.min(2, distance);
      }
    }
    return score;
  }

  private hasRepeatedChordAttackEvidence(frame: AudioEvidenceFrame) {
    if (!this.config.useOnsetFeatures && !this.config.useChromaFluxFeatures && !this.config.useDurationFeatures) {
      return frame.repeatedCandidateFrames <= 2;
    }
    const onsetEnough = !this.config.useOnsetFeatures || frame.onsetStrength >= 0.42;
    const fluxEnough = !this.config.useChromaFluxFeatures || Math.max(frame.chromaDelta / 0.16, frame.spectralFlux / 0.45) >= 0.35;
    const durationEnough = !this.config.useDurationFeatures || frame.observedEventDurationMs >= 180;
    return onsetEnough && fluxEnough && durationEnough;
  }

  private multiFrameStabilityScore(event: ExpectedMusicEvent, frame: AudioEvidenceFrame) {
    if (!this.config.useMultiFrameStability) return 0;
    const recent = [...this.recentFrames.slice(-2), frame].filter((item) => item.candidate !== "unknown");
    if (recent.length < 2) return 0;
    const compatible = recent.filter((item) =>
      item.candidate !== "unknown" && this.scoreCandidateAgainstEvent(item.candidate, event) > 0
    ).length;
    const stableRatio = compatible / recent.length;
    return stableRatio * this.config.stabilityEmissionWeight;
  }

  private rememberFrame(frame: AudioEvidenceFrame) {
    this.recentFrames.push(frame);
    if (this.recentFrames.length > 6) {
      this.recentFrames = this.recentFrames.slice(-6);
    }
  }
}

export function scoreObservedPhraseAgainstExpected(
  observed: ObservedMusicPhrase,
  expected: readonly ExpectedMusicEvent[],
) {
  if (observed.events.length === 0 || expected.length === 0) return 0;

  const observedEvents = observed.events.slice(-6);
  const rows = observedEvents.length + 1;
  const cols = expected.length + 1;
  const dp = Array.from({ length: rows }, () => Array.from({ length: cols }, () => Number.NEGATIVE_INFINITY));
  dp[0][0] = 0;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const current = dp[row][col];
      if (!Number.isFinite(current)) continue;

      if (row < observedEvents.length && col < expected.length) {
        const match = scoreObservedChordAgainstExpected(observedEvents[row].chord, expected[col]);
        dp[row + 1][col + 1] = Math.max(dp[row + 1][col + 1], current + match);
      }

      if (col < expected.length) {
        const skipPenalty = expected[col].boundaryAfter ? -0.18 : -0.11;
        dp[row][col + 1] = Math.max(dp[row][col + 1], current + skipPenalty);
      }

      if (row < observedEvents.length) {
        dp[row + 1][col] = Math.max(dp[row + 1][col], current - 0.42);
      }
    }
  }

  let best = Number.NEGATIVE_INFINITY;
  for (let col = 0; col < cols; col += 1) {
    best = Math.max(best, dp[observedEvents.length][col]);
  }

  const normalized = best / Math.max(1, observedEvents.length);
  return Math.max(-1, Math.min(1, normalized));
}

function scoreObservedChordAgainstExpected(chord: SupportedChord, expected: ExpectedMusicEvent) {
  let best = 0;
  for (const expectedChord of expected.compatibleChords) {
    best = Math.max(best, getChordMatchFamily(expectedChord, chord).weight);
  }
  return best > 0 ? best : -0.55;
}

export function detectMusicalTransitionEvidence(
  frame: AudioEvidenceFrame,
  previous: AudioEvidenceFrame | null,
): MusicalTransitionEvidence {
  if (frame.candidate === "unknown" || frame.rms < 0.006) {
    return {
      strength: 0,
      kind: "none",
      supportsNewEvent: false,
      energyComponent: 0,
      chromaChange: previous ? calculateChromaChange(frame.chroma, previous.chroma) : 0,
      candidateChanged: false,
      repeatedCandidateFrames: frame.repeatedCandidateFrames,
    };
  }

  const previousWasSilent = !previous || previous.candidate === "unknown" || previous.rms < 0.006;
  const energyComponent = clamp01(Math.max(frame.energyRise, frame.rmsDelta ?? 0) / 0.045);
  const chromaChange = previous ? calculateChromaChange(frame.chroma, previous.chroma) : 0;
  const chromaComponent = clamp01(chromaChange / 0.42);
  const candidateChanged = Boolean(previous && previous.candidate !== frame.candidate);

  const strength = clamp01(Math.max(
    previousWasSilent ? 0.92 : 0,
    candidateChanged ? 0.82 : 0,
    energyComponent * 0.82,
    chromaComponent * 0.72,
  ));

  const supportsNewEvent =
    strength >= 0.34 ||
    previousWasSilent ||
    candidateChanged ||
    (frame.repeatedCandidateFrames <= 2 && energyComponent >= 0.25);

  const kind: MusicalTransitionEvidence["kind"] = previousWasSilent
    ? "after-silence"
    : candidateChanged
      ? "harmonic-change"
      : supportsNewEvent
        ? "attack"
        : "sustain";

  return {
    strength,
    kind,
    supportsNewEvent,
    energyComponent,
    chromaChange,
    candidateChanged,
    repeatedCandidateFrames: frame.repeatedCandidateFrames,
  };
}

function calculateChromaChange(current: readonly number[], previous: readonly number[]) {
  const length = Math.min(current.length, previous.length);
  if (length === 0) return 0;

  let total = 0;
  for (let index = 0; index < length; index += 1) {
    total += Math.abs(current[index] - previous[index]);
  }
  return total / length;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
