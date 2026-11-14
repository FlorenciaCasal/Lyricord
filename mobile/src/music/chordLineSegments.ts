import type { ChordTimelineEvent } from "./chordTimeline";

export type ChordLineSegment =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "chord";
      text: string;
      timelineIndex: number;
      active: boolean;
      next: boolean;
    };

export function getLineChordSegments(
  line: string,
  lineIndex: number,
  timeline: readonly ChordTimelineEvent[],
  activeTimelineIndex: number,
  options: {
    activeTimelineIndexes?: ReadonlySet<number>;
    nextTimelineIndexes?: ReadonlySet<number>;
  } = {},
): ChordLineSegment[] {
  const events = timeline
    .map((event, timelineIndex) => ({ event, timelineIndex }))
    .filter(({ event }) => event.lineIndex === lineIndex)
    .sort((a, b) => a.event.charIndex - b.event.charIndex || a.timelineIndex - b.timelineIndex);

  if (events.length === 0) return [{ type: "text", text: line.length > 0 ? line : " " }];

  const segments: ChordLineSegment[] = [];
  let cursor = 0;
  const activeIndexes = options.activeTimelineIndexes;
  const nextIndexes = options.nextTimelineIndexes;

  for (const { event, timelineIndex } of events) {
    const start = event.charStart;
    const end = event.charEnd;

    if (start < cursor || line.slice(start, end) !== event.chord) continue;

    if (start > cursor) {
      segments.push({ type: "text", text: line.slice(cursor, start) });
    }

    segments.push({
      type: "chord",
      text: line.slice(start, end),
      timelineIndex,
      active: activeIndexes ? activeIndexes.has(timelineIndex) : timelineIndex === activeTimelineIndex,
      next: nextIndexes ? nextIndexes.has(timelineIndex) : timelineIndex === activeTimelineIndex + 1,
    });
    cursor = end;
  }

  if (cursor < line.length) {
    segments.push({ type: "text", text: line.slice(cursor) });
  }

  if (segments.length === 0) return [{ type: "text", text: line.length > 0 ? line : " " }];
  return segments;
}

export function joinLineChordSegments(segments: readonly ChordLineSegment[]) {
  return segments.map((segment) => segment.text).join("");
}
