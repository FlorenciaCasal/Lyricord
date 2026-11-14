import fs from "node:fs";
import path from "node:path";
import { parseAudioEvidenceRecording, type AudioEvidenceFrame } from "../mobile/src/music/audioEvidence.ts";
import type { ChordTimelineEvent } from "../mobile/src/music/chordTimeline.ts";
import type { ExpectedMusicSequence } from "../mobile/src/music/expectedMusic.ts";
import {
  createGroundTruthAnnotationTemplate,
  createRealTrackingFixtureFromRecordingAndAnnotation,
  parseRealGroundTruthAnnotation,
  parseTimecodeMs,
  rescoreAudioEvidenceFramesForExpectedSequence,
  serializeRealGroundTruthAnnotation,
  toEvaluationEvidenceRecording,
} from "../mobile/src/music/realEvidenceDataset.ts";
import {
  createChordPositionFollowerTracker,
  createOnlineChordAlignerTracker,
  evaluatePositionTracker,
  evaluateVisualPolicy,
  type EvaluationFrameResult,
  type EvaluationEvidenceRecording,
  type GroundTruthSegment,
  type PositionTrackerEvaluation,
  type VisualPolicyEvaluation,
} from "../mobile/src/music/positionTrackerEvaluation.ts";
import { getChordMatchFamily } from "../mobile/src/music/chordTheory.ts";
import { suggestGroundTruthForRecording } from "../mobile/src/music/groundTruthSuggestion.ts";
import { formatObservedMusicEvents, segmentObservedMusicEvents } from "../mobile/src/music/observedMusicEvents.ts";

type TrackerReport = {
  tracker: string;
  correctFrameRatio: number;
  meanAbsoluteEventError: number | null;
  incorrectCommits: number;
  missedExpectedEvents: number;
  missedExpectedEventIndexes: number[];
  maxIncorrectJumpDistance: number;
  prolongedFreezeCount: number;
  maxCommittedFreezeDurationMs: number;
  meanRecoveryTimeMs: number | null;
  wrongHighlightDurationMs: number;
  meanDisplayedLagEvents: number | null;
  maxDisplayedLagEvents: number;
  falseLargeJumpCount: number;
  maxDisplayedJumpDistance: number;
};

type RunReport = {
  evaluation: PositionTrackerEvaluation;
  visual: VisualPolicyEvaluation;
  metrics: TrackerReport;
};

const command = process.argv[2];

if (!command || command === "--help" || command === "-h") {
  printHelp();
  process.exit(command ? 0 : 1);
}

if (command === "template") {
  runTemplateCommand();
} else if (command === "suggest") {
  runSuggestCommand();
} else if (command === "human-regions") {
  runHumanRegionsCommand();
} else if (command === "report") {
  runReportCommand();
} else {
  console.error(`Unknown command "${command}".`);
  printHelp();
  process.exit(1);
}

