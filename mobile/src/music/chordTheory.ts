export type ChordQuality =
  | "major"
  | "minor"
  | "dominant7"
  | "major7"
  | "minor7"
  | "sus2"
  | "sus4"
  | "diminished"
  | "augmented"
  | "add9"
  | "minor7Flat5"
  | "six"
  | "minorSix"
  | "nine";

export type ChordSymbol = {
  original: string;
  root: string;
  rootPitchClass: number;
  quality: ChordQuality | "unsupported";
  rawQuality: string;
  bass: string | null;
  bassPitchClass: number | null;
};

export type ChordMatchKind = "exact" | "simplified" | "different";

export type ChordMatch = {
  kind: ChordMatchKind;
  weight: number;
};

const ROOT_PITCH_CLASS: Record<string, number> = {
  "B#": 0,
  C: 0,
  "C#": 1,
  Db: 1,
  Cb: 11,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  "E#": 5,
  Fb: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

const LATIN_ROOT_TO_ENGLISH: Record<string, string> = {
  DO: "C",
  RE: "D",
  MI: "E",
  FA: "F",
  SOL: "G",
  LA: "A",
  SI: "B",
};

const CANONICAL_ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const LATIN_ROOT_PATTERN = "(?:(?:SOL|DO|RE|MI|FA|LA|SI)(?:#|b)?)";
const ENGLISH_ROOT_PATTERN = "(?:B#|Cb|C#|Db|D#|Eb|E#|Fb|F#|Gb|G#|Ab|A#|Bb|[A-G])";
const ROOT_PATTERN = `(?:${LATIN_ROOT_PATTERN}|${ENGLISH_ROOT_PATTERN})`;
const CHORD_SYMBOL_PATTERN = new RegExp(`^(${ROOT_PATTERN})([^/]*)(?:/(${ROOT_PATTERN}))?$`);

const QUALITY_INTERVALS: Record<ChordQuality, readonly number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  dominant7: [0, 4, 7, 10],
  major7: [0, 4, 7, 11],
  minor7: [0, 3, 7, 10],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
  add9: [0, 4, 7, 2],
  minor7Flat5: [0, 3, 6, 10],
  six: [0, 4, 7, 9],
  minorSix: [0, 3, 7, 9],
  nine: [0, 4, 7, 10, 2],
};

function normalizeLatinRoot(root: string) {
  const match = root.match(/^(SOL|DO|RE|MI|FA|LA|SI)(#|b)?$/);
  if (!match) return root;
  return `${LATIN_ROOT_TO_ENGLISH[match[1]]}${match[2] ?? ""}`;
}

function normalizeRoot(root: string) {
  const englishRoot = normalizeLatinRoot(root);
  const pitchClass = ROOT_PITCH_CLASS[englishRoot];
  if (pitchClass === undefined) return null;
  return {
    root: CANONICAL_ROOTS[pitchClass],
    pitchClass,
  };
}

function normalizeQuality(rawQuality: string): ChordQuality | "unsupported" {
  const quality = rawQuality.trim();
  if (quality === "" || quality === "M" || quality === "maj") return "major";
  if (quality === "m" || quality === "min") return "minor";
  if (quality === "7") return "dominant7";
  if (quality === "maj7" || quality === "M7") return "major7";
  if (quality === "m7" || quality === "min7") return "minor7";
  if (quality === "sus2") return "sus2";
  if (quality === "sus" || quality === "sus4") return "sus4";
  if (quality === "dim" || quality === "°") return "diminished";
  if (quality === "aug" || quality === "+") return "augmented";
  if (quality === "add9") return "add9";
  if (quality === "m7b5" || quality === "ø") return "minor7Flat5";
  if (quality === "6") return "six";
  if (quality === "m6" || quality === "min6") return "minorSix";
  if (quality === "9") return "nine";

  return "unsupported";
}

export function parseChordSymbol(chord: string): ChordSymbol | null {
  const cleaned = chord.trim().replace(/^[([]/, "").replace(/[)\],.;:]+$/, "");
  const match = cleaned.match(CHORD_SYMBOL_PATTERN);
  if (!match) return null;

  const root = normalizeRoot(match[1]);
  const quality = normalizeQuality(match[2] ?? "");
  const bass = match[3] ? normalizeRoot(match[3]) : null;

  if (!root || (match[3] && !bass)) return null;

  return {
    original: cleaned,
    root: root.root,
    rootPitchClass: root.pitchClass,
    quality,
    rawQuality: match[2] ?? "",
    bass: bass?.root ?? null,
    bassPitchClass: bass?.pitchClass ?? null,
  };
}

export function formatChordSymbol(symbol: Pick<ChordSymbol, "root" | "quality" | "original">) {
  switch (symbol.quality) {
    case "major":
      return symbol.root;
    case "minor":
      return `${symbol.root}m`;
    case "dominant7":
      return `${symbol.root}7`;
    case "major7":
      return `${symbol.root}maj7`;
    case "minor7":
      return `${symbol.root}m7`;
    case "sus2":
      return `${symbol.root}sus2`;
    case "sus4":
      return `${symbol.root}sus4`;
    case "diminished":
      return `${symbol.root}dim`;
    case "augmented":
      return `${symbol.root}aug`;
    case "add9":
      return `${symbol.root}add9`;
    case "minor7Flat5":
      return `${symbol.root}m7b5`;
    case "six":
      return `${symbol.root}6`;
    case "minorSix":
      return `${symbol.root}m6`;
    case "nine":
      return `${symbol.root}9`;
    case "unsupported":
      return symbol.original;
  }
}

export function getChordPitchClasses(chord: string) {
  const symbol = parseChordSymbol(chord);
  if (!symbol || symbol.quality === "unsupported") return null;
  return QUALITY_INTERVALS[symbol.quality].map((interval) => (symbol.rootPitchClass + interval) % 12);
}

export function getSimplifiedChord(chord: string) {
  const symbol = parseChordSymbol(chord);
  if (!symbol || symbol.quality === "unsupported") return null;

  const simplifiedQuality: ChordQuality =
    symbol.quality === "minor" ||
    symbol.quality === "minor7" ||
    symbol.quality === "minorSix" ||
    symbol.quality === "minor7Flat5"
      ? "minor"
      : "major";

  return formatChordSymbol({ root: symbol.root, quality: simplifiedQuality, original: symbol.original });
}

export function getChordMatchFamily(expectedChord: string, playedChord: string): ChordMatch {
  const expected = parseChordSymbol(expectedChord);
  const played = parseChordSymbol(playedChord);
  if (!expected || !played) return { kind: "different", weight: 0 };

  if (formatChordSymbol(expected) === formatChordSymbol(played)) {
    return { kind: "exact", weight: 1 };
  }

  if (getSimplifiedChord(expectedChord) === getSimplifiedChord(playedChord)) {
    return { kind: "simplified", weight: 0.82 };
  }

  return { kind: "different", weight: 0 };
}

export function isSupportedChordSymbol(chord: string) {
  return getChordPitchClasses(chord) !== null;
}

export function isChordSymbolToken(token: string) {
  return parseChordSymbol(token) !== null;
}
