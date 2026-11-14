import { getChordPitchClasses } from "./chordTheory.ts";
import {
  calculateChromaDeltaVector,
  estimateOnsetStrength,
  meanAbsolute,
  positiveFlux,
  type AudioEvidenceFrame,
} from "./audioEvidence.ts";

export type SupportedChord = string;

export type ChordCandidate = SupportedChord | "unknown";

export type ChordDetectionResult = {
  candidate: ChordCandidate;
  confidence: number;
  scores: Partial<Record<SupportedChord, number>>;
  rms: number;
};

const UNKNOWN_RMS_THRESHOLD = 0.006;
const UNKNOWN_SCORE_THRESHOLD = 0.1;
const UNKNOWN_CONFIDENCE_THRESHOLD = 0.53;
const UNKNOWN_MARGIN_THRESHOLD = 0.025;
const MIN_MIDI = 40;
const MAX_MIDI = 83;
const A4_MIDI = 69;
const A4_FREQUENCY = 440;

function midiToFrequency(midi: number) {
  return A4_FREQUENCY * 2 ** ((midi - A4_MIDI) / 12);
}

function getPitchClassForMidi(midi: number) {
  return ((midi % 12) + 12) % 12;
}

export function calculateRms(samples: Float32Array | readonly number[]) {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) {
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples.length);
}

function goertzelPower(samples: Float32Array | readonly number[], sampleRate: number, frequency: number) {
  const normalizedFrequency = frequency / sampleRate;
  const coefficient = 2 * Math.cos(2 * Math.PI * normalizedFrequency);
  let previous = 0;
  let previous2 = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / Math.max(1, samples.length - 1));
    const current = samples[index] * window + coefficient * previous - previous2;
    previous2 = previous;
    previous = current;
  }

  return previous2 * previous2 + previous * previous - coefficient * previous * previous2;
}

export function calculateChroma(samples: Float32Array | readonly number[], sampleRate: number) {
  const chroma = Array.from({ length: 12 }, () => 0);

  for (let midi = MIN_MIDI; midi <= MAX_MIDI; midi += 1) {
    const frequency = midiToFrequency(midi);
    if (frequency >= sampleRate / 2) continue;
    chroma[getPitchClassForMidi(midi)] += goertzelPower(samples, sampleRate, frequency);
  }

  const total = chroma.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return chroma;
  return chroma.map((value) => value / total);
}

export function scoreChord(chroma: readonly number[], chord: SupportedChord) {
  const notes = getChordPitchClasses(chord);
  if (!notes) return 0;
  const positive = notes.reduce((sum, note) => sum + (chroma[note] ?? 0), 0) / notes.length;
  const negativeNotes = Math.max(1, 12 - notes.length);
  const negative = chroma.reduce((sum, value, index) => sum + (notes.includes(index) ? 0 : value), 0) / negativeNotes;
  return Math.max(0, positive - negative * 0.65);
}

