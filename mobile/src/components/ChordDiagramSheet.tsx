import { useEffect, useMemo, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getChordDiagramPresentation } from "../music/chordDiagramPresentation";
import { findGuitarChordShapes } from "../music/guitarChordShapes";
import { colors } from "../theme";
import { GuitarChordDiagram } from "./GuitarChordDiagram";

type Props = {
  chord: string | null;
  onClose: () => void;
};

export function ChordDiagramSheet({ chord, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [positionIndex, setPositionIndex] = useState(0);
  const presentation = getChordDiagramPresentation(Platform.OS === "ios" && Platform.isPad, width, height);
  const lookup = useMemo(() => findGuitarChordShapes(chord ?? ""), [chord]);
  const shape = lookup.shapes[positionIndex] ?? null;

  useEffect(() => setPositionIndex(0), [lookup.canonicalChord]);

  return (
    <Modal
      visible={chord !== null}
      transparent
      animationType={presentation.mode === "bottom-sheet" ? "slide" : "fade"}
      onRequestClose={onClose}
      supportedOrientations={["portrait", "portrait-upside-down", "landscape-left", "landscape-right"]}
    >
      <View style={[styles.overlay, presentation.mode === "center-card" && styles.overlayCentered]}>
        <Pressable
          accessibilityLabel="Cerrar diagrama"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.panel,
            presentation.mode === "center-card" ? styles.centerCard : styles.bottomSheet,
            {
              maxWidth: presentation.maxWidth,
              paddingBottom: Math.max(insets.bottom, 18),
              maxHeight: height - Math.max(insets.top, 18) - 18,
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.titleBlock}>
              <Text style={styles.eyebrow}>ACORDE</Text>
              <Text accessibilityRole="header" adjustsFontSizeToFit numberOfLines={1} style={styles.title}>{chord}</Text>
            </View>
            <Pressable accessibilityLabel="Cerrar" accessibilityRole="button" hitSlop={10} onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <ScrollView bounces={false} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {shape ? (
              <>
                <GuitarChordDiagram shape={shape} size={presentation.diagramSize} />
                {lookup.shapes.length > 1 ? (
                  <View style={styles.positionRow}>
                    <Pressable
                      accessibilityLabel="Digitación anterior"
                      accessibilityRole="button"
                      disabled={positionIndex === 0}
                      onPress={() => setPositionIndex((value) => Math.max(0, value - 1))}
                      style={[styles.positionButton, positionIndex === 0 && styles.positionButtonDisabled]}
                    ><Text style={styles.positionButtonText}>‹</Text></Pressable>
                    <Text style={styles.positionText}>Posición {positionIndex + 1} de {lookup.shapes.length}</Text>
                    <Pressable
                      accessibilityLabel="Siguiente digitación"
                      accessibilityRole="button"
                      disabled={positionIndex === lookup.shapes.length - 1}
                      onPress={() => setPositionIndex((value) => Math.min(lookup.shapes.length - 1, value + 1))}
                      style={[styles.positionButton, positionIndex === lookup.shapes.length - 1 && styles.positionButtonDisabled]}
                    ><Text style={styles.positionButtonText}>›</Text></Pressable>
                  </View>
                ) : null}
                <View style={styles.legend}>
                  <Text style={styles.legendText}><Text style={styles.legendStrong}>1–4</Text> dedos</Text>
                  <Text style={styles.legendText}><Text style={styles.legendStrong}>○</Text> al aire</Text>
                  <Text style={styles.legendText}><Text style={styles.legendStrong}>×</Text> no tocar</Text>
                </View>
              </>
            ) : (
              <View style={styles.missing}>
                <Text style={styles.missingTitle}>Todavía no tenemos una digitación verificada</Text>
                <Text style={styles.missingText}>Preferimos no mostrar una posición que pueda ser incorrecta para este acorde.</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(2, 6, 23, 0.76)" },
  overlayCentered: { justifyContent: "center", alignItems: "center", padding: 24 },
  panel: { width: "100%", backgroundColor: colors.surface, borderColor: colors.border, paddingHorizontal: 22, paddingTop: 18 },
  bottomSheet: { alignSelf: "center", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderBottomWidth: 0 },
  centerCard: { borderRadius: 28, borderWidth: 1 },
  header: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  titleBlock: { flex: 1 },
  eyebrow: { color: colors.greenPressed, fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: colors.text, fontSize: 30, lineHeight: 36, fontWeight: "900" },
  closeButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  closeText: { color: colors.text, fontSize: 28, lineHeight: 30 },
  body: { paddingTop: 8, paddingBottom: 2 },
  positionRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 14, marginTop: 2 },
  positionButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  positionButtonDisabled: { opacity: 0.3 },
  positionButtonText: { color: colors.text, fontSize: 28, lineHeight: 30 },
  positionText: { color: colors.muted, fontWeight: "700" },
  legend: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 12 },
  legendText: { color: colors.muted, fontSize: 13 },
  legendStrong: { color: colors.text, fontWeight: "900" },
  missing: { paddingVertical: 52, alignItems: "center", gap: 10 },
  missingTitle: { color: colors.text, fontSize: 19, lineHeight: 25, fontWeight: "900", textAlign: "center" },
  missingText: { color: colors.muted, lineHeight: 22, textAlign: "center", maxWidth: 390 },
});
