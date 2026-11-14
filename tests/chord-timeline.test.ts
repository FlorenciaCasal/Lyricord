import assert from "node:assert/strict";
import test from "node:test";
import { ChordTimelineAdvanceMachine } from "../mobile/src/music/chordTimelineAdvance.ts";
import { deriveChordLineMetadata, deriveChordTimeline, findNextDetectableEvent, getDetectableStats, getPlayableTimeline } from "../mobile/src/music/chordTimeline.ts";

test("deriva timeline simple preservando lineIndex", () => {
  const timeline = deriveChordTimeline("      G              D\nNo queda nadie en la ciudad\n      Em             C\ny yo sigo esperando por ti");

  assert.deepEqual(timeline.map((event) => event.chord), ["G", "D", "Em", "C"]);
  assert.deepEqual(timeline.map((event) => event.lineIndex), [0, 0, 2, 2]);
});

test("ordena multiples acordes por linea de izquierda a derecha", () => {
  const timeline = deriveChordTimeline("G     D     Em     C\nUna letra cualquiera");

  assert.deepEqual(timeline.map((event) => event.chord), ["G", "D", "Em", "C"]);
  assert.ok(timeline[0].charIndex < timeline[1].charIndex);
  assert.ok(timeline[1].charIndex < timeline[2].charIndex);
  assert.ok(timeline[2].charIndex < timeline[3].charIndex);
});

test("ignora lineas sin acordes", () => {
  const timeline = deriveChordTimeline("No queda nadie en la ciudad\npero hay una C dentro de una palabra");

  assert.deepEqual(timeline, []);
});

test("detecta acordes con sostenidos, bemoles, menores, septimas y slash", () => {
  const timeline = deriveChordTimeline("F#   Bb   Am7   D/F#   Gsus4");

  assert.deepEqual(timeline.map((event) => event.chord), ["F#", "Bb", "Am7", "D/F#", "Gsus4"]);
});

test("detecta cifrado latino como acordes de primera clase preservando texto original", () => {
  const timeline = deriveChordTimeline(`FA        DO       REm
Ha llegado tu recuerdo

SIb          SOLm      LA7
Solo quiero verte`);

  assert.deepEqual(timeline.map((event) => event.chord), ["FA", "DO", "REm", "SIb", "SOLm", "LA7"]);
  assert.deepEqual(timeline.map((event) => event.normalizedChord), ["FA", "DO", "REm", "SIb", "SOLm", "LA7"]);
  assert.deepEqual(timeline.map((event) => event.supportedChord), ["F", "C", "Dm", "A#", "Gm", "A7"]);
  assert.deepEqual(timeline.map((event) => event.matchChords), [["F"], ["C"], ["Dm"], ["A#"], ["Gm"], ["A7", "A"]]);
});

test("detecta variantes latinas con sostenidos, bemoles, menores, septimas, extensiones y slash", () => {
  const timeline = deriveChordTimeline("DO#   DO#m   FA#m   SIb   SIbm   SOL7   DOmaj7   SOL/SI   RE/FA#");

  assert.deepEqual(timeline.map((event) => event.chord), ["DO#", "DO#m", "FA#m", "SIb", "SIbm", "SOL7", "DOmaj7", "SOL/SI", "RE/FA#"]);
  assert.deepEqual(timeline.map((event) => event.normalizedChord), ["DO#", "DO#m", "FA#m", "SIb", "SIbm", "SOL7", "DOmaj7", "SOL/SI", "RE/FA#"]);
  assert.deepEqual(timeline.map((event) => event.supportedChord), ["C#", "C#m", "F#m", "A#", "A#m", "G7", "Cmaj7", "G", "D"]);
  assert.deepEqual(timeline[8].matchChords, ["D"]);
});

