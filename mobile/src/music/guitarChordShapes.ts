import { getChordPitchClasses, parseChordSymbol, type ChordQuality } from "./chordTheory.ts";

export type GuitarChordBarre = {
  fret: number;
  fromString: number;
  toString: number;
  finger: number;
};

export type GuitarChordShape = {
  id: string;
  chord: string;
  frets: readonly [number, number, number, number, number, number];
  fingers: readonly [number, number, number, number, number, number];
  baseFret: number;
  barres: readonly GuitarChordBarre[];
  source: "chords-db" | "musum";
  review: "source-verified" | "musum-curated" | "musum-verified";
};

export type GuitarChordLookup = {
  requestedChord: string;
  canonicalChord: string | null;
  shapes: readonly GuitarChordShape[];
};

const QUALITY_SUFFIX: Record<ChordQuality, string> = {
  major: "",
  minor: "m",
  dominant7: "7",
  major7: "maj7",
  minor7: "m7",
  sus2: "sus2",
  sus4: "sus4",
  diminished: "dim",
  augmented: "aug",
  add9: "add9",
  minor7Flat5: "m7b5",
  six: "6",
  minorSix: "m6",
  nine: "9",
};

const STANDARD_TUNING_PITCH_CLASSES = [4, 9, 2, 7, 11, 4] as const;

