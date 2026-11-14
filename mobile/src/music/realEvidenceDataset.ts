import {
  createAudioEvidenceRecording,
  parseAudioEvidenceRecording,
  serializeAudioEvidenceRecording,
  type AudioEvidenceFrame,
  type AudioEvidenceRecording,
} from "./audioEvidence.ts";
import { createAudioEvidenceFrameFromChroma } from "./chordDetection.ts";
import type { ExpectedMusicSequence } from "./expectedMusic.ts";
import type { EvaluationEvidenceRecording, GroundTruthSegment } from "./positionTrackerEvaluation.ts";

export type GroundTruthChangePoint = {
  timeMs?: number;
  time?: string;
  timelineIndex: number;
  note?: string;
};

export type RealGroundTruthAnnotation = {
  version: 1;
  recordingFile?: string;
  name?: string;
  changes?: GroundTruthChangePoint[];
  segments?: GroundTruthSegment[];
  notes?: string;
};

export type RealTrackingFixture = {
  version: 1;
  name: string;
  expectedMusicSequence: ExpectedMusicSequence;
  evidenceRecording: AudioEvidenceRecording;
  groundTruth?: {
    segments: GroundTruthSegment[];
  };
  notes?: string;
};

export function createDevAudioEvidenceRecording(input: {
  frames: readonly AudioEvidenceFrame[];
  songId: string;
  songTitle: string;
  expectedMusicSequence: ExpectedMusicSequence;
  sampleRate: number;
  windowSize: number;
  notes?: string;
  appBuildInfo?: NonNullable<AudioEvidenceRecording["metadata"]>["appBuildInfo"];
}): AudioEvidenceRecording {
  return createAudioEvidenceRecording(input.frames, {
    songId: input.songId,
    songTitle: input.songTitle,
    expectedMusicSequence: input.expectedMusicSequence,
    schemaVersion: 1,
    recordedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    sampleRate: input.sampleRate,
    windowSize: input.windowSize,
    notes: input.notes,
    appBuildInfo: input.appBuildInfo,
  });
}

export function serializeRealTrackingFixture(fixture: RealTrackingFixture) {
  return JSON.stringify(fixture);
}

export function parseRealTrackingFixture(value: string): RealTrackingFixture {
  const parsed = JSON.parse(value) as RealTrackingFixture;
  if (parsed.version !== 1 || !parsed.expectedMusicSequence || !parsed.evidenceRecording) {
    throw new Error("Invalid real tracking fixture.");
  }

  return {
    version: 1,
    name: parsed.name,
    expectedMusicSequence: parsed.expectedMusicSequence,
    evidenceRecording: parseAudioEvidenceRecording(serializeAudioEvidenceRecording(parsed.evidenceRecording)),
    groundTruth: parsed.groundTruth
      ? { segments: parsed.groundTruth.segments.map((segment) => ({ ...segment })) }
      : undefined,
    notes: parsed.notes,
  };
}

export function createRealTrackingFixture(input: {
  name: string;
  expectedMusicSequence: ExpectedMusicSequence;
  evidenceRecording: AudioEvidenceRecording;
  groundTruth?: {
    segments: GroundTruthSegment[];
  };
  notes?: string;
}): RealTrackingFixture {
  return {
    version: 1,
    name: input.name,
    expectedMusicSequence: input.expectedMusicSequence,
    evidenceRecording: parseAudioEvidenceRecording(serializeAudioEvidenceRecording(input.evidenceRecording)),
    groundTruth: input.groundTruth
      ? { segments: input.groundTruth.segments.map((segment) => ({ ...segment })) }
      : undefined,
    notes: input.notes,
  };
}

export function toEvaluationEvidenceRecording(fixture: RealTrackingFixture): EvaluationEvidenceRecording {
  const frames = rescoreAudioEvidenceFramesForExpectedSequence(
    fixture.evidenceRecording.frames,
    fixture.expectedMusicSequence,
  );

  return {
    version: fixture.evidenceRecording.version,
    frames,
    metadata: fixture.evidenceRecording.metadata,
    groundTruth: fixture.groundTruth
      ? { segments: fixture.groundTruth.segments.map((segment) => ({ ...segment })) }
      : undefined,
  };
}

export function parseRealGroundTruthAnnotation(value: string): RealGroundTruthAnnotation {
  const parsed = JSON.parse(value) as RealGroundTruthAnnotation;
  if (parsed.version !== 1) {
    throw new Error("Invalid real ground truth annotation.");
  }

  return {
    version: 1,
    recordingFile: parsed.recordingFile,
    name: parsed.name,
    changes: parsed.changes?.map((change) => ({ ...change })),
    segments: parsed.segments?.map((segment) => ({ ...segment })),
    notes: parsed.notes,
  };
}

export function serializeRealGroundTruthAnnotation(annotation: RealGroundTruthAnnotation) {
  return JSON.stringify(annotation, null, 2);
}

export function createGroundTruthSegmentsFromAnnotation(
  annotation: RealGroundTruthAnnotation,
  recording: Pick<AudioEvidenceRecording, "frames">,
): GroundTruthSegment[] {
  if (annotation.segments) {
    return validateGroundTruthSegments(annotation.segments);
  }

  const changes = annotation.changes ?? [];
  if (changes.length === 0) return [];

  const recordingStartMs = getRecordingStartMs(recording);
  const recordingEndMs = getRecordingEndMs(recording);
  const normalized = changes
    .map((change) => ({
      startMs: normalizeAnnotationTimeMs(change, recordingStartMs),
      timelineIndex: change.timelineIndex,
    }))
    .sort((a, b) => a.startMs - b.startMs);

  const segments: GroundTruthSegment[] = [];
  for (let index = 0; index < normalized.length; index += 1) {
    const current = normalized[index];
    const next = normalized[index + 1];
    const endMs = next?.startMs ?? recordingEndMs;
    if (endMs <= current.startMs) continue;
    segments.push({
      startMs: current.startMs,
      endMs,
      timelineIndex: current.timelineIndex,
    });
  }

  return validateGroundTruthSegments(segments);
}