test("normaliza acordes escritos con espacios internos sin alterar el original", () => {
  const variants = [
    ["C#m", "C#m"],
    ["C# m", "C#m"],
    ["C #m", "C#m"],
    ["C # m", "C#m"],
    ["Dbm", "Dbm"],
    ["Db m", "Dbm"],
    ["Dbm7", "Dbm7"],
    ["F#", "F#"],
    ["F #", "F#"],
    ["F#m", "F#m"],
    ["F # m", "F#m"],
    ["Bb", "Bb"],
    ["B b", "Bb"],
    ["Bbm", "Bbm"],
    ["B b m", "Bbm"],
    ["A", "A"],
    ["Am", "Am"],
    ["B", "B"],
    ["Bm", "Bm"],
    ["C", "C"],
    ["D", "D"],
    ["E", "E"],
    ["F", "F"],
    ["G", "G"],
    ["C#m7", "C#m7"],
    ["C # m7", "C#m7"],
    ["C#sus4", "C#sus4"],
    ["C # sus4", "C#sus4"],
    ["C#/E#", "C#/E#"],
    ["C # m / E", "C#m/E"],
  ] as const;

  for (const [written, normalized] of variants) {
    const timeline = deriveChordTimeline(written);
    assert.equal(timeline.length, 1, written);
    assert.equal(timeline[0].originalChord, written);
    assert.equal(timeline[0].chord, written);
    assert.equal(timeline[0].normalizedChord, normalized);
    assert.equal(timeline[0].charStart, 0);
    assert.equal(timeline[0].charEnd, written.length);
  }
});

test("Cae el sol no empieza en B cuando C#m esta escrito como C # m", () => {
  const content = `Intro : C # m A E E

C # m     A     E
Cae el sol en tu balcón

C # m     A     E
Y el ritual se terminó

B          C # m`;
  const timeline = deriveChordTimeline(content);

  assert.deepEqual(timeline.map((event) => event.originalChord), ["C # m", "A", "E", "E", "C # m", "A", "E", "C # m", "A", "E", "B", "C # m"]);
  assert.deepEqual(timeline.map((event) => event.normalizedChord), ["C#m", "A", "E", "E", "C#m", "A", "E", "C#m", "A", "E", "B", "C#m"]);
  assert.equal(timeline[0].normalizedChord, "C#m");
  assert.equal(timeline[0].lineIndex, 0);
  assert.equal(timeline[0].charStart, "Intro : ".length);
  assert.equal(timeline[0].charEnd, "Intro : C # m".length);
  assert.equal(timeline.find((event) => event.normalizedChord === "B")?.lineIndex, 8);
});

test("timeline reconoce B# como acorde, con calidad y como bajo", () => {
  const timeline = deriveChordTimeline("B# B#m B#7 F/B#");

  assert.deepEqual(
    timeline.map((event) => event.normalizedChord),
    ["B#", "B#m", "B#7", "F/B#"],
  );
  assert.ok(timeline.every((event) => event.supportedChord !== null));
});

test("reconoce marcadores explicitos de pausa sin convertirlos en acordes", () => {
  const timeline = deriveChordTimeline(`B      ( silencio )
Sigo aquí esperando por ti

C # m        A        E`);

  assert.deepEqual(timeline.map((event) => event.normalizedChord), ["B", "C#m", "A", "E"]);
  assert.equal(timeline[0].originalChord, "B");
  assert.equal(timeline[0].boundaryAfter, "silencio");
  assert.equal(timeline[1].boundaryAfter, null);
});

test("anotaciones como cual intro no son boundaries ni descartan acordes", () => {
  const metadata = deriveChordLineMetadata("B   C # m   A   E ( cual intro )");

  assert.deepEqual(metadata.chordEvents.map((event) => event.normalizedChord), ["B", "C#m", "A", "E"]);
  assert.deepEqual(metadata.annotations, ["cual intro"]);
  assert.deepEqual(metadata.sectionMarkers, []);
  assert.deepEqual(metadata.boundaries, []);
  assert.deepEqual(metadata.chordEvents.map((event) => event.boundaryAfter), [null, null, null, null]);
});

