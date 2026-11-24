export type ChordDiagramPresentation = {
  mode: "bottom-sheet" | "center-card";
  maxWidth: number;
  diagramSize: number;
};

export function getChordDiagramPresentation(
  isPad: boolean,
  width: number,
  height: number,
): ChordDiagramPresentation {
  const shortestSide = Math.min(width, height);
  if (isPad) {
    return {
      mode: "center-card",
      maxWidth: Math.min(560, width - 48),
      diagramSize: Math.min(330, shortestSide * 0.5),
    };
  }
  return {
    mode: "bottom-sheet",
    maxWidth: width,
    diagramSize: Math.min(280, shortestSide * 0.68),
  };
}
