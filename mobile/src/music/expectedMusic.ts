import { deriveChordTimeline, type ChordTimelineEvent } from "./chordTimeline.ts";
import type { SupportedChord } from "./chordDetection";

export type ExpectedMusicEvent = {
  timelineIndex: number;
  originalChord: string;
  normalizedChord: string;
  compatibleChords: SupportedChord[];
  matchFamily: SupportedChord[];
  lineIndex: number;
  charStart: number;
  charEnd: number;
  boundaryBefore: string | null;
  boundaryAfter: string | null;
  sectionMarker: string | null;
};

export type ExpectedMusicSequence = {
  version: 1;
  events: ExpectedMusicEvent[];
  metadata?: {
    songId?: string;
    songTitle?: string;
    source?: "normalized-content" | "timeline" | "synthetic";
    createdAt?: string;
    notes?: string;
  };
};

export function deriveExpectedMusicSequence(
  content: string,
  metadata?: ExpectedMusicSequence["metadata"],
): ExpectedMusicSequence {
  return createExpectedMusicSequenceFromTimeline(deriveChordTimeline(content), {
    source: "normalized-content",
    ...metadata,
  });
}

export function createExpectedMusicSequenceFromTimeline(
  timeline: readonly ChordTimelineEvent[],
  metadata?: ExpectedMusicSequence["metadata"],
): ExpectedMusicSequence {
  return {
    version: 1,
    events: timeline.map((event, timelineIndex) => ({
      timelineIndex,
      originalChord: event.originalChord,
      normalizedChord: event.normalizedChord,
      compatibleChords: [...event.matchChords],
      matchFamily: [...event.matchChords],
      lineIndex: event.lineIndex,
      charStart: event.charStart,
      charEnd: event.charEnd,
      boundaryBefore: timelineIndex > 0 ? timeline[timelineIndex - 1].boundaryAfter : null,
      boundaryAfter: event.boundaryAfter,
      sectionMarker: event.sectionMarkers[0] ?? null,
    })),
    metadata,
  };
}

export function serializeExpectedMusicSequence(sequence: ExpectedMusicSequence) {
  return JSON.stringify(sequence);
}

export function parseExpectedMusicSequence(value: string): ExpectedMusicSequence {
  const parsed = JSON.parse(value) as ExpectedMusicSequence;
  if (parsed.version !== 1 || !Array.isArray(parsed.events)) {
    throw new Error("Invalid expected music sequence.");
  }
  return {
    version: 1,
    events: parsed.events.map((event) => ({
      ...event,
      compatibleChords: [...event.compatibleChords],
      matchFamily: [...event.matchFamily],
    })),
    metadata: parsed.metadata,
  };
}