test("anotaciones de tiempo no son boundaries ni parsean acordes internos", () => {
  const metadata = deriveChordLineMetadata("E ( en segundo tiempo de E )");

  assert.deepEqual(metadata.chordEvents.map((event) => event.normalizedChord), ["E"]);
  assert.deepEqual(metadata.annotations, ["en segundo tiempo de e"]);
  assert.deepEqual(metadata.sectionMarkers, []);
  assert.deepEqual(metadata.boundaries, []);
  assert.equal(metadata.chordEvents[0].boundaryAfter, null);
});

test("silencio explicito es hard boundary", () => {
  const metadata = deriveChordLineMetadata("B ( silencio )");

  assert.deepEqual(metadata.chordEvents.map((event) => event.normalizedChord), ["B"]);
  assert.deepEqual(metadata.annotations, ["silencio"]);
  assert.deepEqual(metadata.sectionMarkers, []);
  assert.deepEqual(metadata.boundaries, ["silencio"]);
  assert.equal(metadata.chordEvents[0].boundaryAfter, "silencio");
});

test("section markers no son hard pause por defecto", () => {
  assert.deepEqual(deriveChordLineMetadata("Intro").sectionMarkers, ["intro"]);
  assert.deepEqual(deriveChordLineMetadata("Intro").boundaries, []);
  assert.deepEqual(deriveChordLineMetadata("Interludio").sectionMarkers, ["interludio"]);
  assert.deepEqual(deriveChordLineMetadata("Interludio").boundaries, []);

  const introWithChords = deriveChordLineMetadata("Intro: C # m A E");
  assert.deepEqual(introWithChords.sectionMarkers, ["intro"]);
  assert.deepEqual(introWithChords.boundaries, []);
  assert.deepEqual(introWithChords.chordEvents.map((event) => event.normalizedChord), ["C#m", "A", "E"]);
});

test("section markers entre corchetes pueden preceder acordes en la misma linea", () => {
  const metadata = deriveChordLineMetadata("[Intro] Em C D B7");

  assert.deepEqual(metadata.sectionMarkers, ["intro"]);
  assert.deepEqual(metadata.boundaries, []);
  assert.deepEqual(metadata.chordEvents.map((event) => event.chord), ["Em", "C", "D", "B7"]);
  assert.deepEqual(metadata.chordEvents.map((event) => event.normalizedChord), ["Em", "C", "D", "B7"]);
  assert.equal(metadata.chordEvents[0].charStart, "[Intro] ".length);
  assert.equal(metadata.lyricText, null);
});

test("section markers aceptan cifrado latino en la misma linea", () => {
  const bracket = deriveChordLineMetadata("[Intro] REm SIb DO LA7");
  const label = deriveChordLineMetadata("Intro: REm SIb DO LA7");
  const verse = deriveChordLineMetadata("[Verso] FA DO REm");

  assert.deepEqual(bracket.sectionMarkers, ["intro"]);
  assert.deepEqual(bracket.chordEvents.map((event) => event.chord), ["REm", "SIb", "DO", "LA7"]);
  assert.deepEqual(bracket.chordEvents.map((event) => event.supportedChord), ["Dm", "A#", "C", "A7"]);
  assert.deepEqual(label.sectionMarkers, ["intro"]);
  assert.deepEqual(label.chordEvents.map((event) => event.chord), ["REm", "SIb", "DO", "LA7"]);
  assert.deepEqual(verse.sectionMarkers, ["verso"]);
  assert.deepEqual(verse.chordEvents.map((event) => event.supportedChord), ["F", "C", "Dm"]);
});

test("no inventa alineacion cuando cifrado latino y letra vienen mezclados inline", () => {
  const metadata = deriveChordLineMetadata("FA DO REm Ha llegado tu recuerdo");

  assert.deepEqual(metadata.chordEvents, []);
  assert.equal(metadata.lyricText, "FA DO REm Ha llegado tu recuerdo");
});

test("section marker entre corchetes en linea propia no crea acordes ni letra", () => {
  const metadata = deriveChordLineMetadata("[Intro]");

  assert.deepEqual(metadata.sectionMarkers, ["intro"]);
  assert.deepEqual(metadata.chordEvents, []);
  assert.equal(metadata.lyricText, null);
});

