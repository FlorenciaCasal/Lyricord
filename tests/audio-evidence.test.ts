import assert from "node:assert/strict";
import test from "node:test";
import {
  createAudioEvidenceFrame,
  detectExpectedChord,
} from "../mobile/src/music/chordDetection.ts";
import {
  createAudioEvidenceRecording,
  parseAudioEvidenceRecording,
  serializeAudioEvidenceRecording,
} from "../mobile/src/music/audioEvidence.ts";
import { getChordPitchClasses } from "../mobile/src/music/chordTheory.ts";

const SAMPLE_RATE = 44100;
const LENGTH = 4096;

function pitchClassToFrequency(pitchClass: number) {
  const midi = 48 + pitchClass;
  return 440 * 2 ** ((midi - 69) / 12);
}

function synthesizeChord(chord: string) {
  const pitchClasses = getChordPitchClasses(chord);
  assert.ok(pitchClasses, `El test necesita un acorde parseable: ${chord}`);
  const frequencies = pitchClasses.map(pitchClassToFrequency);
  const samples = new Float32Array(LENGTH);
  for (let index = 0; index < LENGTH; index += 1) {
    const time = index / SAMPLE_RATE;
    samples[index] = frequencies.reduce(
      (sum, frequency) => sum + Math.sin(2 * Math.PI * frequency * time) * 0.22,
      0,
    );
  }
  return samples;
}

function scaleSamples(samples: Float32Array, factor: number) {
  return Float32Array.from(samples, (sample) => sample * factor);
}

test("AudioEvidenceFrame conserva la evidencia acustico-musical de una ventana", () => {
  const frame = createAudioEvidenceFrame(synthesizeChord("C#m"), SAMPLE_RATE, ["C#m", "A", "E"], {
    timestamp: 1200,
  });

  assert.equal(frame.timestamp, 1200);
  assert.equal(frame.sampleRate, SAMPLE_RATE);
  assert.equal(frame.windowSize, LENGTH);
  assert.equal(frame.chroma.length, 12);
  assert.ok(frame.rms > 0);
  assert.equal(frame.candidate, "C#m");
  assert.equal(frame.topCandidates[0].chord, "C#m");
  assert.ok((frame.scores["C#m"] ?? 0) > (frame.scores.A ?? 0));
  assert.ok(frame.confidence > 0);
  assert.ok(frame.bestScore >= frame.secondScore);
  assert.equal(frame.deltaMs, null);
  assert.equal(frame.rmsDelta, null);
});

test("detectExpectedChord usa la misma evidencia que AudioEvidenceFrame", () => {
  const samples = synthesizeChord("A");
  const frame = createAudioEvidenceFrame(samples, SAMPLE_RATE, ["A", "E", "C#m"], { timestamp: 1000 });
  const detection = detectExpectedChord(samples, SAMPLE_RATE, ["A", "E", "C#m"]);

  assert.equal(detection.candidate, frame.candidate);
  assert.equal(detection.confidence, frame.confidence);
  assert.deepEqual(detection.scores, frame.scores);
  assert.equal(detection.rms, frame.rms);
});

test("AudioEvidenceFrame expone senales temporales basicas sin detectar onset nuevo", () => {
  const first = createAudioEvidenceFrame(synthesizeChord("E"), SAMPLE_RATE, ["E", "A"], {
    timestamp: 1000,
  });
  const second = createAudioEvidenceFrame(synthesizeChord("E"), SAMPLE_RATE, ["E", "A"], {
    timestamp: 1150,
    previousFrame: first,
  });
  const third = createAudioEvidenceFrame(synthesizeChord("A"), SAMPLE_RATE, ["E", "A"], {
    timestamp: 1300,
    previousFrame: second,
  });

  assert.equal(second.deltaMs, 150);
  assert.equal(second.candidateChanged, false);
  assert.equal(second.repeatedCandidateFrames, first.repeatedCandidateFrames + 1);
  assert.equal(third.deltaMs, 150);
  assert.equal(third.candidateChanged, true);
  assert.equal(third.repeatedCandidateFrames, 1);
  assert.equal(typeof third.energyRise, "number");
  assert.equal(second.observedEventDurationMs, 150);
  assert.ok(second.onsetStrength < third.onsetStrength);
  assert.ok(third.chromaDelta > second.chromaDelta);
  assert.equal(third.chromaDeltaVector.length, 12);
  assert.ok(third.spectralFlux >= 0);
});

