import { StyleSheet, Text, View } from "react-native";
import { useAutomaticSongSync } from "../data/songs";
import { colors } from "../theme";

export function SongSyncStatusIndicator() {
  const { state } = useAutomaticSongSync();

  if (state.status === "idle") return null;

  const message = state.status === "syncing"
    ? "Guardando respaldo..."
    : state.status === "offline"
      ? state.pending > 0 ? "Sin conexión · se respaldará cuando vuelva" : null
      : state.status === "pending"
        ? state.pending > 0 ? "Cambios guardados en este dispositivo" : null
        : state.status === "attention"
          ? "Hay un cambio para revisar"
          : state.pending > 0
            ? "No pudimos respaldar los cambios todavía"
            : null;

  if (!message) return null;
  const attention = state.status === "attention" || state.status === "error";
  return (
    <View accessibilityLiveRegion="polite" style={styles.container}>
      <View style={[styles.dot, attention && styles.dotAttention]} />
      <Text style={[styles.text, attention && styles.textAttention]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", gap: 7, minHeight: 20 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.muted },
  dotAttention: { backgroundColor: colors.danger },
  text: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  textAttention: { color: colors.text },
});