test("section markers habituales en ingles y espanol aceptan acordes en la misma linea", () => {
  const verse = deriveChordLineMetadata("[Verse] G D Em C");
  const chorus = deriveChordLineMetadata("[Chorus] C G Am F");
  const bridge = deriveChordLineMetadata("[Bridge] F G C");
  const estribillo = deriveChordLineMetadata("[Estribillo] C G Am F");

  assert.deepEqual(verse.sectionMarkers, ["verse"]);
  assert.deepEqual(verse.chordEvents.map((event) => event.normalizedChord), ["G", "D", "Em", "C"]);
  assert.deepEqual(chorus.sectionMarkers, ["chorus"]);
  assert.deepEqual(chorus.chordEvents.map((event) => event.normalizedChord), ["C", "G", "Am", "F"]);
  assert.deepEqual(bridge.sectionMarkers, ["bridge"]);
  assert.deepEqual(bridge.chordEvents.map((event) => event.normalizedChord), ["F", "G", "C"]);
  assert.deepEqual(estribillo.sectionMarkers, ["estribillo"]);
  assert.deepEqual(estribillo.chordEvents.map((event) => event.normalizedChord), ["C", "G", "Am", "F"]);
});

test("no interpreta chordpro inline como section marker", () => {
  const metadata = deriveChordLineMetadata("[C]Let it be");

  assert.deepEqual(metadata.sectionMarkers, []);
  assert.deepEqual(metadata.chordEvents, []);
  assert.equal(metadata.lyricText, "[C]Let it be");
});

test("pausa en linea propia marca el acorde anterior y letras normales no son boundary", () => {
  const timeline = deriveChordTimeline(`B
Sigo aquí esperando por ti
(pausa)
C # m        A`);

  assert.deepEqual(timeline.map((event) => event.normalizedChord), ["B", "C#m", "A"]);
  assert.equal(timeline[0].boundaryAfter, "pausa");
  assert.equal(timeline[1].boundaryAfter, null);
});

test("mantiene orden vertical antes que horizontal", () => {
  const timeline = deriveChordTimeline("Em    C\nG     D");

  assert.deepEqual(timeline.map((event) => event.chord), ["Em", "C", "G", "D"]);
  assert.deepEqual(timeline.map((event) => event.lineIndex), [0, 0, 1, 1]);
});

test("deriva acordes repetidos", () => {
  const timeline = deriveChordTimeline("G   G   D");

  assert.deepEqual(timeline.map((event) => event.chord), ["G", "G", "D"]);
});

test("mapea acordes a lineIndex para scroll", () => {
  const timeline = deriveChordTimeline("G\nletra\nD\notra letra");

  assert.deepEqual(
    timeline.map((event) => ({ chord: event.chord, lineIndex: event.lineIndex })),
    [
      { chord: "G", lineIndex: 0 },
      { chord: "D", lineIndex: 2 },
    ],
  );
});

test("filtra eventos reproducibles por el detector actual", () => {
  const timeline = deriveChordTimeline("G   Am7   D/F#   D   Em   C");
  const playable = getPlayableTimeline(timeline);

  assert.deepEqual(playable.map((event) => event.chord), ["G", "Am7", "D/F#", "D", "Em", "C"]);
  assert.deepEqual(playable.map((event) => event.supportedChord), ["G", "Am7", "D", "D", "Em", "C"]);
  assert.deepEqual(playable.map((event) => event.matchChords), [["G"], ["Am7", "Am"], ["D"], ["D"], ["Em"], ["C"]]);
});

test("lookahead no salta arbitrariamente mas alla de una ventana pequena", () => {
  const timeline = deriveChordTimeline("G   A11   D");

  assert.equal(findNextDetectableEvent(timeline, 0, { maxLookaheadEvents: 1 }), null);
});

