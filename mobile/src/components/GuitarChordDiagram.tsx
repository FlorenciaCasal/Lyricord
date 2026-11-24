import { StyleSheet, Text, View } from "react-native";
import type { GuitarChordShape } from "../music/guitarChordShapes";
import { colors } from "../theme";

type Props = {
  shape: GuitarChordShape;
  size: number;
};

const FRET_COUNT = 5;

export function GuitarChordDiagram({ shape, size }: Props) {
  const gridWidth = size * 0.7;
  const gridHeight = size * 0.72;
  const gridLeft = (size - gridWidth) / 2;
  const gridTop = size * 0.17;
  const stringGap = gridWidth / 5;
  const fretGap = gridHeight / FRET_COUNT;
  const markerSize = Math.max(22, size * 0.085);
  const fingerSize = Math.max(24, size * 0.095);

  function stringX(index: number) {
    return gridLeft + index * stringGap;
  }

  function isCoveredByBarre(stringIndex: number, fret: number, finger: number) {
    const stringNumber = 6 - stringIndex;
    return shape.barres.some((barre) =>
      barre.fret === fret &&
      barre.finger === finger &&
      stringNumber >= barre.fromString &&
      stringNumber <= barre.toString,
    );
  }

  const description = shape.frets.map((fret, index) => {
    const stringNumber = 6 - index;
    if (fret < 0) return `cuerda ${stringNumber} apagada`;
    if (fret === 0) return `cuerda ${stringNumber} al aire`;
    return `cuerda ${stringNumber}, traste ${shape.baseFret + fret - 1}, dedo ${shape.fingers[index]}`;
  }).join("; ");

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Diagrama de ${shape.chord}: ${description}`}
      style={[styles.root, { width: size, height: size }]}
    >
      {shape.frets.map((fret, index) => (
        <Text
          key={`marker:${index}`}
          style={[
            styles.stringMarker,
            {
              left: stringX(index) - markerSize / 2,
              top: gridTop - markerSize - 5,
              width: markerSize,
              height: markerSize,
              lineHeight: markerSize,
            },
          ]}
        >
          {fret < 0 ? "×" : fret === 0 ? "○" : ""}
        </Text>
      ))}

      {Array.from({ length: 6 }, (_, index) => (
        <View
          key={`string:${index}`}
          style={[
            styles.string,
            { left: stringX(index), top: gridTop, height: gridHeight },
          ]}
        />
      ))}
      {Array.from({ length: FRET_COUNT + 1 }, (_, index) => (
        <View
          key={`fret:${index}`}
          style={[
            styles.fret,
            index === 0 && shape.baseFret === 1 && styles.nut,
            {
              left: gridLeft,
              top: gridTop + index * fretGap,
              width: gridWidth,
            },
          ]}
        />
      ))}

      {shape.baseFret > 1 ? (
        <Text style={[styles.baseFret, { left: 2, top: gridTop + fretGap * 0.22 }]}>
          {shape.baseFret}º
        </Text>
      ) : null}

      {shape.barres.map((barre) => {
        const fromX = stringX(6 - barre.fromString);
        const toX = stringX(6 - barre.toString);
        const left = Math.min(fromX, toX) - fingerSize / 2;
        const width = Math.abs(fromX - toX) + fingerSize;
        const top = gridTop + (barre.fret - 0.5) * fretGap - fingerSize / 2;
        return (
          <View
            key={`barre:${barre.fret}:${barre.fromString}:${barre.toString}`}
            style={[styles.barre, { left, top, width, height: fingerSize, borderRadius: fingerSize / 2 }]}
          >
            <Text style={styles.fingerText}>{barre.finger}</Text>
          </View>
        );
      })}

      {shape.frets.map((fret, index) => {
        const finger = shape.fingers[index];
        if (fret <= 0 || isCoveredByBarre(index, fret, finger)) return null;
        return (
          <View
            key={`finger:${index}`}
            style={[
              styles.finger,
              {
                width: fingerSize,
                height: fingerSize,
                borderRadius: fingerSize / 2,
                left: stringX(index) - fingerSize / 2,
                top: gridTop + (fret - 0.5) * fretGap - fingerSize / 2,
              },
            ]}
          >
            <Text style={styles.fingerText}>{finger}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: "relative", alignSelf: "center" },
  string: { position: "absolute", width: StyleSheet.hairlineWidth * 2, backgroundColor: colors.muted },
  fret: { position: "absolute", height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.muted },
  nut: { height: 5, backgroundColor: colors.text, borderRadius: 3 },
  stringMarker: { position: "absolute", color: colors.text, textAlign: "center", fontSize: 20, fontWeight: "800" },
  baseFret: { position: "absolute", color: colors.muted, fontSize: 13, fontWeight: "800" },
  finger: { position: "absolute", alignItems: "center", justifyContent: "center", backgroundColor: colors.greenPressed, borderWidth: 2, borderColor: colors.background },
  barre: { position: "absolute", alignItems: "center", justifyContent: "center", backgroundColor: colors.greenPressed, borderWidth: 2, borderColor: colors.background },
  fingerText: { color: colors.background, fontSize: 13, fontWeight: "900" },
});
