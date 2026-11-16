export type PlayRowScrollState = {
  currentScrollY: number;
  viewportHeight: number;
  lastAutomaticScrollY: number;
  lastScrolledLineIndex: number;
  animationInProgress: boolean;
  layoutReady: boolean;
  layoutValid: boolean;
  anchorRatio?: number;
  maxStepRatio?: number;
};

export type PlayRowScrollInput = {
  targetLineIndex: number;
  targetLineY: number | null;
  targetHeight?: number | null;
};

export type PlayRowScrollDecision =
  | {
      shouldScroll: true;
      targetY: number;
      targetVisibleY: number;
      reason: "scroll";
    }
  | {
      shouldScroll: false;
      targetY: null;
      targetVisibleY: number | null;
      reason:
        | "layout-not-ready"
        | "layout-invalid"
        | "missing-layout"
        | "comfortable-zone"
        | "non-forward-line"
        | "animation-in-progress"
        | "micro-scroll";
    };

export const PLAY_ROW_COMFORTABLE_TOP_RATIO = 0;
export const PLAY_ROW_COMFORTABLE_BOTTOM_RATIO = 0.62;
const TARGET_RATIO = 0.4;
const MAX_STEP_RATIO = 0.42;
const MIN_SCROLL_PX = 18;

export function decidePlayRowScroll(state: PlayRowScrollState, input: PlayRowScrollInput): PlayRowScrollDecision {
  const targetVisibleY = input.targetLineY === null ? null : input.targetLineY - state.currentScrollY;

  if (!state.layoutReady || state.viewportHeight <= 0) {
    return { shouldScroll: false, targetY: null, targetVisibleY, reason: "layout-not-ready" };
  }
  if (!state.layoutValid) {
    return { shouldScroll: false, targetY: null, targetVisibleY, reason: "layout-invalid" };
  }
  if (input.targetLineY === null || targetVisibleY === null) {
    return { shouldScroll: false, targetY: null, targetVisibleY, reason: "missing-layout" };
  }
  if (input.targetLineIndex <= state.lastScrolledLineIndex) {
    return { shouldScroll: false, targetY: null, targetVisibleY, reason: "non-forward-line" };
  }
  if (state.animationInProgress) {
    return { shouldScroll: false, targetY: null, targetVisibleY, reason: "animation-in-progress" };
  }

  const targetBottomVisibleY = targetVisibleY + Math.max(0, input.targetHeight ?? 0);
  const comfortableTop = state.viewportHeight * PLAY_ROW_COMFORTABLE_TOP_RATIO;
  const comfortableBottom = state.viewportHeight * PLAY_ROW_COMFORTABLE_BOTTOM_RATIO;
  if (targetVisibleY >= comfortableTop && targetBottomVisibleY <= comfortableBottom) {
    return { shouldScroll: false, targetY: null, targetVisibleY, reason: "comfortable-zone" };
  }

  const anchorRatio = state.anchorRatio ?? TARGET_RATIO;
  const maxStepRatio = state.maxStepRatio ?? MAX_STEP_RATIO;

  const rawTargetY = Math.max(
    state.currentScrollY,
    state.lastAutomaticScrollY,
    input.targetLineY - state.viewportHeight * anchorRatio,
    0,
  );
  const baselineY = Math.max(state.lastAutomaticScrollY, state.currentScrollY, 0);
  const targetY = Math.min(rawTargetY, baselineY + state.viewportHeight * maxStepRatio);

  if (targetY - baselineY < MIN_SCROLL_PX) {
    return { shouldScroll: false, targetY: null, targetVisibleY, reason: "micro-scroll" };
  }

  return { shouldScroll: true, targetY, targetVisibleY, reason: "scroll" };
}
