import type { AudioEvidenceFrame, AudioEvidenceRecording } from "./audioEvidence.ts";
import { ChordPositionFollower, type ChordPositionFollowerConfig } from "./chordPositionFollower.ts";
import { createExpectedMusicSequenceFromTimeline, type ExpectedMusicSequence } from "./expectedMusic.ts";
import {
  OnlineChordAligner,
  type MusicalTransitionEvidence,
  type OnlineChordAlignerConfig,
  type OnlineChordAlignerPosition,
  type OnlineChordAlignerRegime,
} from "./onlineChordAligner.ts";
import type { ChordTimelineEvent } from "./chordTimeline.ts";

export type GroundTruthSegment = {
  startMs: number;
  endMs: number;
  timelineIndex: number;
};

export type EvaluationEvidenceFrame = AudioEvidenceFrame & {
  groundTruthTimelineIndex?: number;
};

export type EvaluationEvidenceRecording = Omit<AudioEvidenceRecording, "frames"> & {
  frames: EvaluationEvidenceFrame[];
  groundTruth?: {
    segments: GroundTruthSegment[];
  };
};

export type PositionTrackerState = "locked" | "uncertain" | "lost";

export type PositionTrackerOutput = {
  committedTimelineIndex: number;
  estimatedTimelineIndex?: number | null;
  confidence?: number;
  state: PositionTrackerState;
  advanced?: boolean;
  evaluatedStates?: number;
  transitionEvidence?: MusicalTransitionEvidence;
  topPositions?: OnlineChordAlignerPosition[];
  trackingRegime?: OnlineChordAlignerRegime;
  localPlausibility?: number;
  localBestScore?: number;
  globalBestScore?: number;
  evidenceAgainstLocal?: number;
  relocalizationReason?: string | null;
  insertionActive?: boolean;
  consecutiveInsertions?: number;
};

export type PositionTracker = {
  name: string;
  reset: (expected: ExpectedMusicSequence) => void;
  process: (frame: AudioEvidenceFrame) => PositionTrackerOutput;
};

export type EvaluationFrameResult = {
  timestamp: number;
  groundTruthTimelineIndex: number | null;
  committedTimelineIndex: number;
  estimatedTimelineIndex: number | null;
  confidence: number | null;
  error: number | null;
  state: PositionTrackerState;
  advanced: boolean;
  evaluatedStates: number;
  transitionEvidence: MusicalTransitionEvidence | null;
  topPositions: OnlineChordAlignerPosition[];
  trackingRegime: OnlineChordAlignerRegime | null;
  localPlausibility: number | null;
  localBestScore: number | null;
  globalBestScore: number | null;
  evidenceAgainstLocal: number | null;
  relocalizationReason: string | null;
  insertionActive: boolean;
  consecutiveInsertions: number | null;
};

export type VisualPolicyFrameResult = EvaluationFrameResult & {
  displayedTimelineIndex: number;
  displayedError: number | null;
  displayedChanged: boolean;
  displayedJumpDistance: number;
  visualDecision: "hold" | "follow-commit" | "catch-up" | "large-jump-throttled";
};

export type VisualDamageSeverity = "acceptable" | "annoying" | "critical";

export type VisualPolicyMetrics = {
  falseLargeJumpCount: number;
  maxDisplayedJumpDistance: number;
  displayedFreezeDurationMs: number;
  maxDisplayedFreezeDurationMs: number;
  meanDisplayedLagEvents: number | null;
  maxDisplayedLagEvents: number;
  wrongHighlightDurationMs: number;
  meanRecoveryToVisibleSyncMs: number | null;
  maxRecoveryToVisibleSyncMs: number | null;
  catchUpSteps: number;
  backwardsDisplayedMoves: number;
  criticalErrorCount: number;
  annoyingErrorCount: number;
  severity: VisualDamageSeverity;
};

export type VisualPolicyEvaluation = {
  frames: VisualPolicyFrameResult[];
  metrics: VisualPolicyMetrics;
};

export type VisualPolicyOptions = {
  maxImmediateDisplayAdvance: number;
  maxCatchUpAdvance: number;
  catchUpIntervalMs: number;
  largeJumpThresholdEvents: number;
  annoyingFreezeMs: number;
  criticalFreezeMs: number;
  criticalWrongDurationMs: number;
  lockedConfidenceForEstimatedCatchUp: number;
};