function runHumanRegionsCommand() {
  const recordingPath = requiredArg(3, "recording path");
  const outputPath = requiredArg(4, "output path");
  const videoPath = getFlagValue("--video");
  const regionSpecs = getFlagValue("--regions") ?? "00:05-00:20,03:25-03:52";
  const recording = parseAudioEvidenceRecording(fs.readFileSync(recordingPath, "utf8"));
  const expected = getExpectedMusicSequence(recordingPath, recording.metadata?.expectedMusicSequence);
  const rescoredFrames = rescoreAudioEvidenceFramesForExpectedSequence(recording.frames, expected);
  const recordingStartMs = rescoredFrames[0]?.timestamp ?? 0;
  const regions = parseRegionSpecs(regionSpecs).map((region, index) =>
    buildHumanRegionTemplate({
      id: `region-${index + 1}`,
      label: index === 0 ? "first-divergence" : index === 1 ? "extra-chord-and-recovery" : `region-${index + 1}`,
      startMs: recordingStartMs + region.startMs,
      endMs: recordingStartMs + region.endMs,
      recordingStartMs,
      frames: rescoredFrames,
      expected,
    }),
  );

  const output = {
    version: 1,
    kind: "human-region-ground-truth-template",
    recordingFile: path.basename(recordingPath),
    referenceVideo: videoPath ? path.basename(videoPath) : null,
    name: recording.metadata?.songTitle ?? path.basename(recordingPath),
    notes: [
      "Manual review required: this file is only a worksheet. Do not treat assisted evidence as ground truth.",
      "Open the reference video, seek to each region, and fill humanEvents from what was actually played.",
      "Use timelineIndex for written score events, timelineIndex: null for extra observed chords, and omittedWrittenEvents for written chords skipped by the player.",
      "Times are relative to the beginning of the recording/video.",
    ],
    annotationSchema: {
      humanEvents: [
        {
          startTime: "mm:ss.mmm",
          endTime: "mm:ss.mmm",
          playedChord: "C#m",
          timelineIndex: 0,
          status: "played-written | extra | uncertain",
          notes: "timelineIndex must be null for extra chords not written in the score",
        },
      ],
      omittedWrittenEvents: [
        {
          approximateTime: "mm:ss.mmm",
          timelineIndex: 0,
          chord: "C#m",
          notes: "Written event that was not actually played",
        },
      ],
    },
    writtenTimeline: expected.events.map((event) => ({
      timelineIndex: event.timelineIndex,
      chord: event.normalizedChord,
      originalChord: event.originalChord,
      lineIndex: event.lineIndex,
      charStart: event.charStart,
      charEnd: event.charEnd,
      boundaryBefore: event.boundaryBefore,
      boundaryAfter: event.boundaryAfter,
      sectionMarker: event.sectionMarker,
    })),
    regions,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Human region annotation worksheet written to ${outputPath}`);
  for (const region of regions) {
    console.log(`${region.label}: ${region.startTime}-${region.endTime}`);
    console.log(region.assistedEvidence.reviewTimeline.slice(0, 12).join("\n"));
  }
}

function runTemplateCommand() {
  const recordingPath = requiredArg(3, "recording path");
  const outputPath = requiredArg(4, "output annotation path");
  const includeEveryEvent = process.argv.includes("--all-events");
  const recording = parseAudioEvidenceRecording(fs.readFileSync(recordingPath, "utf8"));
  const expected = getExpectedMusicSequence(recordingPath, recording.metadata?.expectedMusicSequence);
  const template = createGroundTruthAnnotationTemplate({
    recordingFile: path.basename(recordingPath),
    name: recording.metadata?.songTitle ?? path.basename(recordingPath),
    expectedMusicSequence: expected,
    includeEveryEvent,
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serializeRealGroundTruthAnnotation(template));
  console.log(`Ground truth annotation template written to ${outputPath}`);
  console.log(`Timeline events: ${expected.events.length}`);
}

function runSuggestCommand() {
  const recordingPath = requiredArg(3, "recording path");
  const timelineOnly = process.argv.includes("--timeline");
  const recording = parseAudioEvidenceRecording(fs.readFileSync(recordingPath, "utf8"));
  const expected = getExpectedMusicSequence(recordingPath, recording.metadata?.expectedMusicSequence);
  const suggestion = suggestGroundTruthForRecording({
    recording,
    expectedMusicSequence: expected,
    recordingFile: path.basename(recordingPath),
    name: recording.metadata?.songTitle ?? path.basename(recordingPath),
  });

  if (timelineOnly) {
    console.log(suggestion.reviewTimeline.join("\n"));
  } else {
    console.log(JSON.stringify(suggestion, null, 2));
  }
}

function runReportCommand() {
  const recordingPath = requiredArg(3, "recording path");
  const annotationPath = requiredArg(4, "annotation path");
  const recording = parseAudioEvidenceRecording(fs.readFileSync(recordingPath, "utf8"));
  const annotation = parseRealGroundTruthAnnotation(fs.readFileSync(annotationPath, "utf8"));
  const expected = getExpectedMusicSequence(recordingPath, recording.metadata?.expectedMusicSequence);
  const fixture = createRealTrackingFixtureFromRecordingAndAnnotation({
    name: annotation.name ?? recording.metadata?.songTitle ?? path.basename(recordingPath),
    evidenceRecording: recording,
    expectedMusicSequence: expected,
    annotation,
  });
  const evidence = toEvaluationEvidenceRecording(fixture);
  const timeline = timelineFromExpected(expected);

  const oldReport = runTrackerReport({
    expected,
    evidence,
    trackerName: "ChordPositionFollower",
    evaluation: evaluatePositionTracker({
      expected,
      evidence,
      tracker: createChordPositionFollowerTracker(timeline),
    }),
  });
  const onlineReport = runTrackerReport({
    expected,
    evidence,
    trackerName: "OnlineChordAligner",
    evaluation: evaluatePositionTracker({
      expected,
      evidence,
      tracker: createOnlineChordAlignerTracker(),
    }),
  });

  console.log(`Recording: ${recordingPath}`);
  console.log(`Annotation: ${annotationPath}`);
  console.log(`Ground truth segments: ${fixture.groundTruth?.segments.length ?? 0}`);
  console.log(`Expected events: ${expected.events.length}`);
  console.table([oldReport.metrics, onlineReport.metrics]);

  if (expected.events.some((event, index) =>
    event.normalizedChord === "B" && expected.events[index + 1]?.normalizedChord === "C#m"
  )) {
    console.log("B → C#m → X transition report");
    console.table([
      ...reportBToCSharpMinorTransitions(expected, evidence, oldReport, "ChordPositionFollower"),
      ...reportBToCSharpMinorTransitions(expected, evidence, onlineReport, "OnlineChordAligner"),
    ]);
  }
}

function runTrackerReport(input: {
  expected: ExpectedMusicSequence;
  evidence: EvaluationEvidenceRecording;
  trackerName: string;
  evaluation: PositionTrackerEvaluation;
}): RunReport {
  const visual = evaluateVisualPolicy(input.evaluation);
  return {
    evaluation: input.evaluation,
    visual,
    metrics: {
      tracker: input.trackerName,
      correctFrameRatio: round(input.evaluation.metrics.correctFrameRatio, 3),
      meanAbsoluteEventError: nullableRound(input.evaluation.metrics.meanAbsoluteEventError, 3),
      incorrectCommits: input.evaluation.metrics.incorrectCommits,
      missedExpectedEvents: getMissedExpectedEvents(input.evaluation.frames).length,
      missedExpectedEventIndexes: getMissedExpectedEvents(input.evaluation.frames),
      maxIncorrectJumpDistance: input.evaluation.metrics.maxIncorrectJumpDistance,
      prolongedFreezeCount: input.evaluation.metrics.prolongedFreezeCount,
      maxCommittedFreezeDurationMs: getMaxCommittedFreezeDurationMs(input.evaluation.frames),
      meanRecoveryTimeMs: nullableRound(input.evaluation.metrics.meanRecoveryTimeMs, 0),
      wrongHighlightDurationMs: round(visual.metrics.wrongHighlightDurationMs, 0),
      meanDisplayedLagEvents: nullableRound(visual.metrics.meanDisplayedLagEvents, 2),
      maxDisplayedLagEvents: visual.metrics.maxDisplayedLagEvents,
      falseLargeJumpCount: visual.metrics.falseLargeJumpCount,
      maxDisplayedJumpDistance: visual.metrics.maxDisplayedJumpDistance,
    },
  };
}

function reportBToCSharpMinorTransitions(
  expected: ExpectedMusicSequence,
  evidence: EvaluationEvidenceRecording,
  report: RunReport,
  tracker: string,
) {
  const rows: Array<Record<string, string | number | boolean | null>> = [];

  for (let index = 0; index < expected.events.length - 2; index += 1) {
    const b = expected.events[index];
    const cSharpMinor = expected.events[index + 1];
    const next = expected.events[index + 2];
    if (b.normalizedChord !== "B" || cSharpMinor.normalizedChord !== "C#m") continue;

    const cSegment = findSegmentForTimelineIndex(evidence.groundTruth?.segments ?? [], cSharpMinor.timelineIndex);
    const startMs = cSegment?.startMs ?? 0;
    const endMs = cSegment?.endMs ?? 0;
    const frames = report.evaluation.frames.filter((frame) => frame.timestamp >= startMs && frame.timestamp < endMs);
    const visualFrames = report.visual.frames.filter((frame) => frame.timestamp >= startMs && frame.timestamp < endMs);
    const cEvidence = summarizeAcousticEvidence(evidence, cSharpMinor, startMs, endMs);

    rows.push({
      tracker,
      transition: `${b.timelineIndex}:B→${cSharpMinor.timelineIndex}:C#m→${next.timelineIndex}:${next.normalizedChord}`,
      cGroundTruthSec: cSegment ? `${relativeSec(evidence, cSegment.startMs)}-${relativeSec(evidence, cSegment.endMs)}` : "not-annotated",
      cTop1Frames: cEvidence.top1,
      cTop3Frames: cEvidence.top3,
      cCandidateFrames: cEvidence.candidate,
      cMaxScore: cEvidence.maxScore,
      estimatedHit: frames.some((frame) => frame.estimatedTimelineIndex === cSharpMinor.timelineIndex),
      committedHit: frames.some((frame) => frame.committedTimelineIndex === cSharpMinor.timelineIndex),
      displayedHit: visualFrames.some((frame) => frame.displayedTimelineIndex === cSharpMinor.timelineIndex),
      estimatedValues: compactUnique(frames.map((frame) => frame.estimatedTimelineIndex)),
      committedValues: compactUnique(frames.map((frame) => frame.committedTimelineIndex)),
      displayedValues: compactUnique(visualFrames.map((frame) => frame.displayedTimelineIndex)),
      diagnosis: diagnoseTransition(frames, visualFrames, cEvidence, cSharpMinor.timelineIndex),
    });
  }

  return rows;
}