test("lookahead encuentra el siguiente checkpoint detectable sin cortar el timeline", () => {
  const timeline = deriveChordTimeline("G   D   G   A11   E   C   Am   D");
  const next = findNextDetectableEvent(timeline, 2, { maxLookaheadEvents: 4 });

  assert.deepEqual(timeline.map((event) => event.chord), ["G", "D", "G", "A11", "E", "C", "Am", "D"]);
  assert.equal(next?.event.chord, "E");
  assert.equal(next?.index, 4);
  assert.equal(next?.skippedEvents, 1);
});

test("machine no produce next null prematuramente con un acorde no soportado intermedio", () => {
  const timeline = deriveChordTimeline("G   D   G   A11   E   C   Am   D");
  const machine = new ChordTimelineAdvanceMachine(timeline, { minConfidence: 0.6, stableFrames: 2, cooldownMs: 500 });

  for (let i = 0; i < 2; i += 1) machine.process({ candidate: "G", confidence: 0.8, nowMs: i * 100 });
  for (let i = 0; i < 2; i += 1) machine.process({ candidate: "D", confidence: 0.8, nowMs: 800 + i * 100 });
  for (let i = 0; i < 2; i += 1) machine.process({ candidate: "G", confidence: 0.8, nowMs: 1600 + i * 100 });
  const output = machine.process({ candidate: "G", confidence: 0.8, nowMs: 1800 });

  assert.equal(output.index, 2);
  assert.equal(output.currentEvent.chord, "G");
  assert.equal(output.nextEvent?.chord, "A11");
  assert.equal(output.nextDetectable?.event.chord, "E");
  assert.deepEqual(machine.getExpectedCandidates(), ["G", "E", "C", "Am"]);
});

test("machine puede avanzar a E saltando A11 de forma controlada", () => {
  const timeline = deriveChordTimeline("G   D   G   A11   E   C   Am   D");
  const machine = new ChordTimelineAdvanceMachine(timeline, { minConfidence: 0.6, stableFrames: 2, cooldownMs: 500 });

  for (let i = 0; i < 2; i += 1) machine.process({ candidate: "G", confidence: 0.8, nowMs: i * 100 });
  for (let i = 0; i < 2; i += 1) machine.process({ candidate: "D", confidence: 0.8, nowMs: 800 + i * 100 });
  for (let i = 0; i < 2; i += 1) machine.process({ candidate: "G", confidence: 0.8, nowMs: 1600 + i * 100 });
  const output = machine.process({ candidate: "E", confidence: 0.8, nowMs: 2400 });
  machine.process({ candidate: "E", confidence: 0.8, nowMs: 2500 });
  const advanced = machine.process({ candidate: "E", confidence: 0.8, nowMs: 2600 });

  assert.equal(output.advanced, false);
  assert.equal(advanced.advanced, true);
  assert.equal(advanced.index, 4);
  assert.equal(advanced.currentEvent.chord, "E");
});

test("machine tolera omitir G7 y avanzar de G a C", () => {
  const timeline = deriveChordTimeline("Am   F   G   G7   C   F");
  const machine = new ChordTimelineAdvanceMachine(timeline, { minConfidence: 0.6, stableFrames: 2, cooldownMs: 500 });

  for (let i = 0; i < 2; i += 1) machine.process({ candidate: "Am", confidence: 0.85, nowMs: i * 100 });
  for (let i = 0; i < 2; i += 1) machine.process({ candidate: "F", confidence: 0.85, nowMs: 800 + i * 100 });
  for (let i = 0; i < 2; i += 1) machine.process({ candidate: "G", confidence: 0.85, nowMs: 1600 + i * 100 });
  for (let i = 0; i < 3; i += 1) machine.process({ candidate: "C", confidence: 0.75, nowMs: 2400 + i * 100 });

  assert.equal(machine.currentIndex, 4);
});