export function createRealTrackingFixtureFromRecordingAndAnnotation(input: {
  name: string;
  evidenceRecording: AudioEvidenceRecording;
  annotation: RealGroundTruthAnnotation;
  expectedMusicSequence?: ExpectedMusicSequence;
  notes?: string;
}): RealTrackingFixture {
  const expectedMusicSequence = input.expectedMusicSequence ?? input.evidenceRecording.metadata?.expectedMusicSequence;
  if (!expectedMusicSequence) {
    throw new Error("Recording must include ExpectedMusicSequence metadata or receive one explicitly.");
  }

  return createRealTrackingFixture({
    name: input.name,
    expectedMusicSequence,
    evidenceRecording: input.evidenceRecording,
    groundTruth: {
      segments: createGroundTruthSegmentsFromAnnotation(input.annotation, input.evidenceRecording),
    },
    notes: input.notes ?? input.annotation.notes,
  });
}

export function createGroundTruthAnnotationTemplate(input: {
  recordingFile?: string;
  name?: string;
  expectedMusicSequence: ExpectedMusicSequence;
  includeEveryEvent?: boolean;
}): RealGroundTruthAnnotation & {
  timeline: Array<{
    timelineIndex: number;
    chord: string;
    lineIndex: number;
    charStart: number;
    charEnd: number;
  }>;
} {
  return {
    version: 1,
    recordingFile: input.recordingFile,
    name: input.name,
    notes: "Fill changes with the approximate moment where each played chord/event starts. Use either timeMs or time like 01:23.450.",
    changes: input.includeEveryEvent
      ? input.expectedMusicSequence.events.map((event) => ({
        time: "",
        timelineIndex: event.timelineIndex,
        note: event.normalizedChord,
      }))
      : [
        {
          time: "00:00.000",
          timelineIndex: input.expectedMusicSequence.events[0]?.timelineIndex ?? 0,
          note: "first audible/played event",
        },
      ],
    timeline: input.expectedMusicSequence.events.map((event) => ({
      timelineIndex: event.timelineIndex,
      chord: event.normalizedChord,
      lineIndex: event.lineIndex,
      charStart: event.charStart,
      charEnd: event.charEnd,
    })),
  };
}

export function rescoreAudioEvidenceFramesForExpectedSequence(
  frames: readonly AudioEvidenceFrame[],
  expectedMusicSequence: ExpectedMusicSequence,
): AudioEvidenceFrame[] {
  const expectedChords = Array.from(new Set(expectedMusicSequence.events.flatMap((event) => event.compatibleChords)));
  const rescored: AudioEvidenceFrame[] = [];

  for (const frame of frames) {
    const previousFrame = rescored[rescored.length - 1] ?? null;
    rescored.push(createAudioEvidenceFrameFromChroma({
      timestamp: frame.timestamp,
      sampleRate: frame.sampleRate,
      windowSize: frame.windowSize,
      chroma: frame.chroma,
      rms: frame.rms,
      expectedChords,
      previousFrame,
      topCandidateCount: Math.max(5, frame.topCandidates.length),
    }));
  }

  return rescored;
}

function validateGroundTruthSegments(segments: readonly GroundTruthSegment[]): GroundTruthSegment[] {
  const normalized = segments
    .map((segment) => ({ ...segment }))
    .sort((a, b) => a.startMs - b.startMs);

  for (const segment of normalized) {
    if (!Number.isFinite(segment.startMs) || !Number.isFinite(segment.endMs) || segment.endMs <= segment.startMs) {
      throw new Error(`Invalid ground truth segment ${JSON.stringify(segment)}.`);
    }
    if (!Number.isInteger(segment.timelineIndex) || segment.timelineIndex < 0) {
      throw new Error(`Invalid ground truth timelineIndex ${segment.timelineIndex}.`);
    }
  }

  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index].startMs < normalized[index - 1].endMs) {
      throw new Error("Ground truth segments must not overlap.");
    }
  }

  return normalized;
}

function normalizeAnnotationTimeMs(change: GroundTruthChangePoint, recordingStartMs: number) {
  const relativeMs = typeof change.timeMs === "number" ? change.timeMs : parseTimecodeMs(change.time ?? "");
  return recordingStartMs + relativeMs;
}

export function parseTimecodeMs(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Empty timecode.");
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed));

  const parts = trimmed.split(":");
  if (parts.length < 2 || parts.length > 3) {
    throw new Error(`Invalid timecode "${value}". Use ms, ss.mmm, mm:ss.mmm, or hh:mm:ss.mmm.`);
  }

  const seconds = Number(parts[parts.length - 1]);
  const minutes = Number(parts[parts.length - 2]);
  const hours = parts.length === 3 ? Number(parts[0]) : 0;
  if (![seconds, minutes, hours].every(Number.isFinite)) {
    throw new Error(`Invalid timecode "${value}".`);
  }

  return Math.round(((hours * 60 + minutes) * 60 + seconds) * 1000);
}

function getRecordingStartMs(recording: Pick<AudioEvidenceRecording, "frames">) {
  return recording.frames[0]?.timestamp ?? 0;
}

function getRecordingEndMs(recording: Pick<AudioEvidenceRecording, "frames">) {
  const last = recording.frames[recording.frames.length - 1];
  return last ? last.timestamp + Math.max(1, last.deltaMs ?? 150) : 0;
}
