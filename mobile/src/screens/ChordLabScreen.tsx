import { useEffect, useRef, useState } from "react";
import { AudioManager, AudioRecorder } from "react-native-audio-api";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { detectExpectedChord, type ChordCandidate, type SupportedChord } from "../music/chordDetection";
import { colors } from "../theme";
import type { RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "ChordLab">;

const SAMPLE_RATE = 44100;
const BUFFER_LENGTH = 4096;
const PROCESS_INTERVAL_MS = 150;
const DIAGNOSTIC_CHORDS: SupportedChord[] = [
  "C", "Cm", "C#m", "D", "Dm", "D#m", "D#", "E", "Em", "F", "Fm", "F#m",
  "F#", "G", "Gm", "G#m", "G#", "A", "Am", "A#m", "A#", "Bb", "B", "Bm",
  "Eb",
];
export function ChordLabScreen(_props: Props) {
  const scrollRef = useRef<ScrollView | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const lastProcessAtRef = useRef(0);
  const startedAtRef = useRef(0);
  const firstAudioReadySeenRef = useRef(false);
  const audioSessionActiveRef = useRef(false);

  const [isListening, setIsListening] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [candidate, setCandidate] = useState<ChordCandidate>("unknown");
  const [confidence, setConfidence] = useState(0);
  const [rms, setRms] = useState(0);
  const [topCandidates, setTopCandidates] = useState<Array<{ chord: string; score: number }>>([]);
  const [status, setStatus] = useState<"idle" | "listening" | "unknown" | "confirmed" | "advanced" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!__DEV__) {
    return (
      <View style={styles.releaseUnavailable}>
        <Text style={styles.title}>Laboratorio no disponible</Text>
        <Text style={styles.description}>Esta herramienta es solo para desarrollo.</Text>
      </View>
    );
  }

  function logLab(stage: string, details?: Record<string, unknown>) {
    console.log("[ChordLab:start]", { stage, timestamp: new Date().toISOString(), ...details });
  }

  function logLabError(stage: string, reason: unknown) {
    if (reason instanceof Error) {
      console.error("[ChordLab:start:error]", {
        stage,
        name: reason.name,
        message: reason.message,
        stack: reason.stack,
      });
      return;
    }

    console.error("[ChordLab:start:error]", {
      stage,
      name: typeof reason,
      message: String(reason),
    });
  }

  async function requestMicrophonePermission() {
    logLab("2. comienzo de request de permiso de microfono");
    try {
      const permission = await AudioManager.requestRecordingPermissions();
      logLab("3. resultado del permiso", { permission });
      return permission === "Granted";
    } catch (reason) {
      logLabError("requestRecordingPermissions", reason);
      throw reason;
    }
  }

  async function configureAndActivateAudioSession() {
    logLab("3b. configuracion audio session", {
      iosCategory: "record",
      iosMode: "default",
      iosOptions: [],
    });
    try {
      AudioManager.setAudioSessionOptions({
        iosCategory: "record",
        iosMode: "default",
        iosOptions: [],
      });

      logLab("3c. activacion audio session");
      await AudioManager.setAudioSessionActivity(true);
      audioSessionActiveRef.current = true;
      logLab("3d. audio session activa", { activated: true });
    } catch (reason) {
      logLabError("configureAndActivateAudioSession", reason);
      throw reason;
    }
  }

  function handleAudio(samples: Float32Array, sampleRate: number) {
    const now = Date.now();
    if (now - lastProcessAtRef.current < PROCESS_INTERVAL_MS) return;
    lastProcessAtRef.current = now;

    const detection = detectExpectedChord(samples, sampleRate, DIAGNOSTIC_CHORDS);
    const top3 = Object.entries(detection.scores)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .slice(0, 3)
      .map(([chord, score]) => ({ chord, score: score ?? 0 }));

    const latencyMs = Math.max(0, now - startedAtRef.current);
    console.log("[ChordLab]", {
      timestamp: new Date(now).toISOString(),
      elapsedMs: latencyMs,
      candidate: detection.candidate,
      confidence: Number(detection.confidence.toFixed(3)),
      rms: Number(detection.rms.toFixed(4)),
      top3: top3.map((item) => ({ chord: item.chord, score: Number(item.score.toFixed(3)) })),
    });

    setCandidate(detection.candidate);
    setConfidence(detection.confidence);
    setRms(detection.rms);
    setTopCandidates(top3);
    setStatus(detection.candidate === "unknown" ? "unknown" : "confirmed");
  }

  async function start() {
    logLab("1. tap en Iniciar", { isListening, isStarting });
    if (isListening || isStarting) return;
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
      setCandidate("unknown");
      setConfidence(0);
      setRms(0);
      setTopCandidates([]);
      lastProcessAtRef.current = 0;
      startedAtRef.current = Date.now();
      firstAudioReadySeenRef.current = false;

      logLab("4. creacion de AudioRecorder");
      const recorder = new AudioRecorder();
      recorderRef.current = recorder;
      recorder.onError((event) => {
        console.error("[ChordLab:recorderError]", {
          stage: "onError",
          message: event.message,
        });
        setError(event.message);
        setStatus("error");
      });

      logLab("5. registro de onAudioReady", {
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
              logLab("8. llegada del primer callback onAudioReady", {
                eventSampleRate: event.buffer.sampleRate,
                numberOfChannels: event.buffer.numberOfChannels,
                length: event.buffer.length,
                duration: event.buffer.duration,
              });
              logLab("9. tamano del primer buffer PCM recibido", {
                samplesLength: samples.length,
                byteLength: samples.byteLength,
              });
            }
            handleAudio(samples, event.buffer.sampleRate || SAMPLE_RATE);
          } catch (reason) {
            logLabError("onAudioReady callback", reason);
          }
        },
      );
      logLab("5b. resultado de onAudioReady", { status: audioReady.status });
      if (audioReady.status === "error") {
        throw new Error(audioReady.message);
      }

      logLab("6. llamada a start()");
      const started = await Promise.resolve(recorder.start());
      logLab("7. resolucion/rechazo de start()", { status: started.status });
      if (started.status === "error") {
        throw new Error(started.message);
      }

      setIsListening(true);
      setStatus("listening");
    } catch (reason) {
      logLabError("start()", reason);
      const message = reason instanceof Error ? reason.message : "No pudimos iniciar el micrófono.";
      setError(message);
      setStatus("error");
      Alert.alert("No pudimos iniciar la escucha", message);
      await stop();
    } finally {
      setIsStarting(false);
    }
  }

  async function stop(options: { reason?: string; updateState?: boolean } = {}) {
    const { reason = "manual", updateState = true } = options;
    logLab("stop. inicio", { reason });
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (updateState) setIsListening(false);

    try {
      if (recorder) {
        const wasRecording = recorder.isRecording();
        logLab("stop. recorder encontrado", { wasRecording });
        if (wasRecording) {
          const stopped = await Promise.resolve(recorder.stop());
          logLab("stop. resultado recorder.stop()", { status: stopped.status });
        }
        recorder.clearOnAudioReady();
        recorder.clearOnError();
        logLab("stop. callbacks limpiados");
      } else {
        logLab("stop. sin recorder activo");
      }

      if (audioSessionActiveRef.current) {
        logLab("stop. desactivacion audio session");
        await AudioManager.setAudioSessionActivity(false);
        audioSessionActiveRef.current = false;
        logLab("stop. audio session desactivada", { deactivated: true });
      }

      if (updateState) {
        setStatus("idle");
      }
    } catch (reason) {
      logLabError("stop()", reason);
      const message = reason instanceof Error ? reason.message : "No pudimos detener el micrófono.";
      if (updateState) {
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

  return (
    <ScrollView ref={scrollRef} style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>DEV · EXPERIMENTAL</Text>
      <Text style={styles.title}>Laboratorio de acordes</Text>
      <Text style={styles.description}>Detección libre: tocá cualquier acorde y mirá los candidatos del detector.</Text>

      <View style={styles.panel}>
        <Text style={styles.label}>Candidato principal</Text>
        <Text style={styles.expected}>{candidate}</Text>
        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Confianza</Text>
            <Text style={styles.metricValue}>{Math.round(confidence * 100)}%</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>RMS</Text>
            <Text style={styles.metricValue}>{rms.toFixed(4)}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Estado</Text>
            <Text style={styles.metricValue}>{isListening ? status : "idle"}</Text>
          </View>
        </View>
        <Text style={styles.state}>Probá: C#m · F#m · Bb · Eb · G#m · Bm · E · A</Text>
        {__DEV__ ? (
          <View style={styles.diagnosticBox}>
            <Text style={styles.metricLabel}>Top 3 candidatos</Text>
            {topCandidates.length > 0 ? (
              topCandidates.map((item) => (
                <Text key={item.chord} style={styles.diagnosticText}>
                  {item.chord}: score {item.score.toFixed(3)}
                </Text>
              ))
            ) : (
              <Text style={styles.diagnosticText}>Sin señal todavía</Text>
            )}
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <View style={styles.buttons}>
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
          onPress={() => void start()}
          disabled={isListening || isStarting}
        >
          {isStarting ? <ActivityIndicator color={colors.background} /> : <Text style={styles.primaryText}>Iniciar</Text>}
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => void stop()} disabled={!isListening && !isStarting}>
          <Text style={styles.secondaryText}>Detener</Text>
        </Pressable>
      </View>
      <View style={styles.songBlock}>
        <Text style={styles.metricLabel}>Vocabulario diagnóstico</Text>
        <Text style={styles.diagnosticText}>{DIAGNOSTIC_CHORDS.join(" / ")}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  releaseUnavailable: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 24 },
  content: { padding: 18, paddingBottom: 48 },
  eyebrow: { color: colors.green, fontWeight: "800", letterSpacing: 3, fontSize: 12 },
  title: { color: colors.text, fontSize: 32, fontWeight: "900", marginTop: 6 },
  description: { color: colors.muted, marginTop: 8 },
  panel: { borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.surface, padding: 18, marginTop: 20 },
  label: { color: colors.muted, fontSize: 12, fontWeight: "800", letterSpacing: 1.4 },
  expected: { color: colors.text, fontSize: 58, fontWeight: "900", marginTop: 4 },
  metricsRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  metric: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 10 },
  metricLabel: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  metricValue: { color: colors.text, fontSize: 18, fontWeight: "900", marginTop: 4 },
  state: { color: colors.green, fontWeight: "800", marginTop: 14 },
  diagnosticBox: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  diagnosticText: { color: colors.text, fontFamily: "monospace", marginTop: 3 },
  error: { color: colors.danger, marginTop: 10 },
  buttons: { flexDirection: "row", gap: 10, marginTop: 16 },
  primaryButton: { flex: 1, minHeight: 52, borderRadius: 18, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  primaryButtonPressed: { backgroundColor: colors.greenPressed },
  primaryText: { color: colors.background, fontWeight: "900", fontSize: 17 },
  secondaryButton: { flex: 1, minHeight: 52, borderRadius: 18, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: colors.text, fontWeight: "900", fontSize: 17 },
  songBlock: { marginTop: 22, gap: 12 },
  line: { minHeight: 96, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 16, backgroundColor: colors.surfaceStrong },
  lineActive: { borderColor: colors.green, backgroundColor: "#052e16" },
  chord: { color: colors.green, fontFamily: "monospace", fontSize: 24, fontWeight: "900" },
  lyric: { color: colors.text, fontFamily: "monospace", fontSize: 16, marginTop: 8 },
});