test("machine tolera omitir A7 y avanzar al siguiente F", () => {
  const timeline = deriveChordTimeline("E   Am   A7   F");
  const machine = new ChordTimelineAdvanceMachine(timeline, { minConfidence: 0.6, stableFrames: 2, cooldownMs: 500 });

  for (let i = 0; i < 2; i += 1) machine.process({ candidate: "E", confidence: 0.85, nowMs: i * 100 });
  for (let i = 0; i < 2; i += 1) machine.process({ candidate: "Am", confidence: 0.85, nowMs: 800 + i * 100 });
  for (let i = 0; i < 3; i += 1) machine.process({ candidate: "F", confidence: 0.75, nowMs: 1600 + i * 100 });

  assert.equal(machine.currentIndex, 3);
});

test("machine permite saltar un acorde intermedio soportado con evidencia fuerte", () => {
  const timeline = deriveChordTimeline("G   D   Em   C");
  const machine = new ChordTimelineAdvanceMachine(timeline, { minConfidence: 0.6, stableFrames: 2, cooldownMs: 500 });

  for (let i = 0; i < 2; i += 1) machine.process({ candidate: "G", confidence: 0.85, nowMs: i * 100 });
  for (let i = 0; i < 3; i += 1) machine.process({ candidate: "Em", confidence: 0.75, nowMs: 800 + i * 100 });

  assert.equal(machine.currentIndex, 2);
});

test("machine no salta cinco acordes", () => {
  const timeline = deriveChordTimeline("G   D   Em   C   F   E   Am");
  const machine = new ChordTimelineAdvanceMachine(timeline, { minConfidence: 0.6, stableFrames: 2, cooldownMs: 500, flexibleLookaheadEvents: 4 });

  for (let i = 0; i < 2; i += 1) machine.process({ candidate: "G", confidence: 0.85, nowMs: i * 100 });
  for (let i = 0; i < 4; i += 1) machine.process({ candidate: "Am", confidence: 0.95, nowMs: 800 + i * 100 });

  assert.equal(machine.currentIndex, 0);
  assert.deepEqual(machine.getExpectedCandidates(), ["G", "D", "Em", "C", "F"]);
});

test("salto largo exige mas confianza que el siguiente acorde directo", () => {
  const timeline = deriveChordTimeline("G   D   Em");
  const machine = new ChordTimelineAdvanceMachine(timeline, { minConfidence: 0.6, stableFrames: 2, cooldownMs: 500 });

  for (let i = 0; i < 2; i += 1) machine.process({ candidate: "G", confidence: 0.85, nowMs: i * 100 });
  for (let i = 0; i < 3; i += 1) machine.process({ candidate: "Em", confidence: 0.65, nowMs: 800 + i * 100 });

  assert.equal(machine.currentIndex, 0);
});

test("machine nunca retrocede automaticamente", () => {
  const timeline = deriveChordTimeline("G   D   Em");
  const machine = new ChordTimelineAdvanceMachine(timeline, { minConfidence: 0.6, stableFrames: 2, cooldownMs: 500 });

  for (let i = 0; i < 2; i += 1) machine.process({ candidate: "G", confidence: 0.85, nowMs: i * 100 });
  for (let i = 0; i < 2; i += 1) machine.process({ candidate: "D", confidence: 0.85, nowMs: 800 + i * 100 });
  for (let i = 0; i < 4; i += 1) machine.process({ candidate: "G", confidence: 0.95, nowMs: 1600 + i * 100 });

  assert.equal(machine.currentIndex, 1);
});

test("Me quedo contigo conserva G7 y A7 como eventos detectables con simplificacion", () => {
  const timeline = deriveChordTimeline("Am   F   G   G7   C   F   E   Am   A7   F");
  const stats = getDetectableStats(timeline);

  assert.deepEqual(timeline.map((event) => event.chord), ["Am", "F", "G", "G7", "C", "F", "E", "Am", "A7", "F"]);
  assert.deepEqual(timeline.map((event) => event.supportedChord ?? "-"), ["Am", "F", "G", "G7", "C", "F", "E", "Am", "A7", "F"]);
  assert.deepEqual(timeline.map((event) => event.matchChords), [["Am"], ["F"], ["G"], ["G7", "G"], ["C"], ["F"], ["E"], ["Am"], ["A7", "A"], ["F"]]);
  assert.deepEqual(stats, { total: 10, detectable: 10 });
  assert.equal(findNextDetectableEvent(timeline, 2)?.event.chord, "G7");
  assert.equal(findNextDetectableEvent(timeline, 7)?.event.chord, "A7");
});

