import { normalizeSongContent, deriveChordLineMetadata, type ChordLineMetadata, type ChordTimelineEvent } from "./normalizeSongContent.ts";

export { deriveChordLineMetadata, normalizeSongContent, type ChordLineMetadata, type ChordTimelineEvent };

export type DetectableLookahead = {
  event: ChordTimelineEvent;
  index: number;
  skippedEvents: number;
} | null;

export type DetectableLookaheadEvent = {
  event: ChordTimelineEvent;
  index: number;
  skippedEvents: number;
};

export function deriveChordTimeline(content: string): ChordTimelineEvent[] {
  return normalizeSongContent(content).chordEvents;
}

export function getPlayableTimeline(events: readonly ChordTimelineEvent[]) {
  return events.filter((event) => event.supportedChord !== null);
}

export function findFirstDetectableIndex(events: readonly ChordTimelineEvent[]) {
  return events.findIndex((event) => event.supportedChord !== null);
}

export function findNextDetectableEvent(
  events: readonly ChordTimelineEvent[],
  currentIndex: number,
  options: { maxLookaheadEvents?: number; maxLookaheadLines?: number } = {},
): DetectableLookahead {
  const current = events[currentIndex];
  const maxLookaheadEvents = options.maxLookaheadEvents ?? 4;
  const maxLookaheadLines = options.maxLookaheadLines ?? Number.POSITIVE_INFINITY;

  if (!current) return null;

  for (let index = currentIndex + 1; index < events.length && index <= currentIndex + maxLookaheadEvents; index += 1) {
    const event = events[index];
    if (event.lineIndex - current.lineIndex > maxLookaheadLines) return null;
    if (!event.supportedChord) continue;

    return {
      event,
      index,
      skippedEvents: index - currentIndex - 1,
    };
  }

  return null;
}

export function findDetectableLookaheadEvents(
  events: readonly ChordTimelineEvent[],
  currentIndex: number,
  options: { maxLookaheadEvents?: number; maxLookaheadLines?: number } = {},
): DetectableLookaheadEvent[] {
  const current = events[currentIndex];
  const maxLookaheadEvents = options.maxLookaheadEvents ?? 4;
  const maxLookaheadLines = options.maxLookaheadLines ?? Number.POSITIVE_INFINITY;
  const lookahead: DetectableLookaheadEvent[] = [];

  if (!current) return lookahead;

  for (let index = currentIndex + 1; index < events.length && index <= currentIndex + maxLookaheadEvents; index += 1) {
    const event = events[index];
    if (event.lineIndex - current.lineIndex > maxLookaheadLines) break;
    if (!event.supportedChord) continue;

    lookahead.push({
      event,
      index,
      skippedEvents: index - currentIndex - 1,
    });
  }

  return lookahead;
}

export function getDetectableStats(events: readonly ChordTimelineEvent[]) {
  return {
    total: events.length,
    detectable: events.filter((event) => event.supportedChord !== null).length,
  };
}
