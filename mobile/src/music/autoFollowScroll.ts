export type AutoFollowScrollState = {
  lastScrolledLineIndex: number;
  lastAutomaticScrollY: number;
  currentScrollY: number;
  viewportHeight: number;
  animationInProgress: boolean;
  layoutReady: boolean;
  layoutValid: boolean;
};

export type AutoFollowScrollInput = {
  advanced?: boolean;
  targetLineIndex: number;
  targetLineY: number | null;
  timelineIndex: number;
};

export type AutoFollowScrollEvaluation = {
  timelineIndex: number;
  lineIndex: number;
  targetLineY: number | null;
  currentScrollY: number;
  targetVisibleY: number | null;
  viewportHeight: number;
  safeZoneTop: number;
  safeZoneBottom: number;
  decision: AutoFollowScrollDecision["reason"];
};

export type AutoFollowScrollDecision =
  | {
      shouldScroll: true;
      targetY: number;
      fromLine: number;
      toLine: number;
      timelineIndex: number;
      reason: "advanced";
      evaluation: AutoFollowScrollEvaluation;
    }
  | {
      shouldScroll: false;
      fromLine: number;
      toLine: number;
      timelineIndex: number;
      reason:
        | "not-advanced"
        | "layout-not-ready"
        | "layout-invalid"
        | "missing-layout"
        | "same-line"
        | "backwards"
        | "duplicate"
        | "animation-in-progress"
        | "safe-zone"
        | "non-forward-target";
      evaluation: AutoFollowScrollEvaluation;
    };

const SAFE_ZONE_TOP = 0;
const SAFE_ZONE_BOTTOM = 0.7;
const SCROLL_TARGET_RATIO = 0.45;
const MIN_FORWARD_SCROLL_PX = 24;
const MAX_SCROLL_STEP_RATIO = 0.45;

export function decideAutoFollowScroll(
  state: AutoFollowScrollState,
  input: AutoFollowScrollInput,
): AutoFollowScrollDecision {
  const fromLine = state.lastScrolledLineIndex;
  const toLine = input.targetLineIndex;
  const targetVisibleY = input.targetLineY === null ? null : input.targetLineY - state.currentScrollY;
  const safeZoneTop = state.viewportHeight * SAFE_ZONE_TOP;
  const safeZoneBottom = state.viewportHeight * SAFE_ZONE_BOTTOM;

  function evaluation(decision: AutoFollowScrollDecision["reason"]): AutoFollowScrollEvaluation {
    return {
      timelineIndex: input.timelineIndex,
      lineIndex: input.targetLineIndex,
      targetLineY: input.targetLineY,
      currentScrollY: state.currentScrollY,
      targetVisibleY,
      viewportHeight: state.viewportHeight,
      safeZoneTop,
      safeZoneBottom,
      decision,
    };
  }

  if (input.advanced === false) {
    return { shouldScroll: false, fromLine, toLine, timelineIndex: input.timelineIndex, reason: "not-advanced", evaluation: evaluation("not-advanced") };
  }
  if (!state.layoutReady || state.viewportHeight <= 0) {
    return { shouldScroll: false, fromLine, toLine, timelineIndex: input.timelineIndex, reason: "layout-not-ready", evaluation: evaluation("layout-not-ready") };
  }
  if (!state.layoutValid) {
    return { shouldScroll: false, fromLine, toLine, timelineIndex: input.timelineIndex, reason: "layout-invalid", evaluation: evaluation("layout-invalid") };
  }
  if (input.targetLineY === null) {
    return { shouldScroll: false, fromLine, toLine, timelineIndex: input.timelineIndex, reason: "missing-layout", evaluation: evaluation("missing-layout") };
  }
  if (toLine === fromLine) {
    return { shouldScroll: false, fromLine, toLine, timelineIndex: input.timelineIndex, reason: "same-line", evaluation: evaluation("same-line") };
  }
  if (toLine < fromLine) {
    return { shouldScroll: false, fromLine, toLine, timelineIndex: input.timelineIndex, reason: "backwards", evaluation: evaluation("backwards") };
  }
  if (targetVisibleY !== null && targetVisibleY <= 0) {
    return { shouldScroll: false, fromLine, toLine, timelineIndex: input.timelineIndex, reason: "duplicate", evaluation: evaluation("duplicate") };
  }
  if (state.animationInProgress) {
    return { shouldScroll: false, fromLine, toLine, timelineIndex: input.timelineIndex, reason: "animation-in-progress", evaluation: evaluation("animation-in-progress") };
  }

  if (targetVisibleY !== null && targetVisibleY >= safeZoneTop && targetVisibleY <= safeZoneBottom) {
    return { shouldScroll: false, fromLine, toLine, timelineIndex: input.timelineIndex, reason: "safe-zone", evaluation: evaluation("safe-zone") };
  }

  const rawTargetY = Math.max(
    0,
    state.currentScrollY,
    state.lastAutomaticScrollY,
    input.targetLineY - state.viewportHeight * SCROLL_TARGET_RATIO,
  );
  const lastAutomaticScrollY = Math.max(state.lastAutomaticScrollY, state.currentScrollY);
  const maxStep = state.viewportHeight * MAX_SCROLL_STEP_RATIO;
  const targetY = Math.min(rawTargetY, lastAutomaticScrollY + maxStep);
  if (targetY - lastAutomaticScrollY < MIN_FORWARD_SCROLL_PX) {
    return { shouldScroll: false, fromLine, toLine, timelineIndex: input.timelineIndex, reason: "non-forward-target", evaluation: evaluation("non-forward-target") };
  }

  return {
    shouldScroll: true,
    targetY,
    fromLine,
    toLine,
    timelineIndex: input.timelineIndex,
    reason: "advanced",
    evaluation: evaluation("advanced"),
  };
}