test("timeline conserva acordes complejos y normaliza sin borrar slash ni enharmonicos", () => {
  const timeline = deriveChordTimeline("Bb   F   Gm   Eb\nG   D/F#   Em7   Cadd9\nC   Cmaj7   C7   F");

  assert.deepEqual(timeline.map((event) => event.chord), ["Bb", "F", "Gm", "Eb", "G", "D/F#", "Em7", "Cadd9", "C", "Cmaj7", "C7", "F"]);
  assert.deepEqual(timeline.map((event) => event.supportedChord), ["A#", "F", "Gm", "D#", "G", "D", "Em7", "Cadd9", "C", "Cmaj7", "C7", "F"]);
  assert.deepEqual(timeline[5].matchChords, ["D"]);
  assert.deepEqual(timeline[6].matchChords, ["Em7", "Em"]);
  assert.deepEqual(timeline[7].matchChords, ["Cadd9", "C"]);
});

test("machine tolera simplificacion de extensiones sin borrar eventos del timeline", () => {
  const timeline = deriveChordTimeline("G   D/F#   Em7   Cadd9");
  const machine = new ChordTimelineAdvanceMachine(timeline, { minConfidence: 0.6, stableFrames: 2, cooldownMs: 400 });
  let nowMs = 0;

  function play(chord: "G" | "D" | "Em" | "C", confidence = 0.9) {
    machine.process({ candidate: chord, confidence, nowMs });
    nowMs += 120;
    machine.process({ candidate: chord, confidence, nowMs });
    nowMs += 520;
  }

  play("G");
  play("D");
  play("Em");
  play("C");

  assert.equal(machine.currentIndex, 3);
  assert.equal(machine.currentEvent.chord, "Cadd9");
});

test("segunda estrofa con mismos acordes avanza a eventos posteriores", () => {
  const timeline = deriveChordTimeline("Am   F   G   C   F   E\nletra uno\nAm   F   G   C   F   E\nletra dos");
  const machine = new ChordTimelineAdvanceMachine(timeline, { minConfidence: 0.6, stableFrames: 2, cooldownMs: 400 });
  let nowMs = 0;

  function play(chord: "Am" | "F" | "G" | "C" | "E") {
    let output = machine.process({ candidate: chord, confidence: 0.9, nowMs });
    nowMs += 120;
    output = machine.process({ candidate: chord, confidence: 0.9, nowMs });
    nowMs += 520;
    return output;
  }

  for (const chord of ["Am", "F", "G", "C", "F", "E", "Am", "F", "G", "C", "F", "E"] as const) {
    play(chord);
  }

  assert.equal(machine.currentIndex, 11);
  assert.equal(machine.currentEvent.chord, "E");
  assert.equal(machine.currentEvent.lineIndex, 2);
});

test("acordes repetidos no reutilizan indices anteriores", () => {
  const timeline = deriveChordTimeline("G   D\nletra\nG   D\nletra");
  const machine = new ChordTimelineAdvanceMachine(timeline, { minConfidence: 0.6, stableFrames: 2, cooldownMs: 400 });
  let nowMs = 0;

  function play(chord: "G" | "D") {
    machine.process({ candidate: chord, confidence: 0.9, nowMs });
    nowMs += 120;
    machine.process({ candidate: chord, confidence: 0.9, nowMs });
    nowMs += 520;
  }

  play("G");
  play("D");
  play("G");
  play("D");

  assert.equal(machine.currentIndex, 3);
  assert.equal(machine.currentEvent.chord, "D");
  assert.equal(machine.currentEvent.lineIndex, 2);
});

function contentWithChordLines(chordsByLine: Record<number, string>) {
  const maxLine = Math.max(...Object.keys(chordsByLine).map(Number));
  return Array.from({ length: maxLine + 1 }, (_value, index) => chordsByLine[index] ?? `linea ${index}`).join("\n");
}

