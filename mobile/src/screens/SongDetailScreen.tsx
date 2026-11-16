import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AudioManager, AudioRecorder } from "react-native-audio-api";
import * as FileSystem from "expo-file-system/legacy";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as Sharing from "expo-sharing";
import * as SecureStore from "expo-secure-store";
import { ActivityIndicator, Alert, AppState, type AppStateStatus, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSongRepository } from "../data/songs";
import type { AudioEvidenceFrame } from "../music/audioEvidence";
import { serializeAudioEvidenceRecording } from "../music/audioEvidence";
import { createAudioEvidenceFrame } from "../music/chordDetection";
import { getLineChordSegments } from "../music/chordLineSegments";
import { ChordPositionFollower } from "../music/chordPositionFollower";
import { decideAutoFollowScroll } from "../music/autoFollowScroll";
import { findNextDetectableEvent, getDetectableStats, normalizeSongContent } from "../music/chordTimeline";
import { createExpectedMusicSequenceFromTimeline } from "../music/expectedMusic";
import {
  createManualRepositionSession,
  getVisibleTimelineRange,
  processManualRepositionEvidence,
  type ManualRepositionSession,
} from "../music/manualReposition";
import { derivePlayRows, getPlayRowTimelineIndexes, PlayRowFollower } from "../music/playRows";
import {
  decidePlayRowScroll,
  PLAY_ROW_COMFORTABLE_BOTTOM_RATIO,
  PLAY_ROW_COMFORTABLE_TOP_RATIO,
} from "../music/playRowScroll";
import { createDevAudioEvidenceRecording } from "../music/realEvidenceDataset";
import { transposeChordName, transposeSongText } from "../music/transpose";
import { colors } from "../theme";
import type { RootStackParamList, SongDetail } from "../types";
import { getSongDisplayMeta, getSongDisplayTitle } from "../utils/songDisplay";

type Props = NativeStackScreenProps<RootStackParamList, "SongDetail">;

const SAMPLE_RATE = 44100;
const BUFFER_LENGTH = 4096;
const PROCESS_INTERVAL_MS = 150;
const AUTO_FOLLOW_KEY = "lyricord.mobile.auto-follow-enabled";
const KEEP_AWAKE_TAG = "lyricord-song-auto-follow";
const SONG_BOX_CONTENT_PADDING = 16;
const MANUAL_REPOSITION_PAUSE_MS = 1200;
const MANUAL_SCROLL_PAUSE_MS = 2500;
const FOLLOW_GRANULARITY = "row" as "event" | "row";
const CONSERVATIVE_FOLLOWER_CONFIG = {
  normalLookaheadEvents: 4,
  reacquireLookaheadEvents: 6,
  boundaryRecoveryLookaheadEvents: 3,
  maxAdvanceEventsLocked: 3,
  maxAdvanceEventsReacquiring: 4,
  reacquireCommitScore: 1.8,
  reacquireCommitMargin: 0.5,
  reacquireStableUpdates: 3,
  largeRecommitDistance: 5,
  largeRecommitMinMatches: 4,
  largeRecommitExtraMargin: 0.4,
};