function summarizeAcousticEvidence(
  evidence: EvaluationEvidenceRecording,
  event: ExpectedMusicSequence["events"][number],
  startMs: number,
  endMs: number,
) {
  const frames = evidence.frames.filter((frame) => frame.timestamp >= startMs && frame.timestamp < endMs);
  let candidate = 0;
  let top1 = 0;
  let top3 = 0;
  let maxScore = 0;

  for (const frame of frames) {
    const isCompatible = (chord: string | undefined) =>
      Boolean(chord) && event.compatibleChords.some((expected) => getChordMatchFamily(expected, chord ?? "").weight > 0);
    if (isCompatible(frame.candidate)) candidate += 1;
    if (isCompatible(frame.topCandidates[0]?.chord)) top1 += 1;
    if (frame.topCandidates.slice(0, 3).some((item) => isCompatible(item.chord))) top3 += 1;
    maxScore = Math.max(maxScore, ...event.compatibleChords.map((chord) => frame.scores[chord] ?? 0));
  }

  return {
    candidate,
    top1,
    top3,
    maxScore: round(maxScore, 3),
  };
}

function diagnoseTransition(
  frames: readonly EvaluationFrameResult[],
  visualFrames: readonly { displayedTimelineIndex: number }[],
  evidence: ReturnType<typeof summarizeAcousticEvidence>,
  cSharpMinorIndex: number,
) {
  if (visualFrames.some((frame) => frame.displayedTimelineIndex === cSharpMinorIndex)) return "displayed";
  if (frames.some((frame) => frame.committedTimelineIndex === cSharpMinorIndex)) return "committed-not-displayed";
  if (frames.some((frame) => frame.estimatedTimelineIndex === cSharpMinorIndex)) return "estimated-not-committed";
  if (evidence.top1 > 0 || evidence.top3 > 0 || evidence.candidate > 0) return "acoustic-present-not-positioned";
  return "acoustic-weak-or-unplayed";
}