// Generated from the MIT-licensed chords-db source, then filtered by Musum's
// theoretical and physical consistency checks. See mobile/THIRD_PARTY_NOTICES.md.
export const GUITAR_CHORD_SHAPES: readonly GuitarChordShape[] = [
  { id: "C:primary", chord: "C", frets: [-1,3,2,0,1,0], fingers: [0,3,2,0,1,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Cm:primary", chord: "Cm", frets: [-1,3,1,0,1,3], fingers: [0,3,2,0,1,4], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "C7:primary", chord: "C7", frets: [-1,3,2,3,1,0], fingers: [0,3,2,4,1,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Cmaj7:primary", chord: "Cmaj7", frets: [-1,3,2,0,0,0], fingers: [0,3,2,0,0,0], baseFret: 1, barres: [], source: "musum", review: "musum-curated" },
  { id: "Cm7:primary", chord: "Cm7", frets: [-1,3,1,3,4,-1], fingers: [0,2,1,3,4,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Csus2:primary", chord: "Csus2", frets: [-1,3,0,0,3,3], fingers: [0,1,0,0,2,3], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Csus4:primary", chord: "Csus4", frets: [-1,3,3,0,1,1], fingers: [0,3,4,0,1,1], baseFret: 1, barres: [{"fret":1,"fromString":1,"toString":2,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "Cdim:primary", chord: "Cdim", frets: [-1,3,1,-1,1,2], fingers: [0,4,1,0,2,3], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Caug:primary", chord: "Caug", frets: [-1,3,2,1,1,-1], fingers: [0,3,2,1,1,0], baseFret: 1, barres: [{"fret":1,"fromString":2,"toString":3,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "Cadd9:primary", chord: "Cadd9", frets: [-1,3,0,0,3,0], fingers: [0,1,0,0,3,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Cm7b5:primary", chord: "Cm7b5", frets: [-1,3,4,3,4,-1], fingers: [0,1,3,2,4,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "C6:primary", chord: "C6", frets: [-1,3,2,2,1,0], fingers: [0,4,2,3,1,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Cm6:primary", chord: "Cm6", frets: [-1,3,1,2,1,3], fingers: [0,3,1,2,1,4], baseFret: 1, barres: [{"fret":1,"fromString":2,"toString":4,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "C9:primary", chord: "C9", frets: [-1,3,2,3,3,3], fingers: [0,2,1,3,3,3], baseFret: 1, barres: [{"fret":3,"fromString":1,"toString":3,"finger":3}], source: "musum", review: "musum-curated" },
  { id: "C#:primary", chord: "C#", frets: [-1,4,3,1,2,1], fingers: [0,4,3,1,2,1], baseFret: 1, barres: [{"fret":1,"fromString":1,"toString":3,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "C#m:primary", chord: "C#m", frets: [-1,4,2,1,2,-1], fingers: [0,4,2,1,3,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "C#7:primary", chord: "C#7", frets: [-1,4,3,4,2,-1], fingers: [0,3,2,4,1,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "C#maj7:primary", chord: "C#maj7", frets: [-1,4,3,1,1,1], fingers: [0,4,3,1,1,1], baseFret: 1, barres: [{"fret":1,"fromString":1,"toString":3,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "C#m7:primary", chord: "C#m7", frets: [-1,1,3,1,2,1], fingers: [0,1,3,1,2,1], baseFret: 4, barres: [{"fret":1,"fromString":1,"toString":5,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "C#sus2:primary", chord: "C#sus2", frets: [1,1,3,3,1,1], fingers: [1,1,3,4,1,1], baseFret: 4, barres: [{"fret":1,"fromString":1,"toString":6,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "C#sus4:primary", chord: "C#sus4", frets: [-1,4,4,1,2,-1], fingers: [0,3,4,1,2,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "C#dim:primary", chord: "C#dim", frets: [-1,4,2,-1,2,3], fingers: [0,4,1,0,2,3], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "C#aug:primary", chord: "C#aug", frets: [-1,4,3,2,2,-1], fingers: [0,4,3,1,2,0], baseFret: 1, barres: [], source: "musum", review: "musum-curated" },
  { id: "C#add9:primary", chord: "C#add9", frets: [-1,4,3,-1,4,4], fingers: [0,2,1,0,3,4], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "C#m7b5:primary", chord: "C#m7b5", frets: [-1,1,2,1,2,-1], fingers: [0,1,3,2,4,0], baseFret: 4, barres: [], source: "chords-db", review: "source-verified" },
  { id: "C#6:primary", chord: "C#6", frets: [-1,4,3,3,2,-1], fingers: [0,4,2,3,1,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "C#m6:primary", chord: "C#m6", frets: [-1,4,2,3,2,4], fingers: [0,3,1,2,1,4], baseFret: 1, barres: [{"fret":2,"fromString":2,"toString":4,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "C#9:primary", chord: "C#9", frets: [-1,4,3,4,4,4], fingers: [0,2,1,3,3,3], baseFret: 1, barres: [{"fret":4,"fromString":1,"toString":3,"finger":3}], source: "musum", review: "musum-curated" },
  { id: "D:primary", chord: "D", frets: [-1,-1,0,2,3,2], fingers: [0,0,0,1,3,2], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Dm:primary", chord: "Dm", frets: [-1,-1,0,2,3,1], fingers: [0,0,0,2,3,1], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "D7:primary", chord: "D7", frets: [-1,-1,0,2,1,2], fingers: [0,0,0,2,1,3], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Dmaj7:primary", chord: "Dmaj7", frets: [-1,-1,0,2,2,2], fingers: [0,0,0,1,1,1], baseFret: 1, barres: [{"fret":2,"fromString":1,"toString":3,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "Dm7:primary", chord: "Dm7", frets: [-1,-1,0,2,1,1], fingers: [0,0,0,2,1,1], baseFret: 1, barres: [{"fret":1,"fromString":1,"toString":2,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "Dsus2:primary", chord: "Dsus2", frets: [-1,-1,0,2,3,0], fingers: [0,0,0,2,3,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Dsus4:primary", chord: "Dsus4", frets: [-1,-1,0,2,3,3], fingers: [0,0,0,1,2,3], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Ddim:primary", chord: "Ddim", frets: [-1,-1,0,1,-1,1], fingers: [0,0,0,1,0,2], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Daug:primary", chord: "Daug", frets: [-1,-1,0,3,3,2], fingers: [0,0,0,2,3,1], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Dadd9:primary", chord: "Dadd9", frets: [-1,4,3,1,4,1], fingers: [0,3,2,1,4,1], baseFret: 2, barres: [{"fret":1,"fromString":1,"toString":3,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "Dm7b5:primary", chord: "Dm7b5", frets: [-1,-1,0,1,1,1], fingers: [0,0,0,1,1,1], baseFret: 1, barres: [{"fret":1,"fromString":1,"toString":3,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "D6:primary", chord: "D6", frets: [-1,-1,0,2,0,2], fingers: [0,0,0,2,0,3], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Dm6:primary", chord: "Dm6", frets: [-1,-1,0,2,0,1], fingers: [0,0,0,2,0,1], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "D9:primary", chord: "D9", frets: [-1,5,4,5,5,5], fingers: [0,2,1,3,3,3], baseFret: 1, barres: [{"fret":5,"fromString":1,"toString":3,"finger":3}], source: "musum", review: "musum-curated" },
  { id: "D#:primary", chord: "D#", frets: [-1,-1,1,3,4,3], fingers: [0,0,1,2,4,3], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "D#m:primary", chord: "D#m", frets: [-1,-1,1,3,4,2], fingers: [0,0,1,3,4,2], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "D#7:primary", chord: "D#7", frets: [-1,-1,1,3,2,3], fingers: [0,0,1,3,2,4], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "D#maj7:primary", chord: "D#maj7", frets: [-1,4,3,1,1,1], fingers: [0,4,3,1,1,1], baseFret: 3, barres: [{"fret":1,"fromString":1,"toString":3,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "D#m7:primary", chord: "D#m7", frets: [-1,-1,1,3,2,2], fingers: [0,0,1,4,2,3], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "D#sus2:primary", chord: "D#sus2", frets: [-1,1,3,3,1,1], fingers: [0,1,3,4,1,1], baseFret: 6, barres: [{"fret":1,"fromString":1,"toString":5,"finger":1}], source: "chords-db", review: "musum-curated" },
  { id: "D#sus4:primary", chord: "D#sus4", frets: [-1,-1,1,3,4,4], fingers: [0,0,1,2,3,4], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "D#dim:primary", chord: "D#dim", frets: [-1,-1,1,2,-1,2], fingers: [0,0,1,2,0,3], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "D#aug:primary", chord: "D#aug", frets: [-1,3,2,1,1,-1], fingers: [0,3,2,1,1,0], baseFret: 4, barres: [{"fret":1,"fromString":2,"toString":3,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "D#add9:primary", chord: "D#add9", frets: [-1,4,3,1,4,1], fingers: [0,3,2,1,4,1], baseFret: 3, barres: [{"fret":1,"fromString":1,"toString":3,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "D#m7b5:primary", chord: "D#m7b5", frets: [-1,-1,1,2,2,2], fingers: [0,0,1,2,2,2], baseFret: 1, barres: [{"fret":2,"fromString":1,"toString":3,"finger":2}], source: "chords-db", review: "source-verified" },
  { id: "D#6:primary", chord: "D#6", frets: [-1,-1,1,3,1,3], fingers: [0,0,1,3,1,4], baseFret: 1, barres: [{"fret":1,"fromString":2,"toString":4,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "D#m6:primary", chord: "D#m6", frets: [-1,3,1,2,1,3], fingers: [0,3,1,2,1,4], baseFret: 4, barres: [{"fret":1,"fromString":2,"toString":4,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "D#9:primary", chord: "D#9", frets: [-1,-1,1,0,2,1], fingers: [0,0,1,0,3,2], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "E:primary", chord: "E", frets: [0,2,2,1,0,0], fingers: [0,2,3,1,0,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Em:primary", chord: "Em", frets: [0,2,2,0,0,0], fingers: [0,2,3,0,0,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "E7:primary", chord: "E7", frets: [0,2,0,1,0,0], fingers: [0,2,0,1,0,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Emaj7:primary", chord: "Emaj7", frets: [0,2,1,1,0,0], fingers: [0,3,1,2,0,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Em7:primary", chord: "Em7", frets: [0,2,0,0,0,0], fingers: [0,2,0,0,0,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Esus2:primary", chord: "Esus2", frets: [0,2,4,4,0,0], fingers: [0,1,3,4,0,0], baseFret: 1, barres: [], source: "musum", review: "musum-curated" },
  { id: "Esus4:primary", chord: "Esus4", frets: [0,2,2,2,0,0], fingers: [0,2,3,4,0,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Edim:primary", chord: "Edim", frets: [-1,-1,2,3,-1,3], fingers: [0,0,1,2,0,3], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Eaug:primary", chord: "Eaug", frets: [0,3,2,1,1,0], fingers: [0,4,3,1,2,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Eadd9:primary", chord: "Eadd9", frets: [0,2,2,1,0,2], fingers: [0,2,3,1,0,4], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Em7b5:primary", chord: "Em7b5", frets: [0,1,2,3,3,3], fingers: [0,1,2,3,3,3], baseFret: 1, barres: [{"fret":3,"fromString":1,"toString":3,"finger":3}], source: "chords-db", review: "source-verified" },
  { id: "E6:primary", chord: "E6", frets: [0,2,2,1,2,0], fingers: [0,2,3,1,4,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Em6:primary", chord: "Em6", frets: [0,2,2,0,2,0], fingers: [0,1,2,0,3,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "E9:primary", chord: "E9", frets: [0,2,0,1,0,2], fingers: [0,2,0,1,0,3], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "F:primary", chord: "F", frets: [1,3,3,2,1,1], fingers: [1,3,4,2,1,1], baseFret: 1, barres: [{"fret":1,"fromString":1,"toString":6,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "Fm:primary", chord: "Fm", frets: [1,3,3,1,1,1], fingers: [1,3,4,1,1,1], baseFret: 1, barres: [{"fret":1,"fromString":1,"toString":6,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "F7:primary", chord: "F7", frets: [1,3,1,2,1,1], fingers: [1,3,1,2,1,1], baseFret: 1, barres: [{"fret":1,"fromString":1,"toString":6,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "Fmaj7:primary", chord: "Fmaj7", frets: [-1,-1,3,2,1,0], fingers: [0,0,3,2,1,0], baseFret: 1, barres: [], source: "chords-db", review: "musum-curated" },
  { id: "Fm7:primary", chord: "Fm7", frets: [1,3,1,1,1,1], fingers: [1,3,1,1,1,1], baseFret: 1, barres: [{"fret":1,"fromString":1,"toString":6,"finger":1}], source: "chords-db", review: "musum-curated" },
  { id: "Fsus2:primary", chord: "Fsus2", frets: [-1,-1,3,0,1,1], fingers: [0,0,3,0,1,1], baseFret: 1, barres: [{"fret":1,"fromString":1,"toString":2,"finger":1}], source: "musum", review: "musum-curated" },
  { id: "Fsus4:primary", chord: "Fsus4", frets: [1,3,3,3,1,1], fingers: [1,2,3,4,1,1], baseFret: 1, barres: [{"fret":1,"fromString":1,"toString":6,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "Fdim:primary", chord: "Fdim", frets: [-1,-1,3,4,-1,4], fingers: [0,0,1,2,0,3], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Faug:primary", chord: "Faug", frets: [-1,-1,3,2,2,1], fingers: [0,0,4,2,3,1], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Fadd9:primary", chord: "Fadd9", frets: [-1,-1,3,2,1,3], fingers: [0,0,3,2,1,4], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Fm7b5:primary", chord: "Fm7b5", frets: [1,-1,1,1,0,-1], fingers: [1,0,2,3,0,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "F6:primary", chord: "F6", frets: [-1,-1,3,2,3,1], fingers: [0,0,3,2,4,1], baseFret: 1, barres: [], source: "musum", review: "musum-curated" },
  { id: "Fm6:primary", chord: "Fm6", frets: [1,-1,0,1,1,1], fingers: [1,0,0,2,3,4], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "F9:primary", chord: "F9", frets: [1,3,1,2,1,3], fingers: [1,3,1,2,1,4], baseFret: 1, barres: [{"fret":1,"fromString":2,"toString":6,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "F#:primary", chord: "F#", frets: [2,4,4,3,2,2], fingers: [1,3,4,2,1,1], baseFret: 1, barres: [{"fret":2,"fromString":1,"toString":6,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "F#m:primary", chord: "F#m", frets: [2,4,4,2,2,2], fingers: [1,3,4,1,1,1], baseFret: 1, barres: [{"fret":2,"fromString":1,"toString":6,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "F#7:primary", chord: "F#7", frets: [2,4,2,3,2,2], fingers: [1,3,1,2,1,1], baseFret: 1, barres: [{"fret":2,"fromString":1,"toString":6,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "F#maj7:primary", chord: "F#maj7", frets: [2,4,3,3,2,2], fingers: [1,4,2,3,1,1], baseFret: 1, barres: [{"fret":2,"fromString":1,"toString":6,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "F#m7:primary", chord: "F#m7", frets: [2,4,2,2,2,2], fingers: [1,3,1,1,1,1], baseFret: 1, barres: [{"fret":2,"fromString":1,"toString":6,"finger":1}], source: "chords-db", review: "musum-curated" },
  { id: "F#sus2:primary", chord: "F#sus2", frets: [2,-1,-1,1,2,2], fingers: [2,0,0,1,3,4], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "F#sus4:primary", chord: "F#sus4", frets: [2,4,4,4,2,2], fingers: [1,2,3,4,1,1], baseFret: 1, barres: [{"fret":2,"fromString":1,"toString":6,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "F#dim:primary", chord: "F#dim", frets: [2,0,-1,2,1,-1], fingers: [2,0,0,3,1,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "F#aug:primary", chord: "F#aug", frets: [-1,-1,4,3,3,-1], fingers: [0,0,2,1,1,0], baseFret: 1, barres: [{"fret":3,"fromString":2,"toString":3,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "F#add9:primary", chord: "F#add9", frets: [-1,-1,4,3,2,4], fingers: [0,0,3,2,1,4], baseFret: 1, barres: [], source: "chords-db", review: "musum-curated" },
  { id: "F#m7b5:primary", chord: "F#m7b5", frets: [2,0,2,2,1,0], fingers: [2,0,3,4,1,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "F#6:primary", chord: "F#6", frets: [2,-1,1,3,2,-1], fingers: [2,0,1,4,3,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "F#m6:primary", chord: "F#m6", frets: [2,-1,1,2,2,2], fingers: [2,0,1,3,3,4], baseFret: 1, barres: [{"fret":2,"fromString":2,"toString":3,"finger":3}], source: "chords-db", review: "source-verified" },
  { id: "F#9:primary", chord: "F#9", frets: [2,4,2,3,2,4], fingers: [1,3,1,2,1,4], baseFret: 1, barres: [{"fret":2,"fromString":2,"toString":6,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "G:primary", chord: "G", frets: [3,2,0,0,0,3], fingers: [2,1,0,0,0,3], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Gm:primary", chord: "Gm", frets: [3,1,0,0,3,3], fingers: [2,1,0,0,3,4], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "G7:primary", chord: "G7", frets: [3,2,0,0,0,1], fingers: [3,2,0,0,0,1], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Gmaj7:primary", chord: "Gmaj7", frets: [3,2,0,0,0,2], fingers: [3,2,0,0,0,1], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Gm7:primary", chord: "Gm7", frets: [3,-1,3,3,3,-1], fingers: [2,0,3,3,3,0], baseFret: 1, barres: [{"fret":3,"fromString":2,"toString":4,"finger":3}], source: "chords-db", review: "source-verified" },
  { id: "Gsus2:primary", chord: "Gsus2", frets: [3,0,0,0,3,3], fingers: [1,0,0,0,2,3], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Gsus4:primary", chord: "Gsus4", frets: [3,3,0,0,1,3], fingers: [2,3,0,0,1,4], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Gdim:primary", chord: "Gdim", frets: [3,1,-1,3,2,-1], fingers: [3,1,0,4,2,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Gaug:primary", chord: "Gaug", frets: [3,2,1,0,0,-1], fingers: [3,2,1,0,0,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Gadd9:primary", chord: "Gadd9", frets: [3,0,0,2,0,3], fingers: [2,0,0,1,0,3], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Gm7b5:primary", chord: "Gm7b5", frets: [3,-1,3,3,2,-1], fingers: [2,0,3,4,1,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "G6:primary", chord: "G6", frets: [3,2,0,0,0,0], fingers: [2,1,0,0,0,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Gm6:primary", chord: "Gm6", frets: [3,-1,2,3,3,3], fingers: [2,0,1,3,4,4], baseFret: 1, barres: [{"fret":3,"fromString":1,"toString":2,"finger":4}], source: "chords-db", review: "source-verified" },
  { id: "G9:primary", chord: "G9", frets: [3,0,0,0,0,1], fingers: [3,0,0,0,0,1], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "G#:primary", chord: "G#", frets: [4,3,1,1,1,-1], fingers: [3,2,1,1,1,0], baseFret: 1, barres: [{"fret":1,"fromString":2,"toString":4,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "G#m:primary", chord: "G#m", frets: [1,3,3,1,1,1], fingers: [1,3,4,1,1,1], baseFret: 4, barres: [{"fret":1,"fromString":1,"toString":6,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "G#7:primary", chord: "G#7", frets: [1,3,1,2,1,1], fingers: [1,3,1,2,1,1], baseFret: 4, barres: [{"fret":1,"fromString":1,"toString":6,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "G#maj7:primary", chord: "G#maj7", frets: [1,3,2,2,1,1], fingers: [1,4,2,3,1,1], baseFret: 4, barres: [{"fret":1,"fromString":1,"toString":6,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "G#m7:primary", chord: "G#m7", frets: [4,-1,4,4,4,-1], fingers: [2,0,3,3,3,0], baseFret: 1, barres: [{"fret":4,"fromString":2,"toString":4,"finger":3}], source: "chords-db", review: "source-verified" },
  { id: "G#sus2:primary", chord: "G#sus2", frets: [4,-1,-1,3,4,4], fingers: [2,0,0,1,3,4], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "G#sus4:primary", chord: "G#sus4", frets: [1,3,3,3,1,1], fingers: [1,2,3,4,1,1], baseFret: 4, barres: [{"fret":1,"fromString":1,"toString":6,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "G#dim:primary", chord: "G#dim", frets: [4,2,-1,4,3,-1], fingers: [3,1,0,4,2,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "G#aug:primary", chord: "G#aug", frets: [4,3,2,1,1,-1], fingers: [4,3,2,1,1,0], baseFret: 1, barres: [{"fret":1,"fromString":2,"toString":3,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "G#add9:primary", chord: "G#add9", frets: [4,3,-1,3,4,-1], fingers: [3,1,0,2,4,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "G#m7b5:primary", chord: "G#m7b5", frets: [4,-1,4,4,3,-1], fingers: [2,0,3,4,1,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "G#6:primary", chord: "G#6", frets: [2,-1,1,3,2,-1], fingers: [2,0,1,4,3,0], baseFret: 3, barres: [], source: "chords-db", review: "source-verified" },
  { id: "G#m6:primary", chord: "G#m6", frets: [4,-1,3,4,4,-1], fingers: [2,0,1,3,4,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "G#9:primary", chord: "G#9", frets: [4,3,4,3,4,-1], fingers: [2,1,3,1,4,0], baseFret: 1, barres: [{"fret":3,"fromString":3,"toString":5,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "A:primary", chord: "A", frets: [-1,0,2,2,2,0], fingers: [0,0,1,2,3,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Am:primary", chord: "Am", frets: [-1,0,2,2,1,0], fingers: [0,0,2,3,1,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "A7:primary", chord: "A7", frets: [-1,0,2,0,2,0], fingers: [0,0,2,0,3,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Amaj7:primary", chord: "Amaj7", frets: [-1,0,2,1,2,0], fingers: [0,0,2,1,3,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Am7:primary", chord: "Am7", frets: [-1,0,2,0,1,0], fingers: [0,0,2,0,1,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Asus2:primary", chord: "Asus2", frets: [-1,0,2,2,0,0], fingers: [0,0,2,3,0,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Asus4:primary", chord: "Asus4", frets: [-1,0,0,-1,3,0], fingers: [0,0,0,0,1,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Adim:primary", chord: "Adim", frets: [-1,0,1,2,1,-1], fingers: [0,0,1,3,2,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Aaug:primary", chord: "Aaug", frets: [-1,0,3,2,2,1], fingers: [0,0,4,2,3,1], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Aadd9:primary", chord: "Aadd9", frets: [-1,0,2,4,2,0], fingers: [0,0,1,3,2,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Am7b5:primary", chord: "Am7b5", frets: [-1,0,1,0,1,-1], fingers: [0,0,2,0,3,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "A6:primary", chord: "A6", frets: [-1,0,2,2,2,2], fingers: [0,0,1,1,1,1], baseFret: 1, barres: [{"fret":2,"fromString":1,"toString":4,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "Am6:primary", chord: "Am6", frets: [-1,0,2,2,1,2], fingers: [0,0,2,3,1,4], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "A9:primary", chord: "A9", frets: [-1,0,2,4,2,3], fingers: [0,0,1,3,1,2], baseFret: 1, barres: [{"fret":2,"fromString":2,"toString":4,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "A#:primary", chord: "A#", frets: [-1,1,3,3,3,1], fingers: [0,1,2,3,4,1], baseFret: 1, barres: [{"fret":1,"fromString":1,"toString":5,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "A#m:primary", chord: "A#m", frets: [-1,1,3,3,2,1], fingers: [0,1,3,4,2,1], baseFret: 1, barres: [{"fret":1,"fromString":1,"toString":5,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "A#7:primary", chord: "A#7", frets: [-1,1,3,1,3,1], fingers: [0,1,3,1,4,1], baseFret: 1, barres: [{"fret":1,"fromString":1,"toString":5,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "A#maj7:primary", chord: "A#maj7", frets: [-1,1,3,2,3,1], fingers: [0,1,3,2,4,1], baseFret: 1, barres: [{"fret":1,"fromString":1,"toString":5,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "A#m7:primary", chord: "A#m7", frets: [-1,1,3,1,2,1], fingers: [0,1,3,1,2,1], baseFret: 1, barres: [{"fret":1,"fromString":1,"toString":5,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "A#sus2:primary", chord: "A#sus2", frets: [-1,1,3,3,1,1], fingers: [0,1,3,4,1,1], baseFret: 1, barres: [{"fret":1,"fromString":1,"toString":5,"finger":1}], source: "musum", review: "musum-curated" },
  { id: "A#sus4:primary", chord: "A#sus4", frets: [-1,1,3,3,4,1], fingers: [0,1,2,3,4,1], baseFret: 1, barres: [{"fret":1,"fromString":1,"toString":5,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "A#dim:primary", chord: "A#dim", frets: [-1,1,2,3,2,-1], fingers: [0,1,2,4,3,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "A#aug:primary", chord: "A#aug", frets: [-1,1,4,3,3,-1], fingers: [0,1,4,2,3,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "A#add9:primary", chord: "A#add9", frets: [-1,1,0,3,1,1], fingers: [0,1,0,4,2,3], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "A#m7b5:primary", chord: "A#m7b5", frets: [-1,1,2,1,2,-1], fingers: [0,1,3,2,4,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "A#6:primary", chord: "A#6", frets: [-1,1,3,3,3,3], fingers: [0,1,3,3,3,3], baseFret: 1, barres: [{"fret":3,"fromString":1,"toString":4,"finger":3}], source: "chords-db", review: "source-verified" },
  { id: "A#m6:primary", chord: "A#m6", frets: [-1,1,3,-1,2,3], fingers: [0,1,3,0,2,4], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "A#9:primary", chord: "A#9", frets: [-1,1,0,1,1,1], fingers: [0,1,0,2,3,4], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "B:primary", chord: "B", frets: [-1,2,4,4,4,2], fingers: [0,1,2,3,4,1], baseFret: 1, barres: [{"fret":2,"fromString":1,"toString":5,"finger":1}], source: "musum", review: "musum-curated" },
  { id: "Bm:primary", chord: "Bm", frets: [-1,2,4,4,3,2], fingers: [0,1,3,4,2,1], baseFret: 1, barres: [{"fret":2,"fromString":1,"toString":5,"finger":1}], source: "musum", review: "musum-curated" },
  { id: "B7:primary", chord: "B7", frets: [-1,2,1,2,0,2], fingers: [0,2,1,3,0,4], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Bmaj7:primary", chord: "Bmaj7", frets: [-1,2,4,3,4,2], fingers: [0,1,3,2,4,1], baseFret: 1, barres: [{"fret":2,"fromString":1,"toString":5,"finger":1}], source: "musum", review: "musum-curated" },
  { id: "Bm7:primary", chord: "Bm7", frets: [-1,2,0,2,0,2], fingers: [0,1,0,2,0,3], baseFret: 1, barres: [], source: "musum", review: "musum-curated" },
  { id: "Bsus2:primary", chord: "Bsus2", frets: [-1,2,4,4,2,2], fingers: [0,1,3,4,1,1], baseFret: 1, barres: [{"fret":2,"fromString":1,"toString":5,"finger":1}], source: "musum", review: "musum-curated" },
  { id: "Bsus4:primary", chord: "Bsus4", frets: [-1,2,4,4,5,2], fingers: [0,1,2,3,4,1], baseFret: 1, barres: [{"fret":2,"fromString":1,"toString":5,"finger":1}], source: "musum", review: "musum-curated" },
  { id: "Bdim:primary", chord: "Bdim", frets: [-1,2,0,-1,0,1], fingers: [0,3,0,0,0,2], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Baug:primary", chord: "Baug", frets: [-1,2,1,0,0,-1], fingers: [0,2,1,0,0,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Badd9:primary", chord: "Badd9", frets: [-1,2,1,-1,2,2], fingers: [0,2,1,0,3,4], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Bm7b5:primary", chord: "Bm7b5", frets: [-1,2,3,2,3,-1], fingers: [0,1,3,2,4,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "B6:primary", chord: "B6", frets: [-1,2,1,1,0,-1], fingers: [0,3,1,2,0,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Bm6:primary", chord: "Bm6", frets: [-1,2,0,1,0,2], fingers: [0,2,0,1,0,3], baseFret: 1, barres: [], source: "musum", review: "musum-curated" },
  { id: "B9:primary", chord: "B9", frets: [-1,2,1,2,2,2], fingers: [0,2,1,3,3,4], baseFret: 1, barres: [{"fret":2,"fromString":2,"toString":3,"finger":3}], source: "chords-db", review: "source-verified" },
  { id: "C/E:primary", chord: "C/E", frets: [0,3,2,0,1,0], fingers: [0,3,2,0,1,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "C/G:primary", chord: "C/G", frets: [3,3,2,0,1,0], fingers: [3,4,2,0,1,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "D/F#:primary", chord: "D/F#", frets: [-1,-1,4,2,3,2], fingers: [0,0,3,1,2,1], baseFret: 1, barres: [{"fret":2,"fromString":1,"toString":3,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "G/B:primary", chord: "G/B", frets: [-1,2,0,0,0,3], fingers: [0,1,0,0,0,2], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "A/C#:primary", chord: "A/C#", frets: [-1,3,1,1,1,4], fingers: [0,3,1,1,1,4], baseFret: 2, barres: [{"fret":1,"fromString":2,"toString":4,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "F/A:primary", chord: "F/A", frets: [-1,0,3,2,1,1], fingers: [0,0,3,2,1,1], baseFret: 1, barres: [{"fret":1,"fromString":1,"toString":2,"finger":1}], source: "chords-db", review: "source-verified" },
  { id: "Am/C:primary", chord: "Am/C", frets: [-1,3,2,2,1,0], fingers: [0,4,2,3,1,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Em/G:primary", chord: "Em/G", frets: [3,2,2,0,0,0], fingers: [3,1,2,0,0,0], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
  { id: "Dm/F:primary", chord: "Dm/F", frets: [-1,-1,3,2,3,1], fingers: [0,0,3,2,4,1], baseFret: 1, barres: [], source: "chords-db", review: "source-verified" },
];

export function getCanonicalGuitarChord(chord: string) {
  const symbol = parseChordSymbol(chord);
  if (!symbol || symbol.quality === "unsupported") return null;
  const suffix = QUALITY_SUFFIX[symbol.quality];
  return `${symbol.root}${suffix}${symbol.bass ? `/${symbol.bass}` : ""}`;
}

export function findGuitarChordShapes(chord: string): GuitarChordLookup {
  const canonicalChord = getCanonicalGuitarChord(chord);
  return {
    requestedChord: chord,
    canonicalChord,
    shapes: canonicalChord ? GUITAR_CHORD_SHAPES.filter((shape) => shape.chord === canonicalChord) : [],
  };
}

function absoluteFret(shape: GuitarChordShape, relativeFret: number) {
  if (relativeFret <= 0) return relativeFret;
  return shape.baseFret + relativeFret - 1;
}

function getShapePitchClasses(shape: GuitarChordShape) {
  return shape.frets.flatMap((fret, stringIndex) => {
    if (fret < 0) return [];
    return [(STANDARD_TUNING_PITCH_CLASSES[stringIndex] + absoluteFret(shape, fret)) % 12];
  });
}

export type GuitarChordShapeValidation = {
  valid: boolean;
  errors: string[];
};

export function validateGuitarChordShape(shape: GuitarChordShape): GuitarChordShapeValidation {
  const errors: string[] = [];
  const symbol = parseChordSymbol(shape.chord);
  const expectedPitchClasses = getChordPitchClasses(shape.chord);

  if (!symbol || symbol.quality === "unsupported" || !expectedPitchClasses) {
    errors.push("unsupported-chord");
  }
  if (!Number.isInteger(shape.baseFret) || shape.baseFret < 1 || shape.baseFret > 20) {
    errors.push("invalid-base-fret");
  }
  if (shape.frets.length !== 6 || shape.fingers.length !== 6) {
    errors.push("invalid-string-count");
  }

  shape.frets.forEach((fret, stringIndex) => {
    const finger = shape.fingers[stringIndex];
    if (!Number.isInteger(fret) || fret < -1 || fret > 5) errors.push(`invalid-fret:${stringIndex}`);
    if (!Number.isInteger(finger) || finger < 0 || finger > 4) errors.push(`invalid-finger:${stringIndex}`);
    if (fret <= 0 && finger !== 0) errors.push(`finger-on-open-or-muted:${stringIndex}`);
    if (fret > 0 && finger === 0) errors.push(`missing-finger:${stringIndex}`);
  });

  shape.barres.forEach((barre, index) => {
    if (
      !Number.isInteger(barre.fret) || barre.fret < 1 || barre.fret > 5 ||
      !Number.isInteger(barre.finger) || barre.finger < 1 || barre.finger > 4 ||
      !Number.isInteger(barre.fromString) || !Number.isInteger(barre.toString) ||
      barre.fromString < 1 || barre.fromString > 6 || barre.toString < 1 || barre.toString > 6 ||
      barre.fromString > barre.toString
    ) {
      errors.push(`invalid-barre:${index}`);
      return;
    }
    const coveredStrings = Array.from(
      { length: barre.toString - barre.fromString + 1 },
      (_, offset) => barre.fromString + offset,
    );
    const touchesTwoStrings = coveredStrings.filter((stringNumber) => {
      const arrayIndex = 6 - stringNumber;
      return shape.frets[arrayIndex] >= barre.fret;
    }).length >= 2;
    if (!touchesTwoStrings) errors.push(`barre-covers-fewer-than-two-strings:${index}`);
  });

  for (let finger = 1; finger <= 4; finger += 1) {
    const indexes = shape.fingers.flatMap((value, index) => value === finger && shape.frets[index] > 0 ? [index] : []);
    if (indexes.length <= 1) continue;
    const frets = new Set(indexes.map((index) => shape.frets[index]));
    if (frets.size !== 1) {
      errors.push(`finger-used-on-different-frets:${finger}`);
      continue;
    }
    const fret = shape.frets[indexes[0]];
    const matchingBarre = shape.barres.some((barre) =>
      barre.finger === finger &&
      barre.fret === fret &&
      barre.fromString === 6 - Math.max(...indexes) &&
      barre.toString === 6 - Math.min(...indexes),
    );
    if (!matchingBarre) errors.push(`missing-barre-for-repeated-finger:${finger}`);
  }

  if (symbol && expectedPitchClasses) {
    const actualPitchClasses = getShapePitchClasses(shape);
    const expected = new Set(expectedPitchClasses);
    const actual = new Set(actualPitchClasses);
    for (const pitchClass of actual) {
      if (!expected.has(pitchClass)) errors.push(`foreign-note:${pitchClass}`);
    }

    const required = expectedPitchClasses.filter(
      (pitchClass) => pitchClass !== (symbol.rootPitchClass + 7) % 12,
    );
    for (const pitchClass of required) {
      if (!actual.has(pitchClass)) errors.push(`missing-required-note:${pitchClass}`);
    }

    const lowestPitchClass = actualPitchClasses[0];
    if (symbol.bassPitchClass !== null && lowestPitchClass !== symbol.bassPitchClass) {
      errors.push(`incorrect-bass:${lowestPitchClass ?? "none"}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateGuitarChordDictionary(shapes: readonly GuitarChordShape[] = GUITAR_CHORD_SHAPES) {
  const ids = new Set<string>();
  return shapes.flatMap((shape) => {
    const validation = validateGuitarChordShape(shape);
    const errors = [...validation.errors];
    if (ids.has(shape.id)) errors.push("duplicate-id");
    ids.add(shape.id);
    return errors.length > 0 ? [{ id: shape.id, chord: shape.chord, errors }] : [];
  });
}