test("Cae el sol mantiene B detectable y no corta lookahead musical por distancia visual", () => {
  const timeline = deriveChordTimeline(contentWithChordLines({
    15: "B",
    37: "B",
    44: "E",
    49: "E",
    54: "B",
    62: "A    E",
    65: "E",
    69: "B",
  }));
  const machine = new ChordTimelineAdvanceMachine(timeline, { minConfidence: 0.6, stableFrames: 2, cooldownMs: 400 });

  assert.deepEqual(timeline.map((event) => event.chord), ["B", "B", "E", "E", "B", "A", "E", "E", "B"]);
  assert.deepEqual(timeline.map((event) => event.supportedChord ?? "-"), ["B", "B", "E", "E", "B", "A", "E", "E", "B"]);
  assert.deepEqual(timeline.map((event) => event.lineIndex), [15, 37, 44, 49, 54, 62, 62, 65, 69]);
  assert.equal(machine.currentIndex, 0);
  assert.equal(machine.currentEvent.chord, "B");

  const nextFromSecondE = findNextDetectableEvent(timeline, 3);
  assert.equal(nextFromSecondE?.index, 4);
  assert.equal(nextFromSecondE?.event.chord, "B");

  const timelineWithUnsupportedPassingChord = deriveChordTimeline(contentWithChordLines({
    49: "E",
    54: "A11",
    62: "A",
  }));
  assert.deepEqual(timelineWithUnsupportedPassingChord.map((event) => event.chord), ["E", "A11", "A"]);
  assert.deepEqual(timelineWithUnsupportedPassingChord.map((event) => event.supportedChord ?? "-"), ["E", "-", "A"]);
  const nextAcrossManyLines = findNextDetectableEvent(timelineWithUnsupportedPassingChord, 0);
  assert.equal(nextAcrossManyLines?.index, 2);
  assert.equal(nextAcrossManyLines?.event.chord, "A");
});

test("Cae el sol avanza monotonicamente con B y acordes repetidos conservadores", () => {
  const timeline = deriveChordTimeline(contentWithChordLines({
    15: "B",
    37: "B",
    44: "E",
    49: "E",
    54: "B",
    62: "A    E",
    65: "E",
    69: "B",
  }));
  const machine = new ChordTimelineAdvanceMachine(timeline, { minConfidence: 0.6, stableFrames: 2, cooldownMs: 400 });
  let nowMs = 0;

  function confirm(chord: "A" | "B" | "E") {
    machine.process({ candidate: chord, confidence: 0.9, nowMs });
    nowMs += 120;
    return machine.process({ candidate: chord, confidence: 0.9, nowMs });
  }

  function armRepeatOrTransition() {
    nowMs += 520;
    machine.process({ candidate: "unknown", confidence: 0, nowMs });
    nowMs += 120;
  }

  confirm("B");
  assert.equal(machine.currentIndex, 0);

  confirm("B");
  assert.equal(machine.currentIndex, 0, "no avanza al segundo B solo por sostener B");

  armRepeatOrTransition();
  confirm("B");
  assert.equal(machine.currentIndex, 1);

  armRepeatOrTransition();
  confirm("E");
  assert.equal(machine.currentIndex, 2);

  armRepeatOrTransition();
  confirm("E");
  assert.equal(machine.currentIndex, 3);

  armRepeatOrTransition();
  confirm("B");
  assert.equal(machine.currentIndex, 4);

  armRepeatOrTransition();
  confirm("A");
  assert.equal(machine.currentIndex, 5);

  armRepeatOrTransition();
  confirm("E");
  assert.equal(machine.currentIndex, 6);

  armRepeatOrTransition();
  confirm("E");
  assert.equal(machine.currentIndex, 7);

  armRepeatOrTransition();
  confirm("B");
  assert.equal(machine.currentIndex, 8);
  assert.equal(machine.currentEvent.chord, "B");
});