function getMissedExpectedEvents(frames: readonly EvaluationFrameResult[]) {
  const truthIndexes = new Set(
    frames
      .map((frame) => frame.groundTruthTimelineIndex)
      .filter((index): index is number => typeof index === "number"),
  );
  const hitIndexes = new Set(
    frames
      .filter((frame) => frame.groundTruthTimelineIndex === frame.committedTimelineIndex)
      .map((frame) => frame.groundTruthTimelineIndex)
      .filter((index): index is number => typeof index === "number"),
  );

  return [...truthIndexes].filter((index) => !hitIndexes.has(index)).sort((a, b) => a - b);
}

function getMaxCommittedFreezeDurationMs(frames: readonly EvaluationFrameResult[]) {
  let max = 0;
  let freezeStartedAt: number | null = null;
  let frozenIndex: number | null = null;

  for (const frame of frames) {
    const wrong = frame.groundTruthTimelineIndex !== null && frame.committedTimelineIndex !== frame.groundTruthTimelineIndex;
    if (!wrong) {
      freezeStartedAt = null;
      frozenIndex = null;
      continue;
    }

    if (frozenIndex !== frame.committedTimelineIndex) {
      frozenIndex = frame.committedTimelineIndex;
      freezeStartedAt = frame.timestamp;
    } else if (freezeStartedAt !== null) {
      max = Math.max(max, frame.timestamp - freezeStartedAt);
    }
  }

  return round(max, 0);
}

