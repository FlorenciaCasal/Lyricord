export type OnboardingPresentation = {
  controls: "image" | "native";
  imageResizeMode: "cover" | "contain";
  layout: "phone" | "tablet-portrait" | "tablet-landscape";
};

export function getOnboardingPresentation(
  isPad: boolean,
  width: number,
  height: number,
): OnboardingPresentation {
  if (!isPad) {
    return {
      controls: "image",
      imageResizeMode: "cover",
      layout: "phone",
    };
  }

  return {
    controls: "native",
    imageResizeMode: "contain",
    layout: width > height ? "tablet-landscape" : "tablet-portrait",
  };
}

export function getOnboardingPrimaryAction(pageIndex: number, pageCount: number) {
  return pageIndex >= pageCount - 1 ? "finish" : "next";
}

export function clampOnboardingPage(pageIndex: number, pageCount: number) {
  return Math.max(0, Math.min(pageIndex, Math.max(0, pageCount - 1)));
}