export function createAudioEvidenceFrame(
  samples: Float32Array | readonly number[],
  sampleRate: number,
  expectedChords: readonly SupportedChord[],
  options: {
    timestamp?: number;
    previousFrame?: AudioEvidenceFrame | null;
    topCandidateCount?: number;
  } = {},
): AudioEvidenceFrame {
  const timestamp = options.timestamp ?? Date.now();
  const topCandidateCount = options.topCandidateCount ?? 3;
  const rms = calculateRms(samples);
  const previousFrame = options.previousFrame ?? null;
  const deltaMs = previousFrame ? Math.max(0, timestamp - previousFrame.timestamp) : null;
  const rmsDelta = previousFrame ? rms - previousFrame.rms : null;
  const energyRise = Math.max(0, rmsDelta ?? 0);

  if (rms < UNKNOWN_RMS_THRESHOLD || expectedChords.length === 0) {
    const chroma = Array.from({ length: 12 }, () => 0);
    const temporal = calculateTemporalEvidence({
      chroma,
      rms,
      energyRise,
      candidate: "unknown",
      candidateChanged: previousFrame ? previousFrame.candidate !== "unknown" : false,
      previousFrame,
      timestamp,
    });

    return {
      timestamp,
      sampleRate,
      windowSize: samples.length,
      chroma,
      rms,
      scores: {},
      topCandidates: [],
      candidate: "unknown",
      confidence: 0,
      bestScore: 0,
      secondScore: 0,
      scoreMargin: 0,
      deltaMs,
      rmsDelta,
      energyRise,
      ...temporal,
      repeatedCandidateFrames: 0,
    };
  }

  const uniqueChords = Array.from(new Set(expectedChords));
  const chroma = calculateChroma(samples, sampleRate);
  const ranked = uniqueChords
    .map((chord) => ({ chord, score: scoreChord(chroma, chord) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0] ?? { chord: "unknown" as ChordCandidate, score: 0 };
  const next = ranked[1];
  const margin = best.score - (next?.score ?? 0);
  const confidence = Math.max(0, Math.min(1, best.score / Math.max(0.000001, best.score + (next?.score ?? 0))));
  const scores = Object.fromEntries(ranked.map(({ chord, score }) => [chord, score])) as Partial<Record<SupportedChord, number>>;
  const candidate =
    best.score < UNKNOWN_SCORE_THRESHOLD ||
    confidence < UNKNOWN_CONFIDENCE_THRESHOLD ||
    margin < UNKNOWN_MARGIN_THRESHOLD
      ? "unknown"
      : best.chord;
  const candidateChanged = previousFrame ? previousFrame.candidate !== candidate : candidate !== "unknown";
  const repeatedCandidateFrames =
    previousFrame && candidate !== "unknown" && previousFrame.candidate === candidate
      ? previousFrame.repeatedCandidateFrames + 1
      : candidate === "unknown"
        ? 0
        : 1;
  const temporal = calculateTemporalEvidence({
    chroma,
    rms,
    energyRise,
    candidate,
    candidateChanged,
    previousFrame,
    timestamp,
  });
  const topScoreSum = ranked.slice(0, topCandidateCount).reduce((sum, item) => sum + item.score, 0);
  const topCandidates = ranked.slice(0, topCandidateCount).map((item) => ({
    chord: item.chord,
    score: item.score,
    confidence: topScoreSum > 0 ? item.score / topScoreSum : 0,
  }));

  return {
    timestamp,
    sampleRate,
    windowSize: samples.length,
    chroma,
    rms,
    scores,
    topCandidates,
    candidate,
    confidence,
    bestScore: best.score,
    secondScore: next?.score ?? 0,
    scoreMargin: margin,
    deltaMs,
    rmsDelta,
    energyRise,
    ...temporal,
    repeatedCandidateFrames,
  };
}

export function createAudioEvidenceFrameFromChroma(input: {
  timestamp: number;
  sampleRate: number;
  windowSize: number;
  chroma: readonly number[];
  rms: number;
  expectedChords: readonly SupportedChord[];
  previousFrame?: AudioEvidenceFrame | null;
  topCandidateCount?: number;
}): AudioEvidenceFrame {
  const previousFrame = input.previousFrame ?? null;
  const deltaMs = previousFrame ? Math.max(0, input.timestamp - previousFrame.timestamp) : null;
  const rmsDelta = previousFrame ? input.rms - previousFrame.rms : null;
  const energyRise = Math.max(0, rmsDelta ?? 0);
  const topCandidateCount = input.topCandidateCount ?? 3;

  if (input.rms < UNKNOWN_RMS_THRESHOLD || input.expectedChords.length === 0) {
    const candidateChanged = previousFrame ? previousFrame.candidate !== "unknown" : false;
    const temporal = calculateTemporalEvidence({
      chroma: input.chroma,
      rms: input.rms,
      energyRise,
      candidate: "unknown",
      candidateChanged,
      previousFrame,
      timestamp: input.timestamp,
    });

    return {
      timestamp: input.timestamp,
      sampleRate: input.sampleRate,
      windowSize: input.windowSize,
      chroma: [...input.chroma],
      rms: input.rms,
      scores: {},
      topCandidates: [],
      candidate: "unknown",
      confidence: 0,
      bestScore: 0,
      secondScore: 0,
      scoreMargin: 0,
      deltaMs,
      rmsDelta,
      energyRise,
      ...temporal,
      repeatedCandidateFrames: 0,
    };
  }

  const uniqueChords = Array.from(new Set(input.expectedChords));
  const ranked = uniqueChords
    .map((chord) => ({ chord, score: scoreChord(input.chroma, chord) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0] ?? { chord: "unknown" as ChordCandidate, score: 0 };
  const next = ranked[1];
  const margin = best.score - (next?.score ?? 0);
  const confidence = Math.max(0, Math.min(1, best.score / Math.max(0.000001, best.score + (next?.score ?? 0))));
  const candidate =
    best.score < UNKNOWN_SCORE_THRESHOLD ||
    confidence < UNKNOWN_CONFIDENCE_THRESHOLD ||
    margin < UNKNOWN_MARGIN_THRESHOLD
      ? "unknown"
      : best.chord;
  const candidateChanged = previousFrame ? previousFrame.candidate !== candidate : candidate !== "unknown";
  const repeatedCandidateFrames =
    previousFrame && candidate !== "unknown" && previousFrame.candidate === candidate
      ? previousFrame.repeatedCandidateFrames + 1
      : candidate === "unknown"
        ? 0
        : 1;
  const temporal = calculateTemporalEvidence({
    chroma: input.chroma,
    rms: input.rms,
    energyRise,
    candidate,
    candidateChanged,
    previousFrame,
    timestamp: input.timestamp,
  });
  const scores = Object.fromEntries(ranked.map(({ chord, score }) => [chord, score])) as Partial<Record<SupportedChord, number>>;
  const topScoreSum = ranked.slice(0, topCandidateCount).reduce((sum, item) => sum + item.score, 0);
  const topCandidates = ranked.slice(0, topCandidateCount).map((item) => ({
    chord: item.chord,
    score: item.score,
    confidence: topScoreSum > 0 ? item.score / topScoreSum : 0,
  }));

  return {
    timestamp: input.timestamp,
    sampleRate: input.sampleRate,
    windowSize: input.windowSize,
    chroma: [...input.chroma],
    rms: input.rms,
    scores,
    topCandidates,
    candidate,
    confidence,
    bestScore: best.score,
    secondScore: next?.score ?? 0,
    scoreMargin: margin,
    deltaMs,
    rmsDelta,
    energyRise,
    ...temporal,
    repeatedCandidateFrames,
  };
}

function calculateTemporalEvidence(input: {
  chroma: readonly number[];
  rms: number;
  energyRise: number;
  candidate: ChordCandidate;
  candidateChanged: boolean;
  previousFrame: AudioEvidenceFrame | null;
  timestamp: number;
}) {
  const chromaDeltaVector = calculateChromaDeltaVector(input.chroma, input.previousFrame?.chroma);
  const chromaDelta = meanAbsolute(chromaDeltaVector);
  const spectralFlux = positiveFlux(chromaDeltaVector);
  const onsetStrength = estimateOnsetStrength({
    energyRise: input.energyRise,
    chromaDelta,
    spectralFlux,
    candidateChanged: input.candidateChanged,
    previousWasSilent: !input.previousFrame || input.previousFrame.candidate === "unknown" || input.previousFrame.rms < UNKNOWN_RMS_THRESHOLD,
  });
  const observedEventDurationMs =
    input.candidate !== "unknown" &&
    input.previousFrame?.candidate === input.candidate
      ? input.previousFrame.observedEventDurationMs + Math.max(0, input.timestamp - input.previousFrame.timestamp)
      : 0;

  return {
    onsetStrength,
    chromaDelta,
    chromaDeltaVector,
    spectralFlux,
    observedEventDurationMs,
    candidateChanged: input.candidateChanged,
  };
}

export function detectExpectedChord(
  samples: Float32Array | readonly number[],
  sampleRate: number,
  expectedChords: readonly SupportedChord[],
): ChordDetectionResult {
  const evidence = createAudioEvidenceFrame(samples, sampleRate, expectedChords);

  return {
    candidate: evidence.candidate,
    confidence: evidence.confidence,
    scores: evidence.scores,
    rms: evidence.rms,
  };
}