function findSegmentForTimelineIndex(segments: readonly GroundTruthSegment[], timelineIndex: number) {
  return segments.find((segment) => segment.timelineIndex === timelineIndex) ?? null;
}

function compactUnique(values: readonly (number | null)[]) {
  const unique = [...new Set(values.filter((value): value is number => typeof value === "number"))];
  if (unique.length <= 8) return unique.join(",");
  return `${unique.slice(0, 4).join(",")}…${unique.slice(-3).join(",")}`;
}

function timelineFromExpected(expected: ExpectedMusicSequence): ChordTimelineEvent[] {
  return expected.events.map((event) => ({
    id: `expected:${event.timelineIndex}`,
    chord: event.originalChord,
    originalChord: event.originalChord,
    normalizedChord: event.normalizedChord,
    lineIndex: event.lineIndex,
    charIndex: event.charStart,
    charStart: event.charStart,
    charEnd: event.charEnd,
    supportedChord: event.compatibleChords[0] ?? null,
    matchChords: [...event.compatibleChords],
    annotations: [],
    sectionMarkers: event.sectionMarker ? [event.sectionMarker] : [],
    boundaries: [],
    boundaryAfter: event.boundaryAfter,
  }));
}

function getExpectedMusicSequence(recordingPath: string, expected?: ExpectedMusicSequence) {
  if (!expected) {
    throw new Error(`${recordingPath} does not include ExpectedMusicSequence metadata.`);
  }
  return expected;
}

function requiredArg(index: number, label: string) {
  const value = process.argv[index];
  if (!value) {
    console.error(`Missing ${label}.`);
    printHelp();
    process.exit(1);
  }
  return value;
}

function getFlagValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function parseRegionSpecs(value: string) {
  return value.split(",").map((part) => {
    const [start, end] = part.split("-");
    if (!start || !end) {
      throw new Error(`Invalid region "${part}". Use mm:ss-mm:ss or mm:ss.mmm-mm:ss.mmm.`);
    }
    const startMs = parseTimecodeMs(start);
    const endMs = parseTimecodeMs(end);
    if (endMs <= startMs) {
      throw new Error(`Invalid region "${part}": end must be after start.`);
    }
    return { startMs, endMs };
  });
}