export type PositionTrackerMetrics = {
  trackerName: string;
  totalFrames: number;
  framesWithGroundTruth: number;
  correctFrameRatio: number;
  meanAbsoluteEventError: number | null;
  maxAbsoluteEventError: number | null;
  maxDistanceFromGroundTruth: number | null;
  maxIncorrectJumpDistance: number;
  missedExpectedEvents: number;
  backwardsCommits: number;
  incorrectCommits: number;
  prolongedFreezeCount: number;
  meanRecoveryTimeMs: number | null;
  meanFollowLatencyMs: number | null;
  timeInLostOrUncertainMs: number;
  averageEvaluatedStatesPerFrame: number;
  maxEvaluatedStatesPerFrame: number;
};

export type PositionTrackerEvaluation = {
  expected: ExpectedMusicSequence;
  trackerName: string;
  frames: EvaluationFrameResult[];
  metrics: PositionTrackerMetrics;
};

export function evaluatePositionTracker(input: {
  expected: ExpectedMusicSequence;
  evidence: EvaluationEvidenceRecording;
  tracker: PositionTracker;
  options?: {
    freezeThresholdMs?: number;
  };
}): PositionTrackerEvaluation {
  const freezeThresholdMs = input.options?.freezeThresholdMs ?? 900;
  input.tracker.reset(input.expected);

  const frames: EvaluationFrameResult[] = [];
  let previousCommit: number | null = null;
  let previousTimestamp: number | null = null;
  let backwardsCommits = 0;
  let incorrectCommits = 0;
  let maxIncorrectJumpDistance = 0;
  let timeInLostOrUncertainMs = 0;
  let freezeStartedAt: number | null = null;
  let freezeCommitIndex: number | null = null;
  let prolongedFreezeCount = 0;
  let wasIncorrect = false;
  let incorrectStartedAt: number | null = null;
  const recoveryTimes: number[] = [];
  const followLatencies: number[] = [];
  let previousTruth: number | null = null;
  let truthChangedAt: number | null = null;
  const truthSeen = new Map<number, boolean>();

  for (const frame of input.evidence.frames) {
    const output = input.tracker.process(frame);
    const truth = getGroundTruthForFrame(frame, input.evidence.groundTruth?.segments);
    const committed = output.committedTimelineIndex;
    const estimated = output.estimatedTimelineIndex ?? committed;
    const error = truth === null ? null : committed - truth;
    const timestamp = frame.timestamp;
    const deltaMs = previousTimestamp === null ? 0 : Math.max(0, timestamp - previousTimestamp);

    if (output.state !== "locked") timeInLostOrUncertainMs += deltaMs;

    if (previousCommit !== null && committed < previousCommit) {
      backwardsCommits += 1;
    }

    if (previousCommit !== null && committed !== previousCommit && truth !== null && committed !== truth) {
      incorrectCommits += 1;
      maxIncorrectJumpDistance = Math.max(maxIncorrectJumpDistance, Math.abs(committed - previousCommit));
    }

    if (truth !== null && previousTruth !== null && truth !== previousTruth) {
      truthChangedAt = timestamp;
    }
    if (truth !== null && !truthSeen.has(truth)) {
      truthSeen.set(truth, false);
    }
    if (truth !== null && committed === truth) {
      truthSeen.set(truth, true);
    }
    if (truth !== null && truthChangedAt !== null && committed === truth) {
      followLatencies.push(timestamp - truthChangedAt);
      truthChangedAt = null;
    }

    const currentlyIncorrect = truth !== null && committed !== truth;
    if (currentlyIncorrect && !wasIncorrect) {
      incorrectStartedAt = timestamp;
    }
    if (!currentlyIncorrect && wasIncorrect && incorrectStartedAt !== null) {
      recoveryTimes.push(timestamp - incorrectStartedAt);
      incorrectStartedAt = null;
    }
    wasIncorrect = currentlyIncorrect;

    if (currentlyIncorrect) {
      if (freezeCommitIndex !== committed) {
        freezeCommitIndex = committed;
        freezeStartedAt = timestamp;
      } else if (freezeStartedAt !== null && timestamp - freezeStartedAt >= freezeThresholdMs) {
        prolongedFreezeCount += 1;
        freezeStartedAt = timestamp;
      }
    } else {
      freezeStartedAt = null;
      freezeCommitIndex = null;
    }

    frames.push({
      timestamp,
      groundTruthTimelineIndex: truth,
      committedTimelineIndex: committed,
      estimatedTimelineIndex: estimated,
      confidence: output.confidence ?? null,
      error,
      state: output.state,
      advanced: Boolean(output.advanced),
      evaluatedStates: output.evaluatedStates ?? 1,
      transitionEvidence: output.transitionEvidence ?? null,
      topPositions: output.topPositions ?? [],
      trackingRegime: output.trackingRegime ?? null,
      localPlausibility: output.localPlausibility ?? null,
      localBestScore: output.localBestScore ?? null,
      globalBestScore: output.globalBestScore ?? null,
      evidenceAgainstLocal: output.evidenceAgainstLocal ?? null,
      relocalizationReason: output.relocalizationReason ?? null,
      insertionActive: Boolean(output.insertionActive),
      consecutiveInsertions: output.consecutiveInsertions ?? null,
    });

    previousCommit = committed;
    previousTimestamp = timestamp;
    previousTruth = truth;
  }

  return {
    expected: input.expected,
    trackerName: input.tracker.name,
    frames,
    metrics: calculateMetrics(input.tracker.name, frames, {
      backwardsCommits,
      incorrectCommits,
      maxIncorrectJumpDistance,
      missedExpectedEvents: Array.from(truthSeen.values()).filter((seen) => !seen).length,
      prolongedFreezeCount,
      recoveryTimes,
      followLatencies,
      timeInLostOrUncertainMs,
      evaluatedStates: frames.map((frame) => frame.evaluatedStates),
    }),
  };
}