export function SongDetailScreen({ navigation, route }: Props) {
  const songRepository = useSongRepository();
  const scrollRef = useRef<ScrollView | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const machineRef = useRef<ChordPositionFollower | null>(null);
  const rowFollowerRef = useRef<PlayRowFollower | null>(null);
  const lineYRef = useRef(new Map<number, number>());
  const playRowLayoutRef = useRef(new Map<number, { y: number; height: number; lineIndex: number }>());
  const songBoxYRef = useRef(0);
  const songBoxYKnownRef = useRef(false);
  const songContentHeightRef = useRef(0);
  const lastGeometryLogKeyRef = useRef("");
  const lastProcessAtRef = useRef(0);
  const firstAudioReadySeenRef = useRef(false);
  const audioSessionActiveRef = useRef(false);
  const listeningRef = useRef(false);
  const startingRef = useRef(false);
  const lastScrolledLineRef = useRef(-1);
  const lastAutomaticScrollYRef = useRef(-1);
  const currentScrollYRef = useRef(0);
  const viewportHeightRef = useRef(0);
  const scrollAnimationInProgressRef = useRef(false);
  const scrollAnimationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmaticScrollUntilRef = useRef(0);
  const pendingPlayRowScrollCallRef = useRef<{ fromY: number; targetY: number; toRow: number } | null>(null);
  const autoScrollSuspendedUntilRef = useRef(0);
  const lastRenderedPlayRowIndexRef = useRef(0);
  const manualRepositionRef = useRef<ManualRepositionSession | null>(null);
  const activeAutoFollowKeyRef = useRef<string | null>(null);
  const layoutHeightsRef = useRef(new Map<string, number>());
  const lastFollowerDebugKeyRef = useRef("");
  const lastPlayRowDebugKeyRef = useRef("");
  const previousEvidenceFrameRef = useRef<AudioEvidenceFrame | null>(null);
  const devEvidenceCaptureRef = useRef<{
    active: boolean;
    frames: AudioEvidenceFrame[];
    startedAt: number | null;
  }>({ active: false, frames: [], startedAt: null });

  const [song, setSong] = useState<SongDetail | null>(null);
  const [semitones, setSemitones] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const [autoFollowEnabled, setAutoFollowEnabled] = useState(false);
  const [temporarilyPaused, setTemporarilyPaused] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [isListening, setIsListening] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [followIndex, setFollowIndex] = useState(0);
  const [currentPlayRowIndex, setCurrentPlayRowIndex] = useState(0);
  const [followStatus, setFollowStatus] = useState<"idle" | "listening" | "unknown" | "confirmed" | "advanced" | "reacquiring" | "error">("idle");
  const [followerDebug, setFollowerDebug] = useState<{
    mode: string;
    committedTimelineIndex: number;
    bestHypothesisIndex: number | null;
    followConfidence: number;
    scoreMargin: number;
    sequenceAmbiguous: boolean;
    currentChord: string;
  } | null>(null);
  const [devCaptureActive, setDevCaptureActive] = useState(false);
  const [devCaptureFrameCount, setDevCaptureFrameCount] = useState(0);
  const [manualRepositionStatus, setManualRepositionStatus] = useState<"idle" | "searching">("idle");

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    if (__DEV__) {
      console.log("[SongDetail:load:start]", {
        songId: route.params.songId,
        captureActive: devEvidenceCaptureRef.current.active,
        capturedFrames: devEvidenceCaptureRef.current.frames.length,
        timestamp: new Date().toISOString(),
      });
    }
    try {
      const nextSong = await songRepository.getSong(route.params.songId);
      setSong(nextSong);
    } catch (reason) {
      logFollowError("SongDetail:load", reason);
      setError(reason instanceof Error ? reason.message : "No pudimos cargar la canción.");
    } finally {
      if (__DEV__) {
        console.log("[SongDetail:load:finish]", {
          songId: route.params.songId,
          captureActive: devEvidenceCaptureRef.current.active,
          capturedFrames: devEvidenceCaptureRef.current.frames.length,
          timestamp: new Date().toISOString(),
        });
      }
      setLoading(false);
    }
  }, [navigation, route.params.songId, songRepository]);

  useEffect(() => {
    setSemitones(0);
  }, [route.params.songId]);

  useEffect(() => {
    SecureStore.getItemAsync(AUTO_FOLLOW_KEY)
      .then((value) => {
        setAutoFollowEnabled(value !== "permission-denied");
      })
      .finally(() => setPreferenceLoaded(true));
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="Editar canción"
            accessibilityRole="button"
            onPress={() => {
              if (!song) return;
              navigation.navigate("SongForm", { mode: "edit", songId: song.id, title: song.title });
            }}
            hitSlop={12}
            style={styles.headerEditButton}
          >
            <Text numberOfLines={1} style={styles.headerAction}>Editar</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Más acciones de la canción"
            accessibilityRole="button"
            disabled={!song || actionLoading}
            hitSlop={12}
            onPress={showSongActions}
            style={styles.headerMenuButton}
          >
            <Text style={styles.headerMenuIcon}>•••</Text>
          </Pressable>
        </View>
      ),
    });
  }, [actionLoading, navigation, song]);

  const songDisplayTitle = song ? getSongDisplayTitle(song) : "";
  const songDisplayMeta = song ? getSongDisplayMeta(song) : "";
  const hasSongDisplayMeta = songDisplayMeta.length > 0;
  const sourceContent = song?.content ?? "";
  const sourceKey = song?.key ?? "";
  const content = useMemo(() => (sourceContent ? transposeSongText(sourceContent, semitones) : ""), [sourceContent, semitones]);
  const transposedKey = useMemo(() => {
    if (!sourceKey) return "";
    return transposeChordName(sourceKey, semitones);
  }, [sourceKey, semitones]);
  const transposeLabel = semitones === 0 ? "Original" : semitones > 0 ? `+${semitones}` : `${semitones}`;
  const normalizedContent = useMemo(() => normalizeSongContent(content), [content]);
  const lines = useMemo(() => normalizedContent.lines.map((line) => line.originalText), [normalizedContent]);
  const timeline = normalizedContent.chordEvents;
  const playRows = useMemo(() => derivePlayRows(timeline, lines.length), [timeline, lines.length]);
  const timelineStats = useMemo(() => getDetectableStats(timeline), [timeline]);
  const canAutoFollow = FOLLOW_GRANULARITY === "row" ? playRows.length >= 2 : timelineStats.detectable >= 2;
  const foreground = appState === "active";
  const shouldListen = preferenceLoaded && autoFollowEnabled && canAutoFollow && isFocused && foreground && !temporarilyPaused;
  const activeTimelineIndex = autoFollowEnabled && canAutoFollow && FOLLOW_GRANULARITY === "event" ? followIndex : -1;
  const activePlayRow = FOLLOW_GRANULARITY === "row" ? playRows[currentPlayRowIndex] : null;
  const nextPlayRow = FOLLOW_GRANULARITY === "row" ? playRows[currentPlayRowIndex + 1] : null;
  const activePlayRowTimelineIndexes = useMemo(() => getPlayRowTimelineIndexes(activePlayRow), [activePlayRow]);
  const nextPlayRowTimelineIndexes = useMemo(() => getPlayRowTimelineIndexes(nextPlayRow), [nextPlayRow]);
  const autoFollowKey = song ? `${song.id}:${semitones}:${FOLLOW_GRANULARITY}:${timeline.length}:${playRows.length}` : null;

  useEffect(() => {
    lineYRef.current.clear();
    playRowLayoutRef.current.clear();
    songBoxYKnownRef.current = false;
    songContentHeightRef.current = 0;
    lastGeometryLogKeyRef.current = "";
    lastScrolledLineRef.current = -1;
    lastAutomaticScrollYRef.current = -1;
    manualRepositionRef.current = null;
    autoScrollSuspendedUntilRef.current = 0;
    lastRenderedPlayRowIndexRef.current = 0;
    setManualRepositionStatus("idle");
    setFollowIndex(0);
    setCurrentPlayRowIndex(0);
    setFollowStatus("idle");
    setFollowerDebug(null);
    lastFollowerDebugKeyRef.current = "";
    lastPlayRowDebugKeyRef.current = "";
    previousEvidenceFrameRef.current = null;
    pendingPlayRowScrollCallRef.current = null;
    machineRef.current = null;
    rowFollowerRef.current = null;
    activeAutoFollowKeyRef.current = null;
    devEvidenceCaptureRef.current = { active: false, frames: [], startedAt: null };
    setDevCaptureActive(false);
    setDevCaptureFrameCount(0);
  }, [content]);

  function logFollow(stage: string, details?: Record<string, unknown>) {
    if (!__DEV__) return;
    console.log("[SongDetail:autoFollow]", { stage, timestamp: new Date().toISOString(), ...details });
  }

  function logFollowError(stage: string, reason: unknown) {
    if (!__DEV__) return;
    if (reason instanceof Error) {
      console.error("[SongDetail:autoFollow:error]", {
        stage,
        name: reason.name,
        message: reason.message,
        stack: reason.stack,
      });
      return;
    }

    console.error("[SongDetail:autoFollow:error]", {
      stage,
      name: typeof reason,
      message: String(reason),
    });
  }

  function slugifyForFilename(value: string) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "song";
  }

  function logLayoutChange(component: string, newHeight: number) {
    if (!__DEV__) return;
    const previousHeight = layoutHeightsRef.current.get(component);
    if (previousHeight !== undefined && Math.abs(previousHeight - newHeight) <= 1) return;

    layoutHeightsRef.current.set(component, newHeight);
    if (previousHeight === undefined) return;

    console.log("[autoFollow:layout-change]", {
      component,
      previousHeight: Number(previousHeight.toFixed(1)),
      newHeight: Number(newHeight.toFixed(1)),
      timestamp: new Date().toISOString(),
    });
  }

  function getTargetLineY(lineIndex: number) {
    const lineLocalY = lineYRef.current.get(lineIndex);
    return typeof lineLocalY === "number"
      ? songBoxYRef.current + SONG_BOX_CONTENT_PADDING + lineLocalY
      : null;
  }

  function getLayoutStatus() {
    if (viewportHeightRef.current <= 0 || !songBoxYKnownRef.current || timeline.length === 0) {
      return { ready: false, valid: false, reason: "not-ready" };
    }

    const timelineLineIndexes = Array.from(new Set(timeline.map((event) => event.lineIndex))).sort((a, b) => a - b);
    const missingLine = timelineLineIndexes.find((lineIndex) => !lineYRef.current.has(lineIndex));
    if (missingLine !== undefined) {
      return { ready: false, valid: false, reason: "missing-line", lineIndex: missingLine };
    }

    let previousLineIndex = -1;
    let previousY = -Infinity;
    const seenY = new Map<number, number>();
    for (const lineIndex of timelineLineIndexes) {
      const y = getTargetLineY(lineIndex);
      if (y === null) {
        return { ready: false, valid: false, reason: "missing-line", lineIndex };
      }
      if (lineIndex > previousLineIndex && y < previousY - 0.5) {
        return { ready: true, valid: false, reason: "non-monotonic-line-y", lineIndex, previousLineIndex };
      }

      const roundedY = Math.round(y * 2) / 2;
      const duplicateLineIndex = seenY.get(roundedY);
      if (duplicateLineIndex !== undefined && duplicateLineIndex !== lineIndex) {
        return { ready: true, valid: false, reason: "duplicate-y", lineIndex, previousLineIndex: duplicateLineIndex };
      }

      seenY.set(roundedY, lineIndex);
      previousLineIndex = lineIndex;
      previousY = y;
    }

    return { ready: true, valid: true, reason: "valid" };
  }

  function getPlayRowTargetLayoutStatus(lineIndex: number) {
    const globalStatus = getLayoutStatus();
    const targetLineY = getTargetLineY(lineIndex);
    const requiredLines = playRows.map((row) => row.chordLineIndex);

    if (viewportHeightRef.current <= 0 || !songBoxYKnownRef.current || playRows.length === 0) {
      return {
        ready: false,
        valid: false,
        reason: "not-ready",
        globalStatus,
        targetLineY,
        requiredLines,
      };
    }

    if (targetLineY === null || !lineYRef.current.has(lineIndex)) {
      return {
        ready: true,
        valid: false,
        reason: "target-missing-line",
        globalStatus,
        targetLineY,
        requiredLines,
        missingLine: lineIndex,
      };
    }

    return {
      ready: true,
      valid: true,
      reason: globalStatus.valid ? "valid" : "target-valid-global-invalid",
      globalStatus,
      targetLineY,
      requiredLines,
    };
  }

  function getPlayRowLayoutStatus(rowIndex: number) {
    const row = playRows[rowIndex];
    const layout = playRowLayoutRef.current.get(rowIndex);
    const targetLineY = layout ? songBoxYRef.current + SONG_BOX_CONTENT_PADDING + layout.y : null;
    const requiredLines = playRows.map((playRow) => playRow.chordLineIndex);

    if (viewportHeightRef.current <= 0 || !songBoxYKnownRef.current || playRows.length === 0) {
      return {
        ready: false,
        valid: false,
        reason: "not-ready",
        targetLineY,
        targetHeight: layout?.height ?? null,
        requiredLines,
        rowLayout: layout ?? null,
      };
    }

    if (!row || !layout) {
      return {
        ready: true,
        valid: false,
        reason: "target-missing-row-layout",
        targetLineY,
        targetHeight: layout?.height ?? null,
        requiredLines,
        rowLayout: layout ?? null,
      };
    }

    let previousMeasured: { rowIndex: number; y: number; lineIndex: number } | null = null;
    for (let index = rowIndex - 1; index >= 0; index -= 1) {
      const previous = playRowLayoutRef.current.get(index);
      if (previous) {
        previousMeasured = { rowIndex: index, y: previous.y, lineIndex: previous.lineIndex };
        break;
      }
    }

    if (previousMeasured && row.chordLineIndex > previousMeasured.lineIndex && layout.y <= previousMeasured.y + 0.5) {
      return {
        ready: true,
        valid: false,
        reason: "non-monotonic-play-row-y",
        targetLineY,
        targetHeight: layout.height,
        requiredLines,
        rowLayout: layout,
        previousMeasured,
      };
    }

    return {
      ready: true,
      valid: true,
      reason: "valid",
      targetLineY,
      targetHeight: layout.height,
      requiredLines,
      rowLayout: layout,
    };
  }

  function logGeometryIfReady() {
    if (!__DEV__ || timeline.length === 0) return;
    const status = getLayoutStatus();

    if (status.ready && !status.valid) {
      console.warn("[autoFollow:layout-invalid]", {
        reason: status.reason,
        lineIndex: "lineIndex" in status ? status.lineIndex : undefined,
        previousLineIndex: "previousLineIndex" in status ? status.previousLineIndex : undefined,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (!status.ready || !status.valid) return;

    const geometryKey = [
      song?.id,
      lines.length,
      timeline.length,
      viewportHeightRef.current.toFixed(1),
      songBoxYRef.current.toFixed(1),
      songContentHeightRef.current.toFixed(1),
      lineYRef.current.size,
    ].join(":");
    if (geometryKey === lastGeometryLogKeyRef.current) return;
    lastGeometryLogKeyRef.current = geometryKey;

    console.log("[autoFollow:geometry]", {
      songId: song?.id ?? null,
      title: song?.title ?? null,
      totalLines: lines.length,
      timelineEvents: timeline.length,
      songContentHeight: Number(songContentHeightRef.current.toFixed(1)),
      songBoxY: Number(songBoxYRef.current.toFixed(1)),
      viewportHeight: Number(viewportHeightRef.current.toFixed(1)),
      currentScrollY: Number(currentScrollYRef.current.toFixed(1)),
      measuredLines: lineYRef.current.size,
      events: timeline.slice(0, 15).map((event, timelineIndex) => {
        const lineLocalY = lineYRef.current.get(event.lineIndex) ?? null;
        const targetLineY = getTargetLineY(event.lineIndex);
        return {
          chord: event.chord,
          timelineIndex,
          lineIndex: event.lineIndex,
          lineLocalY: lineLocalY === null ? null : Number(lineLocalY.toFixed(1)),
          targetLineY: targetLineY === null ? null : Number(targetLineY.toFixed(1)),
        };
      }),
      timestamp: new Date().toISOString(),
    });
  }

  useEffect(() => {
    if (!__DEV__ || timeline.length === 0) return;

    const nextDetectable = findNextDetectableEvent(timeline, followIndex);
    console.log("[SongDetail:autoFollow:timeline]", {
      full: timeline.map((event) => event.chord).join(" â†’ "),
      supported: timeline.map((event) => event.supportedChord ?? "-").join(" â†’ "),
      activeIndex: followIndex,
      activeEvent: timeline[followIndex]?.chord ?? null,
      nextEvent: timeline[followIndex + 1]?.chord ?? null,
      nextDetectable: nextDetectable
        ? {
            chord: nextDetectable.event.chord,
            supportedChord: nextDetectable.event.supportedChord,
            index: nextDetectable.index,
            skippedEvents: nextDetectable.skippedEvents,
            lineIndex: nextDetectable.event.lineIndex,
          }
        : null,
      detectable: timelineStats.detectable,
      granularity: FOLLOW_GRANULARITY,
      playRows: playRows.length,
      total: timelineStats.total,
    });
  }, [followIndex, playRows.length, timeline, timelineStats.detectable, timelineStats.total]);

  useEffect(() => {
    if (!__DEV__ || playRows.length === 0) return;

    console.log("[playRow:rows]", {
      songId: song?.id ?? null,
      title: song?.title ?? null,
      rows: playRows.map((row, rowIndex) => ({
        rowIndex,
        chordLineIndex: row.chordLineIndex,
        originalChords: row.chordEvents.map((event) => event.originalChord),
        normalizedChords: row.chordEvents.map((event) => event.normalizedChord),
        detectableChords: row.chordEvents.map((event) => event.supportedChord ?? "-"),
        matchChords: row.matchChords,
        startTimelineIndex: row.startTimelineIndex,
        endTimelineIndex: row.endTimelineIndex,
      })),
      timestamp: new Date().toISOString(),
    });
  }, [playRows, song?.id, song?.title]);

  async function configureAndActivateAudioSession() {
    logFollow("audio-session.configure", { iosCategory: "record", iosMode: "default" });
    AudioManager.setAudioSessionOptions({
      iosCategory: "record",
      iosMode: "default",
      iosOptions: [],
    });

    logFollow("audio-session.activate");
    await AudioManager.setAudioSessionActivity(true);
    audioSessionActiveRef.current = true;
    logFollow("audio-session.active", { activated: true });
  }

  function scrollToLine(lineIndex: number, timelineIndex: number) {
    if (Date.now() < autoScrollSuspendedUntilRef.current) {
      if (__DEV__) {
        console.log("[autoFollow:scroll-skip]", {
          reason: "manual-reposition-suspended",
          timelineIndex,
          lineIndex,
          timestamp: new Date().toISOString(),
        });
      }
      return;
    }

    const lineLocalY = lineYRef.current.get(lineIndex);
    const targetLineY = getTargetLineY(lineIndex);
    const layoutStatus = getLayoutStatus();
    const decision = decideAutoFollowScroll(
      {
        lastScrolledLineIndex: lastScrolledLineRef.current,
        lastAutomaticScrollY: lastAutomaticScrollYRef.current,
        currentScrollY: currentScrollYRef.current,
        viewportHeight: viewportHeightRef.current,
        animationInProgress: scrollAnimationInProgressRef.current,
        layoutReady: layoutStatus.ready,
        layoutValid: layoutStatus.valid,
      },
      {
        advanced: true,
        targetLineIndex: lineIndex,
        targetLineY,
        timelineIndex,
      },
    );

    if (__DEV__) {
      console.log("[autoFollow:scroll-evaluate]", {
        ...decision.evaluation,
        targetLineY: decision.evaluation.targetLineY === null ? null : Number(decision.evaluation.targetLineY.toFixed(1)),
        currentScrollY: Number(decision.evaluation.currentScrollY.toFixed(1)),
        targetVisibleY: decision.evaluation.targetVisibleY === null ? null : Number(decision.evaluation.targetVisibleY.toFixed(1)),
        viewportHeight: Number(decision.evaluation.viewportHeight.toFixed(1)),
        safeZoneTop: Number(decision.evaluation.safeZoneTop.toFixed(1)),
        safeZoneBottom: Number(decision.evaluation.safeZoneBottom.toFixed(1)),
        layoutReady: layoutStatus.ready,
        layoutValid: layoutStatus.valid,
        lastAutomaticScrollY: Number(lastAutomaticScrollYRef.current.toFixed(1)),
        source: {
          songBoxY: Number(songBoxYRef.current.toFixed(1)),
          lineLocalY: typeof lineLocalY === "number" ? Number(lineLocalY.toFixed(1)) : null,
          contentPadding: SONG_BOX_CONTENT_PADDING,
        },
        timestamp: new Date().toISOString(),
      });
      if (!decision.shouldScroll) {
        console.log("[autoFollow:scroll-skip]", {
          reason: decision.reason,
          timelineIndex: decision.timelineIndex,
          lineIndex,
          layoutReason: layoutStatus.reason,
          timestamp: new Date().toISOString(),
        });
      }
    }

    if (!decision.shouldScroll) {
      if (
        decision.reason === "same-line" ||
        decision.reason === "safe-zone" ||
        decision.reason === "duplicate" ||
        decision.reason === "non-forward-target"
      ) {
        lastScrolledLineRef.current = Math.max(lastScrolledLineRef.current, lineIndex);
      }
      return;
    }

    lastScrolledLineRef.current = lineIndex;
    lastAutomaticScrollYRef.current = decision.targetY;
    scrollAnimationInProgressRef.current = true;
    programmaticScrollUntilRef.current = Date.now() + 900;
    if (scrollAnimationTimerRef.current) {
      clearTimeout(scrollAnimationTimerRef.current);
    }

    if (__DEV__) {
      console.log("[autoFollow:scroll-call]", {
        currentY: Number(currentScrollYRef.current.toFixed(1)),
        targetY: Number(decision.targetY.toFixed(1)),
        targetLine: lineIndex,
        timestamp: new Date().toISOString(),
      });
    }

    scrollRef.current?.scrollTo({ y: decision.targetY, animated: true });
    scrollAnimationTimerRef.current = setTimeout(() => {
      scrollAnimationInProgressRef.current = false;
      scrollAnimationTimerRef.current = null;
    }, 550);
  }

  function scrollToPlayRow(rowIndex: number, previousRowIndex = currentPlayRowIndex) {
    const row = playRows[rowIndex];
    if (!row) return;
    if (Date.now() < autoScrollSuspendedUntilRef.current) {
      if (__DEV__) {
        console.log("[playRow:scroll-evaluate]", {
          fromRow: previousRowIndex,
          toRow: rowIndex,
          lineIndex: row.chordLineIndex,
          currentScrollY: Number(currentScrollYRef.current.toFixed(1)),
          targetVisibleY: null,
          viewportHeight: Number(viewportHeightRef.current.toFixed(1)),
          comfortableZoneTop: Number((viewportHeightRef.current * PLAY_ROW_COMFORTABLE_TOP_RATIO).toFixed(1)),
          comfortableZoneBottom: Number((viewportHeightRef.current * PLAY_ROW_COMFORTABLE_BOTTOM_RATIO).toFixed(1)),
          decision: "skip:manual-reposition-suspended",
          timestamp: new Date().toISOString(),
        });
      }
      return;
    }

    const layoutStatus = getPlayRowLayoutStatus(rowIndex);
    const targetLineY = layoutStatus.targetLineY;
    const scrollDecision = decidePlayRowScroll(
      {
        currentScrollY: currentScrollYRef.current,
        viewportHeight: viewportHeightRef.current,
        lastAutomaticScrollY: lastAutomaticScrollYRef.current,
        lastScrolledLineIndex: lastScrolledLineRef.current,
        animationInProgress: scrollAnimationInProgressRef.current,
        layoutReady: layoutStatus.ready,
        layoutValid: layoutStatus.valid,
        anchorRatio: 0.4,
        maxStepRatio: 0.42,
      },
      {
        targetLineIndex: row.chordLineIndex,
        targetLineY,
        targetHeight: layoutStatus.targetHeight,
      },
    );

    if (!scrollDecision.shouldScroll && scrollDecision.reason === "comfortable-zone") {
      lastScrolledLineRef.current = Math.max(lastScrolledLineRef.current, row.chordLineIndex);
    }

    if (__DEV__) {
      console.log("[playRow:scroll-evaluate]", {
        fromRow: previousRowIndex,
        toRow: rowIndex,
        lineIndex: row.chordLineIndex,
        rowY: layoutStatus.rowLayout ? Number(layoutStatus.rowLayout.y.toFixed(1)) : null,
        rowHeight: layoutStatus.rowLayout ? Number(layoutStatus.rowLayout.height.toFixed(1)) : null,
        targetLineY: targetLineY === null ? null : Number(targetLineY.toFixed(1)),
        targetVisibleY: scrollDecision.targetVisibleY === null ? null : Number(scrollDecision.targetVisibleY.toFixed(1)),
        currentScrollY: Number(currentScrollYRef.current.toFixed(1)),
        viewportHeight: Number(viewportHeightRef.current.toFixed(1)),
        comfortableZoneTop: Number((viewportHeightRef.current * PLAY_ROW_COMFORTABLE_TOP_RATIO).toFixed(1)),
        comfortableZoneBottom: Number((viewportHeightRef.current * PLAY_ROW_COMFORTABLE_BOTTOM_RATIO).toFixed(1)),
        lastScrolledLineIndex: lastScrolledLineRef.current,
        lastAutomaticScrollY: Number(lastAutomaticScrollYRef.current.toFixed(1)),
        animationInProgress: scrollAnimationInProgressRef.current,
        layoutReady: layoutStatus.ready,
        layoutValid: layoutStatus.valid,
        layoutInvalidReason: layoutStatus.reason,
        previousMeasuredRow: "previousMeasured" in layoutStatus ? layoutStatus.previousMeasured : undefined,
        measuredLines: lineYRef.current.size,
        measuredPlayRows: playRowLayoutRef.current.size,
        requiredLines: layoutStatus.requiredLines,
        songBoxY: Number(songBoxYRef.current.toFixed(1)),
        contentHeight: Number(songContentHeightRef.current.toFixed(1)),
        decision: scrollDecision.shouldScroll ? "scroll" : `skip:${scrollDecision.reason}`,
        timestamp: new Date().toISOString(),
      });
    }

    if (!scrollDecision.shouldScroll) return;

    lastScrolledLineRef.current = row.chordLineIndex;
    lastAutomaticScrollYRef.current = scrollDecision.targetY;
    scrollAnimationInProgressRef.current = true;
    programmaticScrollUntilRef.current = Date.now() + 900;
    if (scrollAnimationTimerRef.current) clearTimeout(scrollAnimationTimerRef.current);

    if (__DEV__) {
      console.log("[playRow:scroll-call]", {
        fromRow: previousRowIndex,
        toRow: rowIndex,
        fromY: Number(currentScrollYRef.current.toFixed(1)),
        rowY: layoutStatus.rowLayout ? Number(layoutStatus.rowLayout.y.toFixed(1)) : null,
        targetY: Number(scrollDecision.targetY.toFixed(1)),
        targetScrollY: Number(scrollDecision.targetY.toFixed(1)),
        timestamp: new Date().toISOString(),
      });
    }

    pendingPlayRowScrollCallRef.current = {
      fromY: currentScrollYRef.current,
      targetY: scrollDecision.targetY,
      toRow: rowIndex,
    };
    scrollRef.current?.scrollTo({ y: scrollDecision.targetY, animated: true });
    scrollAnimationTimerRef.current = setTimeout(() => {
      scrollAnimationInProgressRef.current = false;
      scrollAnimationTimerRef.current = null;
    }, 550);
  }

  useEffect(() => {
    const previousRowIndex = lastRenderedPlayRowIndexRef.current;
    lastRenderedPlayRowIndexRef.current = currentPlayRowIndex;

    if (FOLLOW_GRANULARITY !== "row" || !autoFollowEnabled || !canAutoFollow) return;
    if (currentPlayRowIndex <= previousRowIndex) return;

    const frame = requestAnimationFrame(() => {
      scrollToPlayRow(currentPlayRowIndex, previousRowIndex);
    });
    return () => cancelAnimationFrame(frame);
  }, [autoFollowEnabled, canAutoFollow, currentPlayRowIndex]);

  function suspendAutoScrollForManualInteraction() {
    autoScrollSuspendedUntilRef.current = Date.now() + MANUAL_SCROLL_PAUSE_MS;
  }

  function handleManualScrollBegin() {
    programmaticScrollUntilRef.current = 0;
    scrollAnimationInProgressRef.current = false;
    if (scrollAnimationTimerRef.current) {
      clearTimeout(scrollAnimationTimerRef.current);
      scrollAnimationTimerRef.current = null;
    }
    suspendAutoScrollForManualInteraction();
  }

  function setPlayRowExplicitly(rowIndex: number, reason: "tap-row" | "restart") {
    const row = playRows[rowIndex];
    if (!row) return;

    const follower = rowFollowerRef.current;
    if (follower) follower.resetToRow(rowIndex);

    setCurrentPlayRowIndex(rowIndex);
    setFollowIndex(row.startTimelineIndex);
    setFollowStatus("confirmed");
    manualRepositionRef.current = null;
    setManualRepositionStatus("idle");
    previousEvidenceFrameRef.current = null;
    autoScrollSuspendedUntilRef.current = Date.now() + MANUAL_REPOSITION_PAUSE_MS;
    lastScrolledLineRef.current = row.chordLineIndex - 1;
    lastAutomaticScrollYRef.current = Math.max(0, currentScrollYRef.current);

    if (__DEV__) {
      console.log("[playRow:explicit-position]", {
        reason,
        rowIndex,
        chordLineIndex: row.chordLineIndex,
        chords: row.chordEvents.map((event) => event.chord),
        startTimelineIndex: row.startTimelineIndex,
        endTimelineIndex: row.endTimelineIndex,
        timestamp: new Date().toISOString(),
      });
    }
  }

  function updateFollowerDebug(output: {
    mode: string;
    committedTimelineIndex: number;
    bestHypothesisIndex: number | null;
    followConfidence: number;
    scoreMargin: number;
    sequenceAmbiguous: boolean;
    currentEvent: { chord: string };
  }) {
    if (!__DEV__) return false;

    const nextDebug = {
      mode: output.mode,
      committedTimelineIndex: output.committedTimelineIndex,
      bestHypothesisIndex: output.bestHypothesisIndex,
      followConfidence: Number(output.followConfidence.toFixed(3)),
      scoreMargin: Number(output.scoreMargin.toFixed(3)),
      sequenceAmbiguous: output.sequenceAmbiguous,
      currentChord: output.currentEvent.chord,
    };
    const key = JSON.stringify(nextDebug);
    if (key === lastFollowerDebugKeyRef.current) return false;

    lastFollowerDebugKeyRef.current = key;
    setFollowerDebug(nextDebug);
    return true;
  }

  function startManualRepositionFromVisibleZone() {
    if (!autoFollowEnabled || !canAutoFollow) return;
    const now = Date.now();

    const lineYInScroll = new Map<number, number>();
    for (const [lineIndex, lineLocalY] of lineYRef.current.entries()) {
      lineYInScroll.set(lineIndex, songBoxYRef.current + SONG_BOX_CONTENT_PADDING + lineLocalY);
    }

    const range = getVisibleTimelineRange({
      timeline,
      lineYByLineIndex: lineYInScroll,
      currentScrollY: currentScrollYRef.current,
      viewportHeight: viewportHeightRef.current,
      marginEvents: 4,
    });

    if (!range || range.candidateTimelineIndexes.length === 0) {
      manualRepositionRef.current = null;
      setManualRepositionStatus("idle");
      if (__DEV__) {
        console.log("[manual-reposition:cancelled]", {
          reason: "no-visible-candidates",
          currentY: Number(currentScrollYRef.current.toFixed(1)),
          viewportHeight: Number(viewportHeightRef.current.toFixed(1)),
          timestamp: new Date().toISOString(),
        });
      }
      return;
    }

    manualRepositionRef.current = createManualRepositionSession({ ...range, nowMs: now });
    autoScrollSuspendedUntilRef.current = now + MANUAL_REPOSITION_PAUSE_MS;
    setManualRepositionStatus("searching");
    setTemporarilyPaused(false);
    if (__DEV__) {
      console.log("[manual-reposition:start]", {
        trigger: "explicit-action",
        fromIndex: followIndex,
        currentY: Number(currentScrollYRef.current.toFixed(1)),
        visibleTimelineRange: {
          startLine: range.visibleStartLine,
          endLine: range.visibleEndLine,
          indexes: range.visibleTimelineIndexes,
        },
        candidateRange: {
          startIndex: range.candidateStartIndex,
          endIndex: range.candidateEndIndex,
          indexes: range.candidateTimelineIndexes,
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  function applyManualRepositionEvidence(evidence: AudioEvidenceFrame, now: number) {
    if (!__DEV__) return false;
    const session = manualRepositionRef.current;
    const machine = machineRef.current;
    if (!session || !machine) return false;

    if (now > session.expiresAtMs) {
      manualRepositionRef.current = null;
      setManualRepositionStatus("idle");
      console.log("[manual-reposition:cancelled]", {
        reason: "timeout",
        candidateRange: session.candidateTimelineIndexes,
        timestamp: new Date().toISOString(),
      });
      return false;
    }

    const match = processManualRepositionEvidence(session, timeline, {
      candidate: evidence.candidate,
      confidence: evidence.confidence,
      nowMs: now,
    });

    console.log("[manual-reposition:evidenceMatch]", {
      candidate: evidence.candidate,
      confidence: Number(evidence.confidence.toFixed(3)),
      timelineIndex: match.timelineIndex,
      reason: match.reason,
      stableCount: match.stableCount,
      candidateRange: match.candidateRange,
      timestamp: new Date().toISOString(),
    });

    if (!match.committed || match.timelineIndex === null) return true;

    machine.resetToIndex(match.timelineIndex);
    const nextIndex = machine.currentIndex;
    manualRepositionRef.current = null;
    setManualRepositionStatus("idle");
    setFollowIndex(nextIndex);
    setFollowStatus("confirmed");
    autoScrollSuspendedUntilRef.current = Date.now() + MANUAL_REPOSITION_PAUSE_MS;
    updateFollowerDebug({
      mode: machine.currentMode,
      committedTimelineIndex: machine.currentIndex,
      bestHypothesisIndex: null,
      followConfidence: evidence.confidence,
      scoreMargin: evidence.scoreMargin,
      sequenceAmbiguous: false,
      currentEvent: machine.currentEvent,
    });
    console.log("[manual-reposition:committed]", {
      fromIndex: followIndex,
      toIndex: nextIndex,
      chord: machine.currentEvent.chord,
      lineIndex: machine.currentEvent.lineIndex,
      candidate: evidence.candidate,
      confidence: Number(evidence.confidence.toFixed(3)),
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  function handleAudio(samples: Float32Array, sampleRate: number) {
    const machine = machineRef.current;
    const rowFollower = rowFollowerRef.current;
    if (FOLLOW_GRANULARITY === "event" && !machine) return;
    if (FOLLOW_GRANULARITY === "row" && !rowFollower) return;

    const now = Date.now();
    if (now - lastProcessAtRef.current < PROCESS_INTERVAL_MS) return;
    lastProcessAtRef.current = now;

    const previousIndex = machine?.currentIndex ?? 0;
    const previousRowIndex = rowFollower?.currentIndex ?? 0;
    const expectedCandidates =
      FOLLOW_GRANULARITY === "row" && rowFollower
        ? rowFollower.getExpectedCandidates()
        : machine?.getExpectedCandidates() ?? [];
    const evidence = createAudioEvidenceFrame(samples, sampleRate, expectedCandidates, {
      timestamp: now,
      previousFrame: previousEvidenceFrameRef.current,
      topCandidateCount: 5,
    });
    previousEvidenceFrameRef.current = evidence;
    captureDevEvidenceFrame(evidence);

    if (FOLLOW_GRANULARITY === "event" && applyManualRepositionEvidence(evidence, now)) return;

    if (FOLLOW_GRANULARITY === "row" && rowFollower) {
      const output = rowFollower.process(evidence);
      if (output.advanced) {
        const row = playRows[output.currentRowIndex];
        setCurrentPlayRowIndex(output.currentRowIndex);
        setFollowIndex(row?.startTimelineIndex ?? 0);
        setFollowStatus("advanced");
        if (__DEV__) {
          const previousRow = playRows[previousRowIndex];
          console.log("[playRow:advance]", {
            fromRow: previousRowIndex,
            toRow: output.currentRowIndex,
            reason: output.reason,
            candidate: output.candidate,
            confidence: Number(output.confidence.toFixed(3)),
            stableFrames: output.stableFrames,
            chords: row?.chordEvents.map((event) => event.chord) ?? [],
            timestamp: new Date().toISOString(),
          });
          console.log("[playRow:state]", {
            currentRowIndex: output.currentRowIndex,
            currentRowChords: row?.chordEvents.map((event) => event.chord) ?? [],
            nextRowIndex: playRows[output.currentRowIndex + 1] ? output.currentRowIndex + 1 : null,
            nextRowChords: playRows[output.currentRowIndex + 1]?.chordEvents.map((event) => event.chord) ?? [],
            previousRowChords: previousRow?.chordEvents.map((event) => event.chord) ?? [],
            detectedCandidate: output.candidate,
            candidateConfidence: Number(output.confidence.toFixed(3)),
            candidateInCurrentRow: output.candidateInCurrentRow,
            candidateInNextRow: output.candidateInNextRow,
            stableFrames: output.stableFrames,
            ambiguityReason: output.ambiguityReason,
            advanceDecision: output.advanceDecision,
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        setFollowStatus(output.status);
        if (__DEV__) {
          const currentRow = playRows[output.currentRowIndex];
          const nextRow = playRows[output.currentRowIndex + 1];
          const debugKey = [
            output.currentRowIndex,
            output.reason,
            output.candidate,
            output.stableFrames,
            output.candidateInCurrentRow,
            output.candidateInNextRow,
            output.advanceDecision,
          ].join(":");
          if (debugKey === lastPlayRowDebugKeyRef.current) return;
          lastPlayRowDebugKeyRef.current = debugKey;
          console.log("[playRow:state]", {
            currentRowIndex: output.currentRowIndex,
            currentRowChords: currentRow?.chordEvents.map((event) => event.chord) ?? [],
            nextRowIndex: nextRow ? output.currentRowIndex + 1 : null,
            nextRowChords: nextRow?.chordEvents.map((event) => event.chord) ?? [],
            detectedCandidate: output.candidate,
            candidateConfidence: Number(output.confidence.toFixed(3)),
            candidateInCurrentRow: output.candidateInCurrentRow,
            candidateInNextRow: output.candidateInNextRow,
            stableFrames: output.stableFrames,
            ambiguityReason: output.ambiguityReason,
            advanceDecision: output.advanceDecision,
            reason: output.reason,
            candidate: output.candidate,
            confidence: Number(output.confidence.toFixed(3)),
            timestamp: new Date().toISOString(),
          });
        }
      }
      return;
    }

    if (!machine) return;
    const output = machine.process({
      candidate: evidence.candidate,
      confidence: evidence.confidence,
      nowMs: now,
    });
    const followerDebugChanged = updateFollowerDebug(output);

    if (output.advanced) {
      setFollowStatus(output.status);
      if (output.committedTimelineIndex !== previousIndex) {
        setFollowIndex(output.committedTimelineIndex);
      }
      if (__DEV__) {
        const previousEvent = timeline[previousIndex] ?? null;
        console.log("[autoFollow:advance]", {
          fromIndex: previousIndex,
          toIndex: output.committedTimelineIndex,
          fromLine: previousEvent?.lineIndex ?? null,
          toLine: output.currentEvent.lineIndex,
          mode: output.mode,
          followConfidence: Number(output.followConfidence.toFixed(3)),
          bestHypothesisIndex: output.bestHypothesisIndex,
          scoreMargin: Number(output.scoreMargin.toFixed(3)),
          timestamp: new Date().toISOString(),
        });
      }
      scrollToLine(output.currentEvent.lineIndex, output.committedTimelineIndex);
    } else if (__DEV__ && output.mode === "reacquiring" && followerDebugChanged) {
      console.log("[autoFollow:reacquiring]", {
        committedTimelineIndex: output.committedTimelineIndex,
        bestHypothesisIndex: output.bestHypothesisIndex,
        followConfidence: Number(output.followConfidence.toFixed(3)),
        scoreMargin: Number(output.scoreMargin.toFixed(3)),
        sequenceAmbiguous: output.sequenceAmbiguous,
        hypotheses: output.hypotheses.slice(0, 3).map((hypothesis) => ({
          timelineIndex: hypothesis.timelineIndex,
          score: Number(hypothesis.score.toFixed(3)),
          matchedEvents: hypothesis.matchedEvents,
          path: hypothesis.path,
        })),
        timestamp: new Date().toISOString(),
      });
    }
  }

  function captureDevEvidenceFrame(frame: AudioEvidenceFrame) {
    if (!__DEV__) return;
    if (!devEvidenceCaptureRef.current.active) return;

    devEvidenceCaptureRef.current.frames.push(frame);
    const count = devEvidenceCaptureRef.current.frames.length;
    if (count <= 3 || count % 20 === 0) {
      setDevCaptureFrameCount(count);
    }
  }

  function startDevEvidenceCapture() {
    if (!__DEV__) return;
    devEvidenceCaptureRef.current = {
      active: true,
      frames: [],
      startedAt: Date.now(),
    };
    setDevCaptureActive(true);
    setDevCaptureFrameCount(0);
    console.log("[realEvidenceCapture:start]", {
      songId: song?.id,
      title: song?.title,
      timelineEvents: timeline.length,
      timestamp: new Date().toISOString(),
    });
  }

  function stopDevEvidenceCapture() {
    if (!__DEV__) return;
    devEvidenceCaptureRef.current.active = false;
    setDevCaptureActive(false);
    setDevCaptureFrameCount(devEvidenceCaptureRef.current.frames.length);
    console.log("[realEvidenceCapture:stop]", {
      frames: devEvidenceCaptureRef.current.frames.length,
      timestamp: new Date().toISOString(),
    });
  }

  async function exportDevEvidenceCapture() {
    if (!__DEV__ || !song) return;
    if (devEvidenceCaptureRef.current.active) {
      stopDevEvidenceCapture();
    }
    const frames = devEvidenceCaptureRef.current.frames;
    if (frames.length === 0) {
      Alert.alert("Sin evidencia", "Todavía no hay capturas para exportar.");
      return;
    }

    const expectedMusicSequence = createExpectedMusicSequenceFromTimeline(timeline, {
      songId: song.id,
      songTitle: song.title,
      source: "normalized-content",
      createdAt: new Date().toISOString(),
      notes: "Captured from SongDetail DEV real evidence recorder.",
    });
    const recording = createDevAudioEvidenceRecording({
      frames,
      songId: song.id,
      songTitle: song.title,
      expectedMusicSequence,
      sampleRate: frames[0]?.sampleRate ?? SAMPLE_RATE,
      windowSize: frames[0]?.windowSize ?? BUFFER_LENGTH,
      appBuildInfo: {
        platform: Platform.OS,
        appVersion: "dev",
        buildNumber: "dev",
        expoSdk: "57",
      },
      notes: "No PCM/audio stored. Evidence features only.",
    });

    const directory = FileSystem.cacheDirectory;
    if (!directory) {
      Alert.alert("Exportación no disponible", "No pudimos acceder a la caché temporal para crear el archivo JSON.");
      return;
    }

    const filename = `lyricord-evidence-${slugifyForFilename(song.title)}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    const fileUri = `${directory}${filename}`;
    const json = serializeAudioEvidenceRecording(recording);

    console.log("[realEvidenceCapture:export-start]", {
      filename,
      frames: frames.length,
      bytesApprox: json.length,
      timestamp: new Date().toISOString(),
    });

    await FileSystem.writeAsStringAsync(fileUri, json);

    const sharingAvailable = await Sharing.isAvailableAsync();
    if (!sharingAvailable) {
      Alert.alert("Archivo creado", `Se creó el JSON temporal, pero el menú para compartir no está disponible: ${fileUri}`);
      return;
    }

    await Sharing.shareAsync(fileUri, {
      mimeType: "application/json",
      dialogTitle: `Musum evidence - ${song.title}`,
      UTI: "public.json",
    });

    console.log("[realEvidenceCapture:export-complete]", {
      filename,
      timestamp: new Date().toISOString(),
    });
  }

  const stopAutoFollow = useCallback(async (options: { reason?: string; showError?: boolean } = {}) => {
    const { reason = "manual", showError = false } = options;
    logFollow("stop.start", { reason });
    startingRef.current = false;
    listeningRef.current = false;
    scrollAnimationInProgressRef.current = false;
    if (scrollAnimationTimerRef.current) {
      clearTimeout(scrollAnimationTimerRef.current);
      scrollAnimationTimerRef.current = null;
    }
    setIsStarting(false);
    setIsListening(false);
    setFollowerDebug(null);
    lastFollowerDebugKeyRef.current = "";
    previousEvidenceFrameRef.current = null;

    const recorder = recorderRef.current;
    recorderRef.current = null;

    try {
      if (recorder) {
        const wasRecording = recorder.isRecording();
        logFollow("stop.recorder", { wasRecording });
        if (wasRecording) {
          const stopped = await Promise.resolve(recorder.stop());
          logFollow("stop.recorder-result", { status: stopped.status });
        }
        recorder.clearOnAudioReady();
        recorder.clearOnError();
      }

      if (audioSessionActiveRef.current) {
        logFollow("stop.audio-session-deactivate");
        await AudioManager.setAudioSessionActivity(false);
        audioSessionActiveRef.current = false;
        logFollow("stop.audio-session-deactivated", { deactivated: true });
      }

      setFollowStatus("idle");
    } catch (reason) {
      logFollowError("stopAutoFollow", reason);
      setFollowStatus("error");
      if (showError) {
        setError(reason instanceof Error ? reason.message : "No pudimos detener el micrófono.");
      }
    }
  }, []);

  const startAutoFollow = useCallback(async () => {
    const nextKey = autoFollowKey;
    if (!nextKey) return;
    if (startingRef.current) return;
    if (listeningRef.current) {
      if (activeAutoFollowKeyRef.current === nextKey) return;
      await stopAutoFollow({ reason: "restart-for-song-change" });
    }
    if (!canAutoFollow) return;

    startingRef.current = true;
    setIsStarting(true);
    setError(null);
    setFollowStatus("listening");
    logFollow("start.requested", {
      timelineLength: timeline.length,
      detectable: timelineStats.detectable,
      full: timeline.map((event) => event.chord).join(" â†’ "),
      supported: timeline.map((event) => event.supportedChord ?? "-").join(" â†’ "),
    });

    try {
      const permission = await AudioManager.requestRecordingPermissions();
      logFollow("start.permission", { permission });
      if (permission !== "Granted") {
        await SecureStore.setItemAsync(AUTO_FOLLOW_KEY, "permission-denied");
        setAutoFollowEnabled(false);
        setFollowStatus("idle");
        Alert.alert("Permiso de micrófono desactivado", "Activá el permiso de micrófono para usar el seguimiento automático.");
        return;
      }

      await configureAndActivateAudioSession();

      if (FOLLOW_GRANULARITY === "row") {
        const existingRowFollower = activeAutoFollowKeyRef.current === nextKey ? rowFollowerRef.current : null;
        const rowFollower = existingRowFollower ?? new PlayRowFollower(playRows);
        rowFollowerRef.current = rowFollower;
        machineRef.current = null;
        activeAutoFollowKeyRef.current = nextKey;
        const row = playRows[rowFollower.currentIndex];
        setCurrentPlayRowIndex(rowFollower.currentIndex);
        setFollowIndex(row?.startTimelineIndex ?? 0);
        setFollowerDebug(null);
      } else {
        const existingMachine = activeAutoFollowKeyRef.current === nextKey ? machineRef.current : null;
        const machine = existingMachine ?? new ChordPositionFollower(timeline, CONSERVATIVE_FOLLOWER_CONFIG);
        machineRef.current = machine;
        rowFollowerRef.current = null;
        activeAutoFollowKeyRef.current = nextKey;
        setFollowIndex(machine.currentIndex);
        setFollowerDebug({
          mode: machine.currentMode,
          committedTimelineIndex: machine.currentIndex,
          bestHypothesisIndex: null,
          followConfidence: 1,
          scoreMargin: 0,
          sequenceAmbiguous: false,
          currentChord: machine.currentEvent.chord,
        });
      }
      lastFollowerDebugKeyRef.current = "";
      lastPlayRowDebugKeyRef.current = "";
      lastProcessAtRef.current = 0;
      firstAudioReadySeenRef.current = false;
      previousEvidenceFrameRef.current = null;
      lastScrolledLineRef.current = -1;
      lastAutomaticScrollYRef.current = -1;
      lastGeometryLogKeyRef.current = "";
      manualRepositionRef.current = null;
      setManualRepositionStatus("idle");
      autoScrollSuspendedUntilRef.current = 0;
      scrollAnimationInProgressRef.current = false;
      if (scrollAnimationTimerRef.current) {
        clearTimeout(scrollAnimationTimerRef.current);
        scrollAnimationTimerRef.current = null;
      }

      logFollow("start.recorder-create");
      const recorder = new AudioRecorder();
      recorderRef.current = recorder;
      recorder.onError((event) => {
        if (__DEV__) {
          console.error("[SongDetail:autoFollow:recorderError]", { message: event.message });
        }
        setError(event.message);
        setFollowStatus("error");
        void stopAutoFollow({ reason: "recorder-error" });
      });

      logFollow("start.onAudioReady-register", {
        sampleRate: SAMPLE_RATE,
        bufferLength: BUFFER_LENGTH,
        channelCount: 1,
      });
      const audioReady = recorder.onAudioReady(
        { sampleRate: SAMPLE_RATE, bufferLength: BUFFER_LENGTH, channelCount: 1 },
        (event) => {
          try {
            const samples = event.buffer.getChannelData(0);
            if (!firstAudioReadySeenRef.current) {
              firstAudioReadySeenRef.current = true;
              logFollow("start.first-audio-ready", {
                sampleRate: event.buffer.sampleRate,
                numberOfChannels: event.buffer.numberOfChannels,
                length: event.buffer.length,
                byteLength: samples.byteLength,
              });
            }
            handleAudio(samples, event.buffer.sampleRate || SAMPLE_RATE);
          } catch (reason) {
            logFollowError("onAudioReady", reason);
          }
        },
      );
      logFollow("start.onAudioReady-result", { status: audioReady.status });
      if (audioReady.status === "error") throw new Error(audioReady.message);

      logFollow("start.recorder-start");
      const started = await Promise.resolve(recorder.start());
      logFollow("start.recorder-start-result", { status: started.status });
      if (started.status === "error") throw new Error(started.message);

      listeningRef.current = true;
      setIsListening(true);
      setFollowStatus("listening");
    } catch (reason) {
      logFollowError("startAutoFollow", reason);
      setFollowStatus("error");
      setError(reason instanceof Error ? reason.message : "No pudimos iniciar el seguimiento automático.");
      await stopAutoFollow({ reason: "start-error" });
    } finally {
      startingRef.current = false;
      setIsStarting(false);
    }
  }, [autoFollowKey, canAutoFollow, playRows, timeline, timelineStats.detectable, stopAutoFollow]);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      setTemporarilyPaused(false);
      void load();
      return () => {
        setIsFocused(false);
        void stopAutoFollow({ reason: "screen-blur" });
      };
    }, [load, stopAutoFollow]),
  );

  useEffect(() => {
    if (shouldListen) {
      void startAutoFollow();
    } else {
      void stopAutoFollow({ reason: "lifecycle-disabled" });
    }
  }, [shouldListen, startAutoFollow, stopAutoFollow]);

  useEffect(() => {
    if (autoFollowEnabled && isFocused && canAutoFollow) {
      void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch((reason) => logFollowError("activateKeepAwake", reason));
      return () => {
        void deactivateKeepAwake(KEEP_AWAKE_TAG).catch((reason) => logFollowError("deactivateKeepAwake", reason));
      };
    }

    void deactivateKeepAwake(KEEP_AWAKE_TAG).catch((reason) => logFollowError("deactivateKeepAwake", reason));
    return undefined;
  }, [autoFollowEnabled, canAutoFollow, isFocused]);

  useEffect(() => {
    if (!canAutoFollow && autoFollowEnabled && preferenceLoaded) {
      void stopAutoFollow({ reason: "no-compatible-run" });
    }
  }, [autoFollowEnabled, canAutoFollow, preferenceLoaded, stopAutoFollow]);

  async function enableAutoFollow() {
    const permission = await AudioManager.requestRecordingPermissions();
    if (permission !== "Granted") {
      await SecureStore.setItemAsync(AUTO_FOLLOW_KEY, "permission-denied");
      setAutoFollowEnabled(false);
      setTemporarilyPaused(false);
      Alert.alert("Permiso requerido", "Necesitamos permiso de micrófono para seguir los acordes.");
      return;
    }
    await SecureStore.setItemAsync(AUTO_FOLLOW_KEY, "true");
    setTemporarilyPaused(false);
    setAutoFollowEnabled(true);
  }

  async function disableAutoFollow() {
    setAutoFollowEnabled(false);
    setTemporarilyPaused(false);
    await stopAutoFollow({ reason: "user-disabled" });
  }

  function restartFollowFromBeginning() {
    manualRepositionRef.current = null;
    setManualRepositionStatus("idle");
    autoScrollSuspendedUntilRef.current = Date.now() + MANUAL_REPOSITION_PAUSE_MS;
    previousEvidenceFrameRef.current = null;

    if (FOLLOW_GRANULARITY === "row") {
      const follower = rowFollowerRef.current;
      if (follower) follower.reset();
      setCurrentPlayRowIndex(0);
      setFollowIndex(playRows[0]?.startTimelineIndex ?? 0);
      setFollowStatus("confirmed");
    } else {
      const machine = machineRef.current;
      if (machine) {
        machine.reset();
        setFollowIndex(machine.currentIndex);
        setFollowStatus("confirmed");
        updateFollowerDebug({
          mode: machine.currentMode,
          committedTimelineIndex: machine.currentIndex,
          bestHypothesisIndex: null,
          followConfidence: 1,
          scoreMargin: 0,
          sequenceAmbiguous: false,
          currentEvent: machine.currentEvent,
        });
      } else {
        setFollowIndex(0);
        setFollowStatus("idle");
      }
    }

    lastScrolledLineRef.current = -1;
    lastAutomaticScrollYRef.current = -1;
    programmaticScrollUntilRef.current = Date.now() + 900;
    scrollRef.current?.scrollTo({ y: 0, animated: true });

    if (__DEV__) {
      console.log("[autoFollow:restart]", {
        reason: "user-requested",
        timelineEvents: timeline.length,
        timestamp: new Date().toISOString(),
      });
    }
  }

  function startVersionCreation() {
    if (!song) return;
    navigation.navigate("SongForm", {
      mode: "createVersion",
      sourceSongId: song.id,
      title: getSongDisplayTitle(song),
      initialSemitones: semitones,
    });
  }

  async function confirmDelete() {
    if (!song) return;
    setActionLoading(true);
    setError(null);
    let plan = { isPrincipal: false, affectedCount: 1, versionCount: 0 };
    try {
      if (songRepository.getDeletionPlan) {
        plan = await songRepository.getDeletionPlan(song.id);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos revisar las versiones de la canción.");
      setActionLoading(false);
      return;
    }
    setActionLoading(false);

    const deletesVersions = plan.isPrincipal && plan.versionCount > 0;
    const title = deletesVersions ? "Eliminar canción y versiones" : "Borrar canción";
    const message = deletesVersions
      ? `Se eliminará "${song.title}" y ${plan.versionCount === 1 ? "su 1 versión" : `sus ${plan.versionCount} versiones`}. Esta acción se aplicará también al respaldo cuando sincronices.`
      : `¿Seguro que querés borrar "${song.title}"?`;
    const destructiveLabel = deletesVersions ? "Eliminar canción y versiones" : "Borrar";

    Alert.alert(title, message, [
      { text: "Cancelar", style: "cancel" },
      {
        text: destructiveLabel,
        style: "destructive",
        onPress: () => {
          setActionLoading(true);
          songRepository.deleteSong(song.id)
            .then(() => navigation.goBack())
            .catch((reason) => setError(reason instanceof Error ? reason.message : "No pudimos borrar la canción."))
            .finally(() => setActionLoading(false));
        },
      },
    ]);
  }

  function showSongActions() {
    if (!song || actionLoading) return;
    Alert.alert("Acciones de la canción", undefined, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar canción", style: "destructive", onPress: () => void confirmDelete() },
    ]);
  }

  if (error && !song) return <View style={styles.center}><Text style={styles.error}>{error}</Text></View>;
  if (loading || !song) return <View style={styles.center}><ActivityIndicator color={colors.green} size="large" /></View>;

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.root}
      contentContainerStyle={styles.content}
      scrollEventThrottle={64}
      onScroll={(event) => {
        const y = event.nativeEvent.contentOffset.y;
        currentScrollYRef.current = y;
        if (__DEV__ && pendingPlayRowScrollCallRef.current) {
          const pending = pendingPlayRowScrollCallRef.current;
          pendingPlayRowScrollCallRef.current = null;
          console.log("[playRow:scroll-onScroll]", {
            actualY: Number(y.toFixed(1)),
            y: Number(y.toFixed(1)),
            fromY: Number(pending.fromY.toFixed(1)),
            targetY: Number(pending.targetY.toFixed(1)),
            toRow: pending.toRow,
            movedBy: Number((y - pending.fromY).toFixed(1)),
            timestamp: new Date().toISOString(),
          });
        }
      }}
      onScrollBeginDrag={handleManualScrollBegin}
      onScrollEndDrag={suspendAutoScrollForManualInteraction}
      onMomentumScrollEnd={() => {
        if (Date.now() >= programmaticScrollUntilRef.current) {
          suspendAutoScrollForManualInteraction();
        }
      }}
      onLayout={(event) => {
        viewportHeightRef.current = event.nativeEvent.layout.height;
        logLayoutChange("root-scroll-viewport", event.nativeEvent.layout.height);
        logGeometryIfReady();
      }}
    >
      <Text style={styles.title}>{songDisplayTitle}</Text>
      {hasSongDisplayMeta ? <Text style={styles.meta}>{songDisplayMeta}</Text> : null}

      <View
        style={styles.followCard}
        onLayout={(event) => logLayoutChange("follow-card", event.nativeEvent.layout.height)}
      >
        <View style={styles.followHeader}>
          <View style={styles.followTextBlock}>
            <Text style={[styles.followTitle, autoFollowEnabled && styles.followTitleActive]}>
              {autoFollowEnabled ? "● Escuchando" : "Seguimiento"}
            </Text>
            <Text style={styles.followHint} numberOfLines={1}>
              {autoFollowEnabled
                ? manualRepositionStatus === "searching"
                  ? "Buscando zona"
                  : isListening
                    ? "Micrófono activo"
                    : isStarting
                      ? "Iniciando"
                      : temporarilyPaused
                        ? "Pausado"
                        : "Esperando"
                : canAutoFollow
                  ? "Listo para escuchar"
                  : "Sin acordes suficientes"}
            </Text>
          </View>
          <Pressable
            style={[styles.followToggle, autoFollowEnabled && styles.followToggleActive]}
            onPress={() => {
              if (autoFollowEnabled) void disableAutoFollow();
              else void enableAutoFollow();
            }}
            disabled={!canAutoFollow}
          >
            <Text style={[styles.followToggleText, autoFollowEnabled && styles.followToggleTextActive]}>
              {autoFollowEnabled ? "Desactivar" : "Activar"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.toolsRow}>
        <View style={styles.transposeRow}>
          <Pressable style={styles.control} onPress={() => setSemitones((value) => value - 1)}><Text style={styles.controlText}>-</Text></Pressable>
          <Pressable style={styles.value} onPress={() => setSemitones(0)}><Text style={styles.valueText}>{transposeLabel}</Text></Pressable>
          <Pressable style={styles.control} onPress={() => setSemitones((value) => value + 1)}><Text style={styles.controlText}>+</Text></Pressable>
        </View>
        <Pressable
          style={[styles.versionItem, styles.versionCreateItem]}
          onPress={startVersionCreation}
          disabled={actionLoading}
        >
          <Text
            style={[styles.versionText, styles.versionCreateText]}
            numberOfLines={1}
          >
            + Nueva versión
          </Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.section}>LETRA Y ACORDES</Text>
      <View
        style={styles.songBox}
        onLayout={(event) => {
          songBoxYRef.current = event.nativeEvent.layout.y;
          songBoxYKnownRef.current = true;
          logLayoutChange("song-box", event.nativeEvent.layout.height);
          logGeometryIfReady();
        }}
      >
        <View
          style={styles.songBoxContent}
          onLayout={(event) => {
            songContentHeightRef.current = event.nativeEvent.layout.height;
            logGeometryIfReady();
          }}
        >
          {lines.map((line, lineIndex) => {
            const rowIndex = playRows.findIndex((row) => row.chordLineIndex === lineIndex);
            const isPlayRowLine = FOLLOW_GRANULARITY === "row" && rowIndex >= 0;
            const segments = getLineChordSegments(line, lineIndex, timeline, activeTimelineIndex, {
              activeTimelineIndexes: FOLLOW_GRANULARITY === "row" ? activePlayRowTimelineIndexes : undefined,
              nextTimelineIndexes: FOLLOW_GRANULARITY === "row" ? nextPlayRowTimelineIndexes : undefined,
            });
            const lineText = (
              <Text
                onLayout={(event) => {
                  lineYRef.current.set(lineIndex, event.nativeEvent.layout.y);
                  logGeometryIfReady();
                }}
                style={[styles.songContent, isPlayRowLine && styles.playRowLine]}
              >
                {segments.map((segment, segmentIndex) => {
                  if (segment.type === "text") return <Text key={segmentIndex}>{segment.text}</Text>;
                  return (
                    <Text
                      key={`${segment.timelineIndex}:${segment.text}:${segmentIndex}`}
                      style={[
                        styles.songChord,
                        segment.next && autoFollowEnabled && styles.songChordNext,
                        segment.active && styles.songChordActive,
                      ]}
                    >
                      {segment.text}
                    </Text>
                  );
                })}
              </Text>
            );
            if (isPlayRowLine) {
              return (
                <Pressable
                  key={`${lineIndex}:${line}`}
                  onPress={() => setPlayRowExplicitly(rowIndex, "tap-row")}
                  style={[
                    styles.songLineWrapper,
                    rowIndex === currentPlayRowIndex && autoFollowEnabled && styles.activePlayRowWrapper,
                  ]}
                  onLayout={(event) => {
                    const nextLayout = {
                      y: event.nativeEvent.layout.y,
                      height: event.nativeEvent.layout.height,
                      lineIndex,
                    };
                    const previousLayout = playRowLayoutRef.current.get(rowIndex);
                    playRowLayoutRef.current.set(rowIndex, nextLayout);
                    if (
                      __DEV__ &&
                      (!previousLayout ||
                        Math.abs(previousLayout.y - nextLayout.y) > 0.5 ||
                        Math.abs(previousLayout.height - nextLayout.height) > 0.5)
                    ) {
                      const previousRowLayout = playRowLayoutRef.current.get(rowIndex - 1);
                      console.log("[playRow:layout]", {
                        rowIndex,
                        lineIndex,
                        measuredY: Number(nextLayout.y.toFixed(1)),
                        height: Number(nextLayout.height.toFixed(1)),
                        previousRowY: previousRowLayout ? Number(previousRowLayout.y.toFixed(1)) : null,
                        monotonicFromPrevious:
                          previousRowLayout && lineIndex > previousRowLayout.lineIndex
                            ? nextLayout.y > previousRowLayout.y + 0.5
                            : null,
                        timestamp: new Date().toISOString(),
                      });
                    }
                  }}
                >
                  {lineText}
                </Pressable>
              );
            }
            return (
              <View key={`${lineIndex}:${line}`} pointerEvents="none" style={styles.songLineWrapper}>
                {lineText}
              </View>
            );
          })}
        </View>
      </View>
      {song.notes ? <><Text style={styles.section}>NOTAS</Text><View style={styles.notes}><Text style={styles.notesText}>{song.notes}</Text></View></> : null}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 48 },
  devCaptureOverlay: { position: "absolute", top: 12, right: 12, zIndex: 20 },
  devCapturePanel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: "rgba(18, 24, 21, 0.94)",
    padding: 8,
    gap: 5,
  },
  devCaptureTitle: { color: colors.green, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  devCaptureText: { color: colors.muted, fontSize: 10, fontFamily: "monospace" },
  devCaptureActions: { flexDirection: "row", gap: 6 },
  devCaptureButton: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  devCaptureButtonActive: { borderColor: colors.danger },
  devCaptureButtonText: { color: colors.text, fontSize: 11, fontWeight: "900" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: colors.background },
  error: { color: colors.danger, textAlign: "center", marginTop: 12 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 2 },
  headerEditButton: { minWidth: 52, minHeight: 44, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  headerAction: { color: colors.greenPressed, fontWeight: "700", fontSize: 14 },
  headerMenuButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  headerMenuIcon: { color: colors.text, fontSize: 17, fontWeight: "900", letterSpacing: 1 },
  title: { color: colors.text, fontSize: 28, lineHeight: 33, fontWeight: "900", letterSpacing: -0.7 },
  meta: { color: colors.muted, fontSize: 14, marginTop: 4, lineHeight: 20 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 18 },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  secondaryButtonText: { color: colors.green, fontWeight: "800" },
  followCard: { borderWidth: 1, borderColor: "rgba(148, 163, 184, 0.18)", borderRadius: 18, backgroundColor: "rgba(15, 23, 42, 0.78)", paddingHorizontal: 12, paddingVertical: 9, marginTop: 12 },
  followHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  followTextBlock: { flex: 1, minWidth: 0 },
  followTitle: { color: colors.text, fontWeight: "900", fontSize: 15 },
  followTitleActive: { color: colors.green },
  followHint: { color: colors.muted, marginTop: 1, fontSize: 12 },
  followToggle: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, minWidth: 88, alignItems: "center" },
  followToggleActive: { backgroundColor: colors.greenPressed, borderColor: colors.greenPressed },
  followToggleText: { color: colors.text, fontWeight: "900" },
  followToggleTextActive: { color: colors.background },
  followStatusRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 8, minHeight: 30 },
  micIndicator: { display: "none", color: colors.green, fontWeight: "900", minWidth: 112 },
  micIndicatorClean: { color: colors.green, fontWeight: "900", minWidth: 92, fontSize: 12 },
  followSubtle: { display: "none", color: colors.muted, flex: 1, minWidth: 0 },
  pauseButton: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  pauseButtonText: { color: colors.text, fontWeight: "800" },
  devSmallButton: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  devSmallButtonText: { color: colors.muted, fontSize: 11, fontWeight: "900" },
  followerDebugPanel: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  followerDebugTitle: { color: colors.green, fontWeight: "900", fontSize: 12, letterSpacing: 1.2, marginBottom: 5 },
  followerDebugText: { color: colors.muted, fontFamily: "monospace", fontSize: 12, lineHeight: 18 },
  toolsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 12, flexWrap: "wrap" },
  transposeRow: { flexDirection: "row", alignSelf: "flex-start", alignItems: "center", gap: 6, borderWidth: 1, borderColor: "rgba(148, 163, 184, 0.18)", borderRadius: 999, padding: 4, backgroundColor: "rgba(15, 23, 42, 0.82)" },
  control: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  controlText: { color: colors.text, fontSize: 22, fontWeight: "600" },
  value: { minWidth: 74, height: 36, alignItems: "center", justifyContent: "center" },
  valueText: { color: colors.text, fontWeight: "700" },
  section: { color: colors.muted, fontSize: 12, fontWeight: "900", letterSpacing: 2.4, marginTop: 18, marginBottom: 9 },
  versions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  versionActionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" },
  versionSummaryText: { color: colors.muted, flexShrink: 1 },
  versionItem: { borderWidth: 1, borderColor: "rgba(148, 163, 184, 0.2)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 },
  versionItemActive: { borderColor: colors.greenPressed },
  versionText: { color: colors.text, fontWeight: "700" },
  versionCreateItem: { borderColor: colors.greenPressed },
  versionCreateText: { color: colors.greenPressed },
  songBox: { borderWidth: 1, borderColor: "rgba(148, 163, 184, 0.2)", borderRadius: 24, backgroundColor: "rgba(2, 6, 23, 0.72)", overflow: "hidden" },
  songBoxContent: { padding: SONG_BOX_CONTENT_PADDING, width: "100%" },
  songLineWrapper: { width: "100%", borderRadius: 12, paddingHorizontal: 3 },
  activePlayRowWrapper: { backgroundColor: "rgba(166, 230, 62, 0.08)" },
  songContent: { color: "rgba(248, 250, 252, 0.92)", fontSize: 16, lineHeight: 25, fontFamily: "monospace", flexShrink: 1, flexWrap: "wrap" },
  playRowLine: { paddingVertical: 2 },
  songChord: { color: colors.greenPressed, fontFamily: "monospace", fontWeight: "800" },
  songChordNext: { color: colors.text },
  songChordActive: {
    color: colors.background,
    backgroundColor: colors.greenPressed,
    fontFamily: "monospace",
  },
  notes: { borderWidth: 1, borderColor: colors.border, borderRadius: 22, padding: 16, backgroundColor: colors.surface },
  notesText: { color: colors.text, lineHeight: 23 },
});
