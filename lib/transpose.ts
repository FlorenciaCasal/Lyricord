const SHARP_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NOTES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

const LATIN_TO_ENGLISH: Record<string, string> = {
  DO: "C",
  RE: "D",
  MI: "E",
  FA: "F",
  SOL: "G",
  LA: "A",
  SI: "B",
};

const ENGLISH_TO_LATIN: Record<string, string> = {
  C: "DO",
  D: "RE",
  E: "MI",
  F: "FA",
  G: "SOL",
  A: "LA",
  B: "SI",
};

const CHORD_TOKEN_PATTERN =
  /(^|[\s([{|])((?:DO|RE|MI|FA|SOL|LA|SI|[A-G])(?:#|b)?(?:(?:m(?![a-z])|maj|min|dim|aug|sus|add|M)|[0-9#b()+.-])*(?:\/(?:DO|RE|MI|FA|SOL|LA|SI|[A-G])(?:#|b)?)?)(?=$|[\s)\]}|,;:])/g;

const CHORD_PART_PATTERN =
  /^(DO|RE|MI|FA|SOL|LA|SI|[A-G])(#|b)?(.*)$/;

function transposeRoot(root: string, accidental = "", semitones: number) {
  const usesLatin = root.length > 1;
  const normalizedRoot = usesLatin ? LATIN_TO_ENGLISH[root] : root;
  const sourceNote = `${normalizedRoot}${accidental}`;
  const scale = accidental === "b" ? FLAT_NOTES : SHARP_NOTES;
  const sourceIndex = scale.indexOf(sourceNote);

  if (sourceIndex < 0) {
    return `${root}${accidental}`;
  }

  const targetIndex = (sourceIndex + semitones + 120) % 12;
  const targetNote = scale[targetIndex];

  if (!usesLatin) {
    return targetNote;
  }

  const baseNote = targetNote[0];
  const targetAccidental = targetNote.slice(1);

  return `${ENGLISH_TO_LATIN[baseNote]}${targetAccidental}`;
}

function transposeChordPart(chordPart: string, semitones: number) {
  const match = chordPart.match(CHORD_PART_PATTERN);

  if (!match) {
    return chordPart;
  }

  const [, root, accidental, suffix] = match;
  return `${transposeRoot(root, accidental, semitones)}${suffix}`;
}

function transposeChord(chord: string, semitones: number) {
  return chord
    .split("/")
    .map((part) => transposeChordPart(part, semitones))
    .join("/");
}

export function transposeSongText(content: string, semitones: number) {
  if (semitones === 0) {
    return content;
  }

  return content.replace(CHORD_TOKEN_PATTERN, (match, prefix: string, chord: string) => {
    if (!chord) {
      return match;
    }

    return `${prefix}${transposeChord(chord, semitones)}`;
  });
}