function buildHumanRegionTemplate(input: {
  id: string;
  label: string;
  startMs: number;
  endMs: number;
  recordingStartMs: number;
  frames: readonly AudioEvidenceFrame[];
  expected: ExpectedMusicSequence;
}) {
  const frames = input.frames.filter((frame) => frame.timestamp >= input.startMs && frame.timestamp <= input.endMs);
  const observedEvents = segmentObservedMusicEvents(frames);

  return {
    id: input.id,
    label: input.label,
    startTime: formatOffset(input.startMs - input.recordingStartMs),
    endTime: formatOffset(input.endMs - input.recordingStartMs),
    instructions: [
      "Listen/watch this exact region in the reference video.",
      "Fill humanEvents with the chords actually played, including extra chords with timelineIndex: null.",
      "Add omittedWrittenEvents for written timeline events visible in expectedReference that were skipped.",
      "Assisted evidence below is only a cue, not truth.",
    ],
    humanEvents: [
      {
        startTime: "",
        endTime: "",
        playedChord: "",
        timelineIndex: null as number | null,
        status: "played-written | extra | uncertain",
        notes: "",
      },
    ],
    omittedWrittenEvents: [] as Array<{
      approximateTime: string;
      timelineIndex: number;
      chord: string;
      notes?: string;
    }>,
    expectedReference: expectedCandidatesForRegion(input.expected, frames, 16),
    assistedEvidence: {
      candidateSegments: summarizeCandidateSegments(frames, input.recordingStartMs),
      observedEventSegments: observedEvents.map((event) => ({
        startTime: formatOffset(event.startTime - input.recordingStartMs),
        endTime: formatOffset(event.endTime - input.recordingStartMs),
        durationMs: round(event.durationMs, 0),
        eventType: event.eventType,
        chord: event.representativeChord,
        confidence: round(event.confidence, 3),
        onsetStrength: round(event.onsetStrength, 3),
        meanChromaDelta: round(event.meanChromaDelta, 3),
        maxChromaDelta: round(event.maxChromaDelta, 3),
        topCandidates: event.topCandidates.slice(0, 3).map((candidate) => ({
          chord: candidate.chord,
          score: round(candidate.score, 3),
        })),
        chordDistribution: event.chordDistribution.slice(0, 4).map((candidate) => ({
          chord: candidate.chord,
          score: round(candidate.score, 3),
        })),
      })),
      reviewTimeline: formatObservedMusicEvents(observedEvents, input.recordingStartMs),
    },
  };
}

function expectedCandidatesForRegion(
  expected: ExpectedMusicSequence,
  frames: readonly AudioEvidenceFrame[],
  maxCandidates: number,
) {
  const aggregate = new Map<number, { score: number; top3Frames: number; candidateFrames: number }>();

  for (const frame of frames) {
    for (const event of expected.events) {
      const score = Math.max(...event.compatibleChords.map((chord) => frame.scores[chord] ?? 0));
      if (score <= 0) continue;
      const current = aggregate.get(event.timelineIndex) ?? { score: 0, top3Frames: 0, candidateFrames: 0 };
      current.score = Math.max(current.score, score);
      if (event.compatibleChords.some((chord) => frame.candidate && getChordMatchFamily(chord, frame.candidate).weight > 0)) {
        current.candidateFrames += 1;
      }
      if (frame.topCandidates.slice(0, 3).some((candidate) =>
        event.compatibleChords.some((chord) => getChordMatchFamily(chord, candidate.chord).weight > 0)
      )) {
        current.top3Frames += 1;
      }
      aggregate.set(event.timelineIndex, current);
    }
  }

  return [...aggregate.entries()]
    .sort((a, b) =>
      b[1].candidateFrames - a[1].candidateFrames
      || b[1].top3Frames - a[1].top3Frames
      || b[1].score - a[1].score
      || a[0] - b[0]
    )
    .slice(0, maxCandidates)
    .sort((a, b) => a[0] - b[0])
    .map(([timelineIndex, evidence]) => {
      const event = expected.events.find((item) => item.timelineIndex === timelineIndex);
      return {
        timelineIndex,
        chord: event?.normalizedChord ?? "?",
        originalChord: event?.originalChord ?? "?",
        lineIndex: event?.lineIndex ?? null,
        charStart: event?.charStart ?? null,
        charEnd: event?.charEnd ?? null,
        acousticCue: {
          maxScore: round(evidence.score, 3),
          candidateFrames: evidence.candidateFrames,
          top3Frames: evidence.top3Frames,
        },
      };
    });
}