const DEFAULT_VISUAL_POLICY_OPTIONS: VisualPolicyOptions = {
  maxImmediateDisplayAdvance: 2,
  maxCatchUpAdvance: 2,
  catchUpIntervalMs: 300,
  largeJumpThresholdEvents: 4,
  annoyingFreezeMs: 1500,
  criticalFreezeMs: 3500,
  criticalWrongDurationMs: 3000,
  lockedConfidenceForEstimatedCatchUp: 0.58,
};

export function evaluateVisualPolicy(
  evaluation: Pick<PositionTrackerEvaluation, "frames">,
  options: Partial<VisualPolicyOptions> = {},
): VisualPolicyEvaluation {
  const config = { ...DEFAULT_VISUAL_POLICY_OPTIONS, ...options };
  const frames: VisualPolicyFrameResult[] = [];

  let displayed = evaluation.frames[0]?.committedTimelineIndex ?? 0;
  let previousTimestamp: number | null = null;
  let lastDisplayChangeAt: number | null = null;
  let freezeStartedAt: number | null = null;
  let maxDisplayedFreezeDurationMs = 0;
  let displayedFreezeDurationMs = 0;
  let wrongStartedAt: number | null = null;
  const recoveryDurations: number[] = [];
  let wrongHighlightDurationMs = 0;
  let falseLargeJumpCount = 0;
  let maxDisplayedJumpDistance = 0;
  let catchUpSteps = 0;
  let backwardsDisplayedMoves = 0;
  let criticalErrorCount = 0;
  let annoyingErrorCount = 0;
  const lagSamples: number[] = [];

  for (const frame of evaluation.frames) {
    const timestamp = frame.timestamp;
    const deltaMs = previousTimestamp === null ? 0 : Math.max(0, timestamp - previousTimestamp);
    const before = displayed;
    const target = chooseVisualTarget(frame, displayed, config, lastDisplayChangeAt);
    const distance = target - displayed;
    let decision: VisualPolicyFrameResult["visualDecision"] = "hold";

    if (distance < 0) {
      backwardsDisplayedMoves += 1;
    } else if (distance > 0) {
      if (distance <= config.maxImmediateDisplayAdvance) {
        displayed = target;
        decision = "follow-commit";
      } else {
        const step = Math.min(config.maxCatchUpAdvance, distance);
        displayed += step;
        catchUpSteps += 1;
        decision = "large-jump-throttled";
      }
    }

    const displayedChanged = displayed !== before;
    const displayedJumpDistance = Math.abs(displayed - before);
    maxDisplayedJumpDistance = Math.max(maxDisplayedJumpDistance, displayedJumpDistance);
    if (displayedChanged) lastDisplayChangeAt = timestamp;

    const truth = frame.groundTruthTimelineIndex;
    const displayedError = truth === null ? null : displayed - truth;
    if (truth !== null && displayed < truth) {
      lagSamples.push(truth - displayed);
    }

    const wrong = truth !== null && displayed !== truth;
    if (wrong) {
      wrongHighlightDurationMs += deltaMs;
      if (wrongStartedAt === null) wrongStartedAt = timestamp;
    } else if (wrongStartedAt !== null) {
      recoveryDurations.push(timestamp - wrongStartedAt);
      wrongStartedAt = null;
    }

    if (truth !== null && displayedChanged && displayed !== truth && displayedJumpDistance >= config.largeJumpThresholdEvents) {
      falseLargeJumpCount += 1;
      criticalErrorCount += 1;
    }

    if (wrong && !displayedChanged) {
      if (freezeStartedAt === null) freezeStartedAt = timestamp;
      const freezeDuration = timestamp - freezeStartedAt;
      maxDisplayedFreezeDurationMs = Math.max(maxDisplayedFreezeDurationMs, freezeDuration);
      if (freezeDuration >= config.criticalFreezeMs) criticalErrorCount += 1;
      else if (freezeDuration >= config.annoyingFreezeMs) annoyingErrorCount += 1;
    } else {
      if (freezeStartedAt !== null) {
        displayedFreezeDurationMs += timestamp - freezeStartedAt;
      }
      freezeStartedAt = null;
    }

    frames.push({
      ...frame,
      displayedTimelineIndex: displayed,
      displayedError,
      displayedChanged,
      displayedJumpDistance,
      visualDecision: decision,
    });

    previousTimestamp = timestamp;
  }

  if (freezeStartedAt !== null && previousTimestamp !== null) {
    displayedFreezeDurationMs += previousTimestamp - freezeStartedAt;
  }
  if (wrongStartedAt !== null && previousTimestamp !== null) {
    const duration = previousTimestamp - wrongStartedAt;
    recoveryDurations.push(duration);
    if (duration >= DEFAULT_VISUAL_POLICY_OPTIONS.criticalWrongDurationMs) criticalErrorCount += 1;
  }

  const maxDisplayedLagEvents = lagSamples.length > 0 ? Math.max(...lagSamples) : 0;
  if (maxDisplayedFreezeDurationMs >= config.criticalFreezeMs) criticalErrorCount += 1;
  else if (maxDisplayedFreezeDurationMs >= config.annoyingFreezeMs) annoyingErrorCount += 1;

  const severity: VisualDamageSeverity =
    criticalErrorCount > 0 || falseLargeJumpCount > 0 || backwardsDisplayedMoves > 0
      ? "critical"
      : annoyingErrorCount > 0 || maxDisplayedLagEvents >= 4
        ? "annoying"
        : "acceptable";

  return {
    frames,
    metrics: {
      falseLargeJumpCount,
      maxDisplayedJumpDistance,
      displayedFreezeDurationMs,
      maxDisplayedFreezeDurationMs,
      meanDisplayedLagEvents: mean(lagSamples),
      maxDisplayedLagEvents,
      wrongHighlightDurationMs,
      meanRecoveryToVisibleSyncMs: mean(recoveryDurations),
      maxRecoveryToVisibleSyncMs: recoveryDurations.length > 0 ? Math.max(...recoveryDurations) : null,
      catchUpSteps,
      backwardsDisplayedMoves,
      criticalErrorCount,
      annoyingErrorCount,
      severity,
    },
  };
}

