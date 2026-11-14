import { useEffect, useMemo, useRef, useState } from "react";
import { AudioManager, AudioRecorder } from "react-native-audio-api";
import { useKeepAwake } from "expo-keep-awake";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSongRepository } from "../data/songs";
import { ChordAdvanceMachine } from "../music/chordAdvance";
import { deriveChordTimeline, getPlayableTimeline, type ChordTimelineEvent } from "../music/chordTimeline";
import { detectExpectedChord, type ChordCandidate, type SupportedChord } from "../music/chordDetection";
import { colors } from "../theme";
import type { RootStackParamList, SongDetail } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "SongPlayMode">;

const SAMPLE_RATE = 44100;
const BUFFER_LENGTH = 4096;
const PROCESS_INTERVAL_MS = 150;
const SCROLL_CONTEXT_Y = 120;

export function SongPlayModeScreen({ navigation, route }: Props) {
  useKeepAwake();
  const songRepository = useSongRepository();

  const scrollRef = useRef<ScrollView | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const machineRef = useRef<ChordAdvanceMachine | null>(null);
  const lineYRef = useRef(new Map<number, number>());
  const lastProcessAtRef = useRef(0);
  const startedAtRef = useRef(0);
  const firstAudioReadySeenRef = useRef(false);
  const audioSessionActiveRef = useRef(false);

  const [song, setSong] = useState<SongDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [candidate, setCandidate] = useState<ChordCandidate>("unknown");
  const [confidence, setConfidence] = useState(0);
  const [status, setStatus] = useState<"idle" | "listening" | "unknown" | "confirmed" | "advanced" | "error">("idle");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    songRepository.getSong(route.params.songId)
      .then((nextSong) => {
        if (!mounted) return;
        setSong(nextSong);
        navigation.setOptions({ title: "Modo tocar" });
      })
      .catch((reason) => {
        if (!mounted) return;
        setError(reason instanceof Error ? reason.message : "No pudimos cargar la canción.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [navigation, route.params.songId, songRepository]);

  const lines = useMemo(() => (song ? song.content.split(/\r?\n/) : []), [song]);
  const timeline = useMemo(() => (song ? deriveChordTimeline(song.content) : []), [song]);
  const playableTimeline = useMemo(() => getPlayableTimeline(timeline), [timeline]);
  const sequence = useMemo(
    () => playableTimeline.map((event) => event.supportedChord).filter((chord): chord is SupportedChord => chord !== null),
    [playableTimeline],
  );
  const currentEvent = playableTimeline[currentIndex] ?? null;
  const nextEvent = playableTimeline[currentIndex + 1] ?? null;

  useEffect(() => {
    if (sequence.length > 0) {
      machineRef.current = new ChordAdvanceMachine(sequence);
    }
  }, [sequence]);

  function logPlay(stage: string, details?: Record<string, unknown>) {
    console.log("[SongPlayMode]", { stage, timestamp: new Date().toISOString(), ...details });
  }

  function logPlayError(stage: string, reason: unknown) {
    if (reason instanceof Error) {
      console.error("[SongPlayMode:error]", {
        stage,
        name: reason.name,
        message: reason.message,
        stack: reason.stack,
      });
      return;
    }

    console.error("[SongPlayMode:error]", {
      stage,
      name: typeof reason,
      message: String(reason),
    });
  }

  async function requestMicrophonePermission() {
    logPlay("2. comienzo de request de permiso de microfono");
    const permission = await AudioManager.requestRecordingPermissions();
    logPlay("3. resultado del permiso", { permission });
    return permission === "Granted";
  }

  async function configureAndActivateAudioSession() {
    logPlay("3b. configuracion audio session", {
      iosCategory: "record",
      iosMode: "default",
      iosOptions: [],
    });
    AudioManager.setAudioSessionOptions({
      iosCategory: "record",
      iosMode: "default",
      iosOptions: [],
    });

    logPlay("3c. activacion audio session");
    await AudioManager.setAudioSessionActivity(true);
    audioSessionActiveRef.current = true;
    logPlay("3d. audio session activa", { activated: true });
  }

  function scrollToEvent(event: ChordTimelineEvent) {
    const y = lineYRef.current.get(event.lineIndex);
    if (typeof y !== "number") return;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - SCROLL_CONTEXT_Y), animated: true });
  }

  function handleAudio(samples: Float32Array, sampleRate: number) {
    const machine = machineRef.current;
    if (!machine) return;

    const now = Date.now();
    if (now - lastProcessAtRef.current < PROCESS_INTERVAL_MS) return;
    lastProcessAtRef.current = now;

    const machineIndex = machine.currentIndex;
    const expectedForFrame = sequence[machineIndex];
    const nextForFrame = sequence[machineIndex + 1] ?? null;
    const expectedCandidates = nextForFrame ? [expectedForFrame, nextForFrame] : [expectedForFrame];
    const detection = detectExpectedChord(samples, sampleRate, expectedCandidates);
    const output = machine.process({
      candidate: detection.candidate,
      confidence: detection.confidence,
      nowMs: now,
    });

    console.log("[SongPlayMode:frame]", {
      elapsedMs: Math.max(0, now - startedAtRef.current),
      expected: output.expected,
      next: output.next,
      candidate: detection.candidate,
      confidence: Number(detection.confidence.toFixed(3)),
      advanced: output.advanced,
      index: output.index,
      lineIndex: playableTimeline[output.index]?.lineIndex,
      rms: Number(detection.rms.toFixed(4)),
    });

    setCandidate(detection.candidate);
    setConfidence(detection.confidence);
    setStatus(output.status);
    setCurrentIndex(output.index);

    if (output.advanced) {
      const event = playableTimeline[output.index];
      if (event) scrollToEvent(event);
    }
  }

  async function start() {
    logPlay("1. tap en Iniciar", { isListening, isStarting, sequenceLength: sequence.length });
    if (isListening || isStarting) return;
    if (sequence.length === 0) {
      Alert.alert("Sin acordes compatibles", "No encontramos acordes compatibles para iniciar el seguimiento.");
      return;
    }

    setIsStarting(true);
    setError(null);
    setStatus("listening");

    try {
      const hasPermission = await requestMicrophonePermission();
      if (!hasPermission) {
        Alert.alert("Permiso requerido", "Necesitamos permiso de micrófono para escuchar los acordes.");
        setStatus("idle");
        return;
      }

      await configureAndActivateAudioSession();

      const machine = new ChordAdvanceMachine(sequence);
      machineRef.current = machine;
      setCurrentIndex(0);
      setCandidate("unknown");
      setConfidence(0);
      lastProcessAtRef.current = 0;
      startedAtRef.current = Date.now();
      firstAudioReadySeenRef.current = false;
      const firstEvent = playableTimeline[0];
      if (firstEvent) scrollToEvent(firstEvent);

      logPlay("4. creacion de AudioRecorder");
      const recorder = new AudioRecorder();
      recorderRef.current = recorder;
      recorder.onError((event) => {
        console.error("[SongPlayMode:recorderError]", {
          stage: "onError",
          message: event.message,
        });
        setError(event.message);
        setStatus("error");
      });

      logPlay("5. registro de onAudioReady", {
        requestedSampleRate: SAMPLE_RATE,
        requestedBufferLength: BUFFER_LENGTH,
        requestedChannelCount: 1,
      });
      const audioReady = recorder.onAudioReady(
        { sampleRate: SAMPLE_RATE, bufferLength: BUFFER_LENGTH, channelCount: 1 },
        (event) => {
          try {
            const samples = event.buffer.getChannelData(0);
            if (!firstAudioReadySeenRef.current) {
              firstAudioReadySeenRef.current = true;
              logPlay("8. llegada del primer callback onAudioReady", {
                eventSampleRate: event.buffer.sampleRate,
                numberOfChannels: event.buffer.numberOfChannels,
                length: event.buffer.length,
                duration: event.buffer.duration,
              });
              logPlay("9. tamano del primer buffer PCM recibido", {
                samplesLength: samples.length,
                byteLength: samples.byteLength,
              });
            }
            handleAudio(samples, event.buffer.sampleRate || SAMPLE_RATE);
          } catch (reason) {
            logPlayError("onAudioReady callback", reason);
          }
        },
      );
      logPlay("5b. resultado de onAudioReady", { status: audioReady.status });
      if (audioReady.status === "error") throw new Error(audioReady.message);

      logPlay("6. llamada a start()");
      const started = await Promise.resolve(recorder.start());
      logPlay("7. resolucion/rechazo de start()", { status: started.status });
      if (started.status === "error") throw new Error(started.message);

      setIsListening(true);
      setStatus("listening");
    } catch (reason) {
      logPlayError("start()", reason);
      const message = reason instanceof Error ? reason.message : "No pudimos iniciar el micrófono.";
      setError(message);
      setStatus("error");
      Alert.alert("No pudimos iniciar la escucha", message);
      await stop({ reason: "start-error" });
    } finally {
      setIsStarting(false);
    }
  }

  async function stop(options: { reason?: string; updateState?: boolean } = {}) {
    const { reason = "manual", updateState = true } = options;
    logPlay("stop. inicio", { reason });
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (updateState) setIsListening(false);

    try {
      if (recorder) {
        const wasRecording = recorder.isRecording();
        logPlay("stop. recorder encontrado", { wasRecording });
        if (wasRecording) {
          const stopped = await Promise.resolve(recorder.stop());
          logPlay("stop. resultado recorder.stop()", { status: stopped.status });
        }
        recorder.clearOnAudioReady();
        recorder.clearOnError();
        logPlay("stop. callbacks limpiados");
      }

      if (audioSessionActiveRef.current) {
        logPlay("stop. desactivacion audio session");
        await AudioManager.setAudioSessionActivity(false);
        audioSessionActiveRef.current = false;
        logPlay("stop. audio session desactivada", { deactivated: true });
      }

      if (updateState) setStatus("idle");
    } catch (reason) {
      logPlayError("stop()", reason);
      if (updateState) {
        const message = reason instanceof Error ? reason.message : "No pudimos detener el micrófono.";
        setError(message);
        setStatus("error");
      }
    }
  }

  useEffect(() => {
    return () => {
      void stop({ reason: "unmount", updateState: false });
    };
  }, []);

  if (error && !song) return <View style={styles.center}><Text style={styles.error}>{error}</Text></View>;
  if (loading || !song) return <View style={styles.center}><ActivityIndicator color={colors.green} size="large" /></View>;

  return (
    <View style={styles.root}>
      <View style={styles.debugPanel}>
        <View style={styles.debugColumn}>
          <Text style={styles.debugLabel}>Esperado</Text>
          <Text style={styles.debugValue}>{currentEvent?.chord ?? "-"}</Text>
        </View>
        <View style={styles.debugColumn}>
          <Text style={styles.debugLabel}>Detectado</Text>
          <Text style={styles.debugValue}>{candidate}</Text>
        </View>
        <View style={styles.debugColumn}>
          <Text style={styles.debugLabel}>Confianza</Text>
          <Text style={styles.debugValue}>{Math.round(confidence * 100)}%</Text>
        </View>
        <View style={styles.debugColumn}>
          <Text style={styles.debugLabel}>Sig.</Text>
          <Text style={styles.debugValue}>{nextEvent?.chord ?? "-"}</Text>
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
          onPress={() => void start()}
          disabled={isListening || isStarting}
        >
          {isStarting ? <ActivityIndicator color={colors.background} /> : <Text style={styles.primaryText}>Escuchar</Text>}
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => void stop()} disabled={!isListening && !isStarting}>
          <Text style={styles.secondaryText}>Detener</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.status}>
        {status} · {currentIndex + 1}/{Math.max(1, playableTimeline.length)} eventos compatibles
      </Text>

      <ScrollView ref={scrollRef} style={styles.songScroll} contentContainerStyle={styles.songContent}>
        <Text style={styles.title}>{song.title}</Text>
        <Text style={styles.meta}>{[song.artist, song.versionName, song.key].filter(Boolean).join(" · ") || "Sin datos adicionales"}</Text>
        <ScrollView horizontal style={styles.songBox} contentContainerStyle={styles.songBoxContent} showsHorizontalScrollIndicator>
          <View>
            {lines.map((line, lineIndex) => (
              <Text
                key={`${lineIndex}:${line}`}
                onLayout={(event) => {
                  lineYRef.current.set(lineIndex, event.nativeEvent.layout.y);
                }}
                style={[
                  styles.songLine,
                  currentEvent?.lineIndex === lineIndex && styles.songLineActive,
                ]}
              >
                {line.length > 0 ? line : " "}
              </Text>
            ))}
          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: colors.background },
  debugPanel: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, backgroundColor: colors.surface },
  debugColumn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 8 },
  debugLabel: { color: colors.muted, fontSize: 10, fontWeight: "800" },
  debugValue: { color: colors.text, fontSize: 15, fontWeight: "900", marginTop: 3 },
  controls: { flexDirection: "row", gap: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surface },
  primaryButton: { flex: 1, minHeight: 46, borderRadius: 16, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  primaryButtonPressed: { backgroundColor: colors.greenPressed },
  primaryText: { color: colors.background, fontWeight: "900", fontSize: 16 },
  secondaryButton: { flex: 1, minHeight: 46, borderRadius: 16, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: colors.text, fontWeight: "900", fontSize: 16 },
  error: { color: colors.danger, textAlign: "center", marginTop: 8 },
  status: { color: colors.green, fontWeight: "800", paddingHorizontal: 14, paddingBottom: 8 },
  songScroll: { flex: 1 },
  songContent: { padding: 18, paddingBottom: 80 },
  title: { color: colors.text, fontSize: 30, fontWeight: "900" },
  meta: { color: colors.muted, fontSize: 14, marginTop: 6, marginBottom: 18 },
  songBox: { borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.surfaceStrong },
  songBoxContent: { padding: 16, minWidth: "100%" },
  songLine: { color: colors.text, fontSize: 16, lineHeight: 24, fontFamily: "monospace" },
  songLineActive: { color: colors.green, backgroundColor: "#052e16" },
});