function summarizeCandidateSegments(frames: readonly AudioEvidenceFrame[], recordingStartMs: number) {
  const rows: Array<{
    startTime: string;
    endTime: string;
    candidate: string;
    frameCount: number;
    meanConfidence: number;
    maxConfidence: number;
    meanRms: number;
    maxOnsetStrength: number;
    maxChromaDelta: number;
    top3: Array<{ chord: string; score: number }>;
  }> = [];
  let start = 0;

  while (start < frames.length) {
    const candidate = frames[start].candidate ?? "unknown";
    let end = start + 1;
    while (end < frames.length && (frames[end].candidate ?? "unknown") === candidate) end += 1;
    const slice = frames.slice(start, end);
    rows.push({
      startTime: formatOffset(slice[0].timestamp - recordingStartMs),
      endTime: formatOffset((slice[slice.length - 1].timestamp + (slice[slice.length - 1].deltaMs ?? 0)) - recordingStartMs),
      candidate,
      frameCount: slice.length,
      meanConfidence: round(mean(slice.map((frame) => frame.confidence)), 3),
      maxConfidence: round(Math.max(...slice.map((frame) => frame.confidence)), 3),
      meanRms: round(mean(slice.map((frame) => frame.rms)), 4),
      maxOnsetStrength: round(Math.max(...slice.map((frame) => frame.onsetStrength ?? 0)), 3),
      maxChromaDelta: round(Math.max(...slice.map((frame) => frame.chromaDelta ?? 0)), 3),
      top3: aggregateTopCandidates(slice).slice(0, 3),
    });
    start = end;
  }

  return rows;
}

function aggregateTopCandidates(frames: readonly AudioEvidenceFrame[]) {
  const scores = new Map<string, number[]>();
  for (const frame of frames) {
    for (const candidate of frame.topCandidates.slice(0, 5)) {
      const values = scores.get(candidate.chord) ?? [];
      values.push(candidate.score);
      scores.set(candidate.chord, values);
    }
  }

  return [...scores.entries()]
    .map(([chord, values]) => ({ chord, score: round(mean(values), 3) }))
    .sort((a, b) => b.score - a.score);
}

function relativeSec(evidence: EvaluationEvidenceRecording, timestamp: number) {
  const first = evidence.frames[0]?.timestamp ?? 0;
  return round((timestamp - first) / 1000, 2);
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function nullableRound(value: number | null, digits: number) {
  return value === null ? null : round(value, digits);
}

function formatOffset(ms: number) {
  const clamped = Math.max(0, Math.round(ms));
  const minutes = Math.floor(clamped / 60000);
  const seconds = Math.floor((clamped % 60000) / 1000);
  const millis = clamped % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function mean(values: readonly number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function printHelp() {
  console.log(`
Usage:
  node --experimental-strip-types scripts/real-evidence-ground-truth.ts template <recording.json> <annotation.ground-truth.json> [--all-events]
  node --experimental-strip-types scripts/real-evidence-ground-truth.ts suggest <recording.json> [--timeline]
  node --experimental-strip-types scripts/real-evidence-ground-truth.ts human-regions <recording.json> <output.json> [--video <reference.mp4>] [--regions 00:05-00:20,03:25-03:52]
  node --experimental-strip-types scripts/real-evidence-ground-truth.ts report <recording.json> <annotation.ground-truth.json>

Annotation format:
  {
    "version": 1,
    "changes": [
      { "time": "00:00.000", "timelineIndex": 0 },
      { "time": "00:03.250", "timelineIndex": 1 }
    ]
  }

Times are relative to the beginning of the recording. Each change starts a segment that ends at the next change.
Suggestions are only review aids; convert suggestedTimelineIndex to timelineIndex after human review.
`);
}