function chooseVisualTarget(
  frame: EvaluationFrameResult,
  displayed: number,
  config: VisualPolicyOptions,
  lastDisplayChangeAt: number | null,
) {
  const committed = Math.max(displayed, frame.committedTimelineIndex);
  const estimated = frame.estimatedTimelineIndex ?? committed;
  if (committed > displayed) return committed;

  const canUseEstimated =
    frame.state === "locked" &&
    (frame.confidence ?? 0) >= config.lockedConfidenceForEstimatedCatchUp &&
    estimated > displayed &&
    (lastDisplayChangeAt === null || frame.timestamp - lastDisplayChangeAt >= config.catchUpIntervalMs);

  if (canUseEstimated) return estimated;
  return displayed;
}

export function createChordPositionFollowerTracker(
  timeline: readonly ChordTimelineEvent[],
  config?: Partial<ChordPositionFollowerConfig>,
): PositionTracker {
  let follower = new ChordPositionFollower(timeline, config);

  return {
    name: "chordPositionFollower",
    reset: () => {
      follower = new ChordPositionFollower(timeline, config);
    },
    process: (frame) => {
      const output = follower.process({
        candidate: frame.candidate,
        confidence: frame.confidence,
        nowMs: frame.timestamp,
      });
      return {
        committedTimelineIndex: output.committedTimelineIndex,
        estimatedTimelineIndex: output.bestHypothesisIndex,
        confidence: output.followConfidence,
        state: output.mode === "locked" ? "locked" : "uncertain",
        advanced: output.advanced,
        evaluatedStates: 1,
      };
    },
  };
}