test("AudioEvidenceFrame distingue sustain de nuevo ataque del mismo acorde sin cambiar candidate", () => {
  const quiet = createAudioEvidenceFrame(scaleSamples(synthesizeChord("E"), 0.45), SAMPLE_RATE, ["E", "A"], {
    timestamp: 1000,
  });
  const sustain = createAudioEvidenceFrame(scaleSamples(synthesizeChord("E"), 0.45), SAMPLE_RATE, ["E", "A"], {
    timestamp: 1150,
    previousFrame: quiet,
  });
  const repeatedAttack = createAudioEvidenceFrame(scaleSamples(synthesizeChord("E"), 1.15), SAMPLE_RATE, ["E", "A"], {
    timestamp: 1300,
    previousFrame: sustain,
  });

  assert.equal(sustain.candidate, "E");
  assert.equal(repeatedAttack.candidate, "E");
  assert.equal(repeatedAttack.candidateChanged, false);
  assert.ok(sustain.observedEventDurationMs >= 150);
  assert.ok(repeatedAttack.energyRise > sustain.energyRise);
  assert.ok(repeatedAttack.onsetStrength > sustain.onsetStrength);
});

test("AudioEvidenceRecording rellena nuevas features al leer recordings legacy", () => {
  const legacyFrame = createAudioEvidenceFrame(synthesizeChord("G"), SAMPLE_RATE, ["G", "D"], {
    timestamp: 0,
  });
  const legacyJson = JSON.stringify({
    version: 1,
    frames: [
      {
        ...legacyFrame,
        onsetStrength: undefined,
        chromaDelta: undefined,
        chromaDeltaVector: undefined,
        spectralFlux: undefined,
        observedEventDurationMs: undefined,
      },
    ],
  });

  const restored = parseAudioEvidenceRecording(legacyJson);

  assert.equal(typeof restored.frames[0].onsetStrength, "number");
  assert.equal(typeof restored.frames[0].chromaDelta, "number");
  assert.equal(restored.frames[0].chromaDeltaVector.length, 12);
  assert.equal(typeof restored.frames[0].spectralFlux, "number");
  assert.equal(typeof restored.frames[0].observedEventDurationMs, "number");
});

test("AudioEvidenceRecording permite serializar y reproducir frames deterministas", () => {
  const frames = [
    createAudioEvidenceFrame(synthesizeChord("G"), SAMPLE_RATE, ["G", "D"], { timestamp: 0 }),
    createAudioEvidenceFrame(synthesizeChord("D"), SAMPLE_RATE, ["G", "D"], { timestamp: 150 }),
  ];
  const recording = createAudioEvidenceRecording(frames, {
    songTitle: "fixture",
    notes: "secuencia sintetica para tests",
  });
  const restored = parseAudioEvidenceRecording(serializeAudioEvidenceRecording(recording));

  assert.equal(restored.version, 1);
  assert.equal(restored.metadata?.songTitle, "fixture");
  assert.deepEqual(restored.frames.map((frame) => frame.candidate), ["G", "D"]);
  assert.deepEqual(restored.frames[0].chroma, frames[0].chroma);
  assert.deepEqual(restored.frames[1].scores, frames[1].scores);
  assert.equal(typeof restored.frames[1].onsetStrength, "number");
  assert.equal(typeof restored.frames[1].observedEventDurationMs, "number");
});
