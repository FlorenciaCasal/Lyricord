import type { ChordCandidate, SupportedChord } from "./chordDetection";
import type { ExpectedMusicSequence } from "./expectedMusic";

export type AudioEvidenceCandidate = {
  chord: SupportedChord;
  score: number;
  confidence: number;
};

export type AudioEvidenceFrame = {
  timestamp: number;
  sampleRate: number;
  windowSize: number;
  chroma: number[];
  rms: number;
  scores: Partial<Record<SupportedChord, number>>;
  topCandidates: AudioEvidenceCandidate[];
  candidate: ChordCandidate;
  confidence: number;
  bestScore: number;
  secondScore: number;
  scoreMargin: number;
  deltaMs: number | null;
  rmsDelta: number | null;
  energyRise: number;
  /**
   * Approximate onset strength in the 0..1 range.
   *
   * This is derived from already available frame-level evidence: RMS rise,
   * chroma/spectral change and candidate change. It is intentionally stored as
   * evidence only; position trackers can decide later whether/how to use it.
   */
  onsetStrength: number;
  /**
   * Mean absolute distance between this chroma vector and the previous frame.
   * Cheap multi-frame chroma evolution signal; no extra DSP pass required.
   */
  chromaDelta: number;
  /**
   * Per-pitch-class chroma delta against the previous frame.
   */
  chromaDeltaVector: number[];
  /**
   * Chroma-domain positive flux. This is not a full FFT spectral flux; it is a
   * low-cost proxy based on the existing 12-bin chroma representation.
   */
  spectralFlux: number;
  /**
   * Duration in milliseconds for the currently stable observed candidate event.
   * Resets on unknown/candidate change and grows during sustain.
   */
  observedEventDurationMs: number;
  candidateChanged: boolean;
  repeatedCandidateFrames: number;
};

export type AudioEvidenceRecording = {
  version: 1;
  frames: AudioEvidenceFrame[];
  metadata?: {
    songId?: string;
    songTitle?: string;
    expectedMusicSequence?: ExpectedMusicSequence;
    schemaVersion?: 1;
    recordedAt?: string;
    appBuildInfo?: {
      platform?: string;
      appVersion?: string;
      buildNumber?: string;
      expoSdk?: string;
    };
    sampleRate?: number;
    windowSize?: number;
    notes?: string;
    createdAt?: string;
  };
};

export function createAudioEvidenceRecording(
  frames: readonly AudioEvidenceFrame[],
  metadata?: AudioEvidenceRecording["metadata"],
): AudioEvidenceRecording {
  let previous: AudioEvidenceFrame | null = null;
  const clonedFrames = frames.map((frame) => {
    const cloned = cloneAudioEvidenceFrame(frame, previous);
    previous = cloned;
    return cloned;
  });

  return {
    version: 1,
    frames: clonedFrames,
    metadata,
  };
}

export function serializeAudioEvidenceRecording(recording: AudioEvidenceRecording) {
  return JSON.stringify(recording);
}

export function parseAudioEvidenceRecording(value: string): AudioEvidenceRecording {
  const parsed = JSON.parse(value) as AudioEvidenceRecording;
  if (parsed.version !== 1 || !Array.isArray(parsed.frames)) {
    throw new Error("Invalid audio evidence recording.");
  }
  let previous: AudioEvidenceFrame | null = null;
  const frames = parsed.frames.map((frame) => {
    const cloned = cloneAudioEvidenceFrame(frame, previous);
    previous = cloned;
    return cloned;
  });

  return {
    version: 1,
    frames,
    metadata: parsed.metadata,
  };
}

function cloneAudioEvidenceFrame(frame: AudioEvidenceFrame, previousFrame: AudioEvidenceFrame | null = null): AudioEvidenceFrame {
  const chroma = [...frame.chroma];
  const chromaDeltaVector = Array.isArray(frame.chromaDeltaVector)
    ? [...frame.chromaDeltaVector]
    : calculateChromaDeltaVector(chroma, previousFrame?.chroma);
  const chromaDelta = typeof frame.chromaDelta === "number"
    ? frame.chromaDelta
    : meanAbsolute(chromaDeltaVector);
  const spectralFlux = typeof frame.spectralFlux === "number"
    ? frame.spectralFlux
    : positiveFlux(chromaDeltaVector);
  const onsetStrength = typeof frame.onsetStrength === "number"
    ? frame.onsetStrength
    : estimateOnsetStrength({
      energyRise: frame.energyRise,
      chromaDelta,
      spectralFlux,
      candidateChanged: frame.candidateChanged,
      previousWasSilent: !previousFrame || previousFrame.candidate === "unknown" || previousFrame.rms < 0.006,
    });
  const observedEventDurationMs = typeof frame.observedEventDurationMs === "number"
    ? frame.observedEventDurationMs
    : estimateObservedEventDuration(frame, previousFrame);

  return {
    ...frame,
    chroma,
    scores: { ...frame.scores },
    topCandidates: frame.topCandidates.map((candidate) => ({ ...candidate })),
    onsetStrength,
    chromaDelta,
    chromaDeltaVector,
    spectralFlux,
    observedEventDurationMs,
  };
}

export function calculateChromaDeltaVector(
  current: readonly number[],
  previous?: readonly number[] | null,
) {
  const length = current.length;
  if (!previous || previous.length === 0) return Array.from({ length }, () => 0);

  return current.map((value, index) => value - (previous[index] ?? 0));
}

export function meanAbsolute(values: readonly number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + Math.abs(value), 0) / values.length;
}

export function positiveFlux(deltaVector: readonly number[]) {
  return deltaVector.reduce((sum, value) => sum + Math.max(0, value), 0);
}

export function estimateOnsetStrength(input: {
  energyRise: number;
  chromaDelta: number;
  spectralFlux: number;
  candidateChanged: boolean;
  previousWasSilent: boolean;
}) {
  const energyComponent = clamp01(input.energyRise / 0.045);
  const chromaComponent = clamp01(input.chromaDelta / 0.18);
  const fluxComponent = clamp01(input.spectralFlux / 0.45);

  return clamp01(Math.max(
    input.previousWasSilent ? 0.92 : 0,
    input.candidateChanged ? 0.78 : 0,
    energyComponent * 0.72,
    chromaComponent * 0.68,
    fluxComponent * 0.74,
  ));
}

function estimateObservedEventDuration(frame: AudioEvidenceFrame, previousFrame: AudioEvidenceFrame | null) {
  if (frame.candidate === "unknown") return 0;
  if (!previousFrame || previousFrame.candidate !== frame.candidate) return 0;
  return previousFrame.observedEventDurationMs + Math.max(0, frame.timestamp - previousFrame.timestamp);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