export function createExpectedSequenceAndOldFollowerTracker(
  timeline: readonly ChordTimelineEvent[],
  config?: Partial<ChordPositionFollowerConfig>,
) {
  return {
    expected: createExpectedMusicSequenceFromTimeline(timeline, { source: "timeline" }),
    tracker: createChordPositionFollowerTracker(timeline, config),
  };
}

export function createOnlineChordAlignerTracker(
  config?: Partial<OnlineChordAlignerConfig>,
): PositionTracker {
  let aligner: OnlineChordAligner | null = null;

  return {
    name: "onlineChordAligner",
    reset: (expected) => {
      aligner = new OnlineChordAligner(expected, config);
    },
    process: (frame) => {
      if (!aligner) throw new Error("Tracker must be reset before processing evidence.");
      const output = aligner.processEvidence(frame);
      return {
        committedTimelineIndex: output.committedTimelineIndex,
        estimatedTimelineIndex: output.estimatedTimelineIndex,
        confidence: output.confidence,
        state: output.mode,
        advanced: output.advanced,
        evaluatedStates: output.evaluatedStates,
        transitionEvidence: output.transitionEvidence,
        topPositions: output.topPositions,
        trackingRegime: output.trackingRegime,
        localPlausibility: output.localPlausibility,
        localBestScore: output.localBestScore,
        globalBestScore: output.globalBestScore,
        evidenceAgainstLocal: output.evidenceAgainstLocal,
        relocalizationReason: output.relocalizationReason,
        insertionActive: output.insertionActive,
        consecutiveInsertions: output.consecutiveInsertions,
      };
    },
  };
}

function getGroundTruthForFrame(frame: EvaluationEvidenceFrame, segments?: readonly GroundTruthSegment[]) {
  if (typeof frame.groundTruthTimelineIndex === "number") return frame.groundTruthTimelineIndex;
  const segment = segments?.find((item) => frame.timestamp >= item.startMs && frame.timestamp < item.endMs);
  return segment?.timelineIndex ?? null;
}

function calculateMetrics(
  trackerName: string,
  frames: readonly EvaluationFrameResult[],
  counters: {
    backwardsCommits: number;
    incorrectCommits: number;
    maxIncorrectJumpDistance: number;
    missedExpectedEvents: number;
    prolongedFreezeCount: number;
    recoveryTimes: number[];
    followLatencies: number[];
    timeInLostOrUncertainMs: number;
    evaluatedStates: number[];
  },
): PositionTrackerMetrics {
  const withTruth = frames.filter((frame) => frame.groundTruthTimelineIndex !== null);
  const errors = withTruth
    .map((frame) => frame.error)
    .filter((error): error is number => typeof error === "number");
  const absErrors = errors.map(Math.abs);

  return {
    trackerName,
    totalFrames: frames.length,
    framesWithGroundTruth: withTruth.length,
    correctFrameRatio: withTruth.length === 0
      ? 0
      : withTruth.filter((frame) => frame.error === 0).length / withTruth.length,
    meanAbsoluteEventError: mean(absErrors),
    maxAbsoluteEventError: absErrors.length > 0 ? Math.max(...absErrors) : null,
    maxDistanceFromGroundTruth: absErrors.length > 0 ? Math.max(...absErrors) : null,
    maxIncorrectJumpDistance: counters.maxIncorrectJumpDistance,
    missedExpectedEvents: counters.missedExpectedEvents,
    backwardsCommits: counters.backwardsCommits,
    incorrectCommits: counters.incorrectCommits,
    prolongedFreezeCount: counters.prolongedFreezeCount,
    meanRecoveryTimeMs: mean(counters.recoveryTimes),
    meanFollowLatencyMs: mean(counters.followLatencies),
    timeInLostOrUncertainMs: counters.timeInLostOrUncertainMs,
    averageEvaluatedStatesPerFrame: mean(counters.evaluatedStates) ?? 0,
    maxEvaluatedStatesPerFrame: counters.evaluatedStates.length > 0 ? Math.max(...counters.evaluatedStates) : 0,
  };
}

function mean(values: readonly number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
