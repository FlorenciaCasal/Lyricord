import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { useAutomaticSongSync, useManualSongSync, type SongSyncPreview } from "../data/songs";
import { shouldRefreshSyncPreview } from "../data/songs/sync/AutomaticSongSyncCoordinator";
import { colors } from "../theme";

type SyncUiState =
  | { status: "idle" }
  | { status: "syncing" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type PreviewUiState =
  | { status: "idle" | "loading" }
  | { status: "ready"; preview: SongSyncPreview }
  | { status: "error" };

export function DevelopmentSongSyncControl({
  onSynced,
  refreshKey,
}: {
  onSynced: () => void | Promise<void>;
  refreshKey: number;
}) {
  const { user } = useAuth();
  const controller = useManualSongSync();
  const { state: automaticSyncState } = useAutomaticSongSync();
  const [state, setState] = useState<SyncUiState>({ status: "idle" });
  const [previewState, setPreviewState] = useState<PreviewUiState>({ status: "idle" });
  const previewRequestRef = useRef(0);
  const previousAutomaticStatusRef = useRef(automaticSyncState.status);

  const refreshPreview = useCallback(async () => {
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    if (!user || !controller.isAvailable()) {
      setPreviewState({ status: "idle" });
      return;
    }

    setPreviewState({ status: "loading" });
    try {
      const preview = await controller.preview(user.id);
      if (previewRequestRef.current === requestId) {
        setPreviewState({ status: "ready", preview });
      }
    } catch {
      if (previewRequestRef.current === requestId) {
        setPreviewState({ status: "error" });
      }
    }
  }, [controller, user]);

  useEffect(() => {
    void refreshPreview();
  }, [refreshKey, refreshPreview]);

  useEffect(() => {
    const previousStatus = previousAutomaticStatusRef.current;
    previousAutomaticStatusRef.current = automaticSyncState.status;
    if (shouldRefreshSyncPreview(previousStatus, automaticSyncState.status)) {
      void refreshPreview();
    }
  }, [automaticSyncState.status, refreshPreview]);

  if (!__DEV__ || !controller.isAvailable()) return null;

  const syncing = state.status === "syncing";

  async function runSync() {
    if (!user || syncing) return;
    setState({ status: "syncing" });
    try {
      const result = await controller.run(user.id);
      await onSynced();
      await refreshPreview();
      const issues = result.conflicts.length + result.itemErrors.length;
      setState({
        status: "success",
        message: issues > 0
          ? `Sincronización terminada con ${issues} elemento${issues === 1 ? "" : "s"} para revisar.`
          : `Sincronización lista: ${result.pushed} subida${result.pushed === 1 ? "" : "s"}, ${result.pulled} revisada${result.pulled === 1 ? "" : "s"}.`,
      });
    } catch {
      setState({
        status: "error",
        message: "No pudimos sincronizar. Tus cambios locales siguen guardados; podés volver a intentar.",
      });
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>SINCRONIZACIÓN DEV</Text>
      {previewState.status === "loading" ? (
        <Text style={styles.message}>Revisando datos locales...</Text>
      ) : null}
      {previewState.status === "ready" ? (
        <View style={styles.preview}>
          <Text style={styles.previewTitle}>
            Pendientes de esta cuenta: {previewState.preview.pendingTotal}
          </Text>
          <Text style={styles.message}>
            Nuevas: {previewState.preview.newCount} · Cambios: {previewState.preview.changedCount} · Eliminaciones: {previewState.preview.deletedCount}
          </Text>
          <Text style={styles.message}>Versiones pendientes: {previewState.preview.versionCount}</Text>
          <Text style={styles.message}>Anónimas excluidas: {previewState.preview.anonymousExcludedCount}</Text>
          {previewState.preview.errorCount > 0 ? (
            <Text style={styles.error}>Con errores pendientes de reintento: {previewState.preview.errorCount}</Text>
          ) : null}
        </View>
      ) : null}
      {previewState.status === "error" ? (
        <Text style={styles.error}>No pudimos leer la previsualización local.</Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sincronizar canciones en desarrollo"
        disabled={!user || syncing}
        onPress={() => void runSync()}
        style={({ pressed }) => [
          styles.button,
          (!user || syncing) && styles.buttonDisabled,
          pressed && user && !syncing && styles.buttonPressed,
        ]}
      >
        <Text style={styles.buttonText}>{syncing ? "Sincronizando..." : "Sincronizar ahora (DEV)"}</Text>
      </Pressable>
      {!user ? <Text style={styles.message}>Iniciá sesión para probar la sincronización.</Text> : null}
      {state.status === "success" || state.status === "error" ? (
        <Text style={state.status === "error" ? styles.error : styles.message}>{state.message}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 7,
    borderWidth: 1,
    borderColor: "rgba(166, 230, 62, 0.28)",
    borderRadius: 18,
    padding: 12,
    backgroundColor: "rgba(166, 230, 62, 0.06)",
  },
  label: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.7 },
  preview: { gap: 3 },
  previewTitle: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  button: {
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  buttonPressed: { backgroundColor: "rgba(166, 230, 62, 0.12)" },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: colors.green, fontWeight: "900", fontSize: 13 },
  message: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 17 },
});
