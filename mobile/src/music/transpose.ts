const SHARP_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NOTES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const PRACTICAL_NOTES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
const NOTE_TO_INDEX: Record<string, number> = {
  "B#": 0,
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  "E#": 5,
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
  Cb: 11,
};
const LATIN_TO_ENGLISH: Record<string, string> = { DO: "C", RE: "D", MI: "E", FA: "F", SOL: "G", LA: "A", SI: "B" };
const ENGLISH_TO_LATIN: Record<string, string> = { C: "DO", D: "RE", E: "MI", F: "FA", G: "SOL", A: "LA", B: "SI" };
const CHORD_TOKEN_PATTERN = /(^|[\s([{|])((?:DO|RE|MI|FA|SOL|LA|SI|[A-G])(?:##|bb|#|b)?(?:(?:m(?![a-z])|maj|min|dim|aug|sus|add|M)|[0-9#b()+.-])*(?:\/(?:DO|RE|MI|FA|SOL|LA|SI|[A-G])(?:##|bb|#|b)?)?)(?=$|[\s)\]}|,;:])/g;
const CHORD_PART_PATTERN = /^(DO|RE|MI|FA|SOL|LA|SI|[A-G])(##|bb|#|b)?(.*)$/;
const SIMPLE_ROOT_PATTERN = /^(DO|RE|MI|FA|SOL|LA|SI|[A-G])(?:##|bb|#|b)?$/;
const QUALITY_PATTERN = /^(?:m(?![a-z])|maj7|M7|min7|m7b5|min6|min|maj|sus2|sus4|sus|add(?:2|4|9|11|13)|dim|aug|m6|m7|M|6|7|9|11|13)$/;

type LineToken = { text: string; start: number; end: number };
type Replacement = { start: number; end: number; text: string };

function normalizeDoubleAccidental(root: string, accidental = "") {
  if (accidental !== "##" && accidental !== "bb") return `${root}${accidental}`;
  const sourceIndex = NOTE_TO_INDEX[root];
  if (sourceIndex === undefined) return `${root}${accidental}`;
  const offset = accidental === "##" ? 2 : -2;
  return SHARP_NOTES[(sourceIndex + offset + 120) % 12];
}

function transposeRoot(root: string, accidental = "", semitones: number) {
  const usesLatin = root.length > 1;
  const normalizedRoot = usesLatin ? LATIN_TO_ENGLISH[root] : root;
  const sourceNote = normalizeDoubleAccidental(normalizedRoot, accidental);
  const sourceIndex = NOTE_TO_INDEX[sourceNote] ?? PRACTICAL_NOTES.indexOf(sourceNote);
  if (sourceIndex < 0) return `${root}${accidental}`;
  const targetNote = PRACTICAL_NOTES[(sourceIndex + semitones + 120) % 12];
  if (!usesLatin) return targetNote;
  return `${ENGLISH_TO_LATIN[targetNote[0]]}${targetNote.slice(1)}`;
}

function transposeChordPart(part: string, semitones: number) {
  const match = part.match(CHORD_PART_PATTERN);
  return match ? `${transposeRoot(match[1], match[2], semitones)}${match[3]}` : part;
}

export function transposeChordName(chord: string, semitones: number) {
  if (semitones === 0) return chord;
  return chord.split("/").map((part) => transposeChordPart(part, semitones)).join("/");
}

function cleanToken(token: string) {
  return token.replace(/^[([]/, "").replace(/[)\],.;:]+$/, "");
}

function tokenizeLine(line: string): LineToken[] {
  return Array.from(line.matchAll(/\S+/g)).map((match) => ({
    text: match[0],
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

function getParentheticalRanges(line: string) {
  return Array.from(line.matchAll(/\([^)]*\)/g)).map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

function isInsideRange(token: LineToken, ranges: readonly { start: number; end: number }[]) {
  return ranges.some((range) => token.start >= range.start && token.end <= range.end);
}

function parseLineChord(tokens: readonly LineToken[], index: number, line: string, semitones: number) {
  const token = tokens[index];
  if (!token) return null;

  const first = cleanToken(token.text);
  const firstMatch = first.match(CHORD_PART_PATTERN);
  if (!firstMatch) return null;

  let chord = first;
  let endTokenIndex = index;
  let nextIndex = index + 1;
  const next = cleanToken(tokens[nextIndex]?.text ?? "");
  const isBareRoot = /^(?:DO|RE|MI|FA|SOL|LA|SI|[A-G])$/.test(chord);

  if (isBareRoot && (next === "#" || next === "b")) {
    chord += next;
    endTokenIndex = nextIndex;
    nextIndex += 1;
  }

  const quality = cleanToken(tokens[nextIndex]?.text ?? "");
  if (SIMPLE_ROOT_PATTERN.test(chord) && QUALITY_PATTERN.test(quality)) {
    chord += quality;
    endTokenIndex = nextIndex;
    nextIndex += 1;
  }

  const slash = cleanToken(tokens[nextIndex]?.text ?? "");
  if (slash === "/") {
    const bass = cleanToken(tokens[nextIndex + 1]?.text ?? "");
    if (SIMPLE_ROOT_PATTERN.test(bass)) {
      chord += `/${bass}`;
      endTokenIndex = nextIndex + 1;
      nextIndex += 2;
    }
  } else if (slash.startsWith("/") && SIMPLE_ROOT_PATTERN.test(slash.slice(1))) {
    chord += slash;
    endTokenIndex = nextIndex;
    nextIndex += 1;
  }

  return {
    replacement: {
      start: token.start,
      end: tokens[endTokenIndex].end,
      text: transposeChordName(chord, semitones),
    },
    nextIndex,
    source: line.slice(token.start, tokens[endTokenIndex].end),
  };
}

function transposeLineText(line: string, semitones: number) {
  const tokens = tokenizeLine(line);
  const parentheticalRanges = getParentheticalRanges(line);
  const replacements: Replacement[] = [];
  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index];
    if (isInsideRange(token, parentheticalRanges)) {
      index += 1;
      continue;
    }

    const parsed = parseLineChord(tokens, index, line, semitones);
    if (parsed) {
      replacements.push(parsed.replacement);
      index = parsed.nextIndex;
      continue;
    }

    index += 1;
  }

  if (replacements.length === 0) {
    return line.replace(CHORD_TOKEN_PATTERN, (match, prefix: string, chord: string) =>
      chord ? `${prefix}${transposeChordName(chord, semitones)}` : match,
    );
  }

  let result = line;
  for (const replacement of replacements.reverse()) {
    result = `${result.slice(0, replacement.start)}${replacement.text}${result.slice(replacement.end)}`;
  }
  return result;
}

export function transposeSongText(content: string, semitones: number) {
  if (semitones === 0) return content;
  return content.split("\n").map((line) => transposeLineText(line, semitones)).join("\n");
}
