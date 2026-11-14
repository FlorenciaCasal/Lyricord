import type { SupportedChord } from "./chordDetection";
import { formatChordSymbol, getChordPitchClasses, getSimplifiedChord, isChordSymbolToken, parseChordSymbol } from "./chordTheory.ts";

export type ChordTimelineEvent = {
  id: string;
  chord: string;
  originalChord: string;
  normalizedChord: string;
  lineIndex: number;
  charIndex: number;
  charStart: number;
  charEnd: number;
  supportedChord: SupportedChord | null;
  matchChords: SupportedChord[];
  annotations: string[];
  sectionMarkers: string[];
  boundaries: string[];
  boundaryAfter: string | null;
};

export type MusicalSeparator = {
  kind: "bar" | "dash";
  originalText: string;
  lineIndex: number;
  charStart: number;
  charEnd: number;
};

export type ChordLineMetadata = {
  originalText: string;
  lineIndex: number;
  chordEvents: ChordTimelineEvent[];
  annotations: string[];
  sectionMarkers: string[];
  boundaries: string[];
  separators: MusicalSeparator[];
  lyricText: string | null;
};

export type NormalizedSongContent = {
  originalContent: string;
  lines: ChordLineMetadata[];
  chordEvents: ChordTimelineEvent[];
};

const LATIN_ROOT = "(?:SOL|DO|RE|MI|FA|LA|SI)";
const ROOT = `(?:${LATIN_ROOT}|[A-G])(?:#|b)?`;
const QUALITY = "(?:maj7|M7|min7|m7b5|min6|min|maj|sus2|sus4|sus|add(?:2|4|9|11|13)|dim|aug|m6|m7|m|6|7|9|11|13|°|ø|\\+)?";
const CHORD_PATTERN = new RegExp(`^${ROOT}${QUALITY}(?:/${ROOT})?$`);
const QUALITY_TOKEN_PATTERN = /^(?:maj7|M7|min7|m7b5|min6|min|maj|sus2|sus4|sus|add(?:2|4|9|11|13)|dim|aug|m6|m7|m|6|7|9|11|13|°|ø|\+)$/;
const SPACED_ACCIDENTAL_QUALITY_PATTERN = /^([#b])(.+)$/;
const ROOT_TOKEN_PATTERN = new RegExp(`^${ROOT}$`);
const BARE_ROOT_TOKEN_PATTERN = new RegExp(`^(?:${LATIN_ROOT}|[A-G])$`);
const LABEL_PREFIX_PATTERN = /^\s*([\p{L}\d ]+)\s*:\s*/u;
const BRACKET_SECTION_PREFIX_PATTERN = /^\s*\[([^\]]+)\]\s*/u;
const BAR_TOKEN_PATTERN = /^[|:]+$/;
const DASH_TOKEN_PATTERN = /^-+$/;
const HARD_PAUSE_PATTERN = /^(?:silencio|pausa)$/i;
const HARD_BREAK_PATTERN = /^break$/i;
const SECTION_MARKER_PATTERN = /^(?:intro|introduccion|introducción|estrofa|verso|verse|estribillo|coro|chorus|puente|bridge|interludio|instrumental|solo|outro|final)$/i;

type LineToken = {
  text: string;
  start: number;
  end: number;
};

type ParsedLineChord = {
  originalChord: string;
  normalizedChord: string;
  charStart: number;
  charEnd: number;
  nextTokenIndex: number;
};

type ParentheticalAnnotation = {
  text: string;
  start: number;
  end: number;
};

function normalizeSupportedChord(chord: string): SupportedChord | null {
  const symbol = parseChordSymbol(chord);
  return symbol && getChordPitchClasses(chord) ? formatChordSymbol(symbol) : null;
}

function getMatchChords(chord: string): SupportedChord[] {
  const supportedChord = normalizeSupportedChord(chord);
  const simplifiedChord = getSimplifiedChord(chord);
  return Array.from(new Set([supportedChord, simplifiedChord].filter((value): value is SupportedChord => Boolean(value))));
}

function cleanToken(token: string) {
  return token.replace(/^[([]/, "").replace(/[)\],.;:]+$/, "");
}

function normalizeMarker(text: string) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function tokenizeLine(line: string, offset = 0): LineToken[] {
  return Array.from(line.matchAll(/\S+/g)).map((match) => ({
    text: match[0],
    start: offset + (match.index ?? 0),
    end: offset + (match.index ?? 0) + match[0].length,
  }));
}

function isChordToken(token: string) {
  const cleaned = cleanToken(token);
  return CHORD_PATTERN.test(cleaned) && isChordSymbolToken(cleaned);
}

function isRootToken(token: string) {
  return ROOT_TOKEN_PATTERN.test(token);
}

function isAccidentalToken(token: string) {
  return token === "#" || token === "b";
}

function isQualityToken(token: string) {
  return token.length > 0 && QUALITY_TOKEN_PATTERN.test(token);
}

function isSlashToken(token: string) {
  return token === "/";
}

function classifySeparatorToken(token: string): "bar" | "dash" | null {
  const cleaned = cleanToken(token);
  if (DASH_TOKEN_PATTERN.test(cleaned)) return "dash";
  if (BAR_TOKEN_PATTERN.test(cleaned)) return "bar";
  return null;
}

function parseBass(tokens: readonly LineToken[], index: number) {
  const token = tokens[index];
  if (!token) return null;

  const text = cleanToken(token.text);
  if (!ROOT_TOKEN_PATTERN.test(text)) return null;

  let normalized = text;
  let endTokenIndex = index;
  const accidental = cleanToken(tokens[index + 1]?.text ?? "");
  if (BARE_ROOT_TOKEN_PATTERN.test(text) && isAccidentalToken(accidental)) {
    normalized += accidental;
    endTokenIndex = index + 1;
  }

  return { normalized, endTokenIndex };
}

function parseChordAt(tokens: readonly LineToken[], index: number, line: string): ParsedLineChord | null {
  const token = tokens[index];
  if (!token) return null;

  const first = cleanToken(token.text);
  const following = cleanToken(tokens[index + 1]?.text ?? "");
  const canExtendSpacedChord =
    ROOT_TOKEN_PATTERN.test(first) &&
    (isAccidentalToken(following) ||
      SPACED_ACCIDENTAL_QUALITY_PATTERN.test(following) ||
      isQualityToken(following) ||
      isSlashToken(following) ||
      following.startsWith("/"));

  if (!canExtendSpacedChord && isChordToken(first)) {
    return {
      originalChord: line.slice(token.start, token.end),
      normalizedChord: first,
      charStart: token.start,
      charEnd: token.end,
      nextTokenIndex: index + 1,
    };
  }

  if (!ROOT_TOKEN_PATTERN.test(first)) return null;

  let normalized = first;
  let endTokenIndex = index;
  let nextIndex = index + 1;

  const maybeAccidentalOrQuality = cleanToken(tokens[nextIndex]?.text ?? "");
  const accidentalQuality = maybeAccidentalOrQuality.match(SPACED_ACCIDENTAL_QUALITY_PATTERN);
  if (BARE_ROOT_TOKEN_PATTERN.test(normalized) && accidentalQuality) {
    normalized += accidentalQuality[1];
    if (accidentalQuality[2]) normalized += accidentalQuality[2];
    endTokenIndex = nextIndex;
    nextIndex += 1;
  } else if (BARE_ROOT_TOKEN_PATTERN.test(normalized) && isAccidentalToken(maybeAccidentalOrQuality)) {
    normalized += maybeAccidentalOrQuality;
    endTokenIndex = nextIndex;
    nextIndex += 1;
  }

  const maybeQuality = cleanToken(tokens[nextIndex]?.text ?? "");
  if (isQualityToken(maybeQuality)) {
    normalized += maybeQuality;
    endTokenIndex = nextIndex;
    nextIndex += 1;
  }

  const maybeSlash = cleanToken(tokens[nextIndex]?.text ?? "");
  if (isSlashToken(maybeSlash)) {
    const bass = parseBass(tokens, nextIndex + 1);
    if (!bass) return null;
    normalized += `/${bass.normalized}`;
    endTokenIndex = bass.endTokenIndex;
    nextIndex = bass.endTokenIndex + 1;
  } else if (maybeSlash.startsWith("/")) {
    const slashBass = maybeSlash.slice(1);
    if (!isRootToken(slashBass)) return null;
    normalized += `/${slashBass}`;
    endTokenIndex = nextIndex;
    nextIndex += 1;
  }

  if (!isChordSymbolToken(normalized)) return null;

  return {
    originalChord: line.slice(token.start, tokens[endTokenIndex].end),
    normalizedChord: normalized,
    charStart: token.start,
    charEnd: tokens[endTokenIndex].end,
    nextTokenIndex: nextIndex,
  };
}

function extractParentheticalAnnotations(line: string) {
  const annotations: ParentheticalAnnotation[] = [];
  let masked = line;

  for (const match of line.matchAll(/\(([^)]*)\)/g)) {
    const full = match[0];
    const start = match.index ?? 0;
    const end = start + full.length;
    const text = normalizeMarker(match[1] ?? "");
    if (!text) continue;

    annotations.push({ text, start, end });
    masked = `${masked.slice(0, start)}${" ".repeat(full.length)}${masked.slice(end)}`;
  }

  return { annotations, masked };
}

function classifyBoundaryFromAnnotation(annotation: string) {
  return HARD_PAUSE_PATTERN.test(annotation) ? annotation : null;
}

function classifySectionMarker(text: string) {
  const marker = normalizeMarker(text);
  return SECTION_MARKER_PATTERN.test(marker) ? marker : null;
}

function getBracketSectionPrefix(line: string) {
  const match = line.match(BRACKET_SECTION_PREFIX_PATTERN);
  if (!match) return null;

  const marker = classifySectionMarker(match[1] ?? "");
  if (!marker) return null;

  return {
    marker,
    offset: match[0].length,
  };
}

function classifyLineOnlyBoundary(line: string) {
  const marker = normalizeMarker(line.replace(/[()]/g, ""));
  if (HARD_PAUSE_PATTERN.test(marker)) return marker;
  if (HARD_BREAK_PATTERN.test(marker)) return marker;
  return null;
}

function getParseSegment(line: string) {
  const bracketPrefix = getBracketSectionPrefix(line);
  if (bracketPrefix) {
    return {
      text: line.slice(bracketPrefix.offset),
      offset: bracketPrefix.offset,
      sectionMarker: bracketPrefix.marker,
    };
  }

  const labelMatch = line.match(LABEL_PREFIX_PATTERN);
  if (!labelMatch) return { text: line, offset: 0, sectionMarker: null as string | null };

  const label = normalizeMarker(labelMatch[1] ?? "");
  return {
    text: line.slice(labelMatch[0].length),
    offset: labelMatch[0].length,
    sectionMarker: classifySectionMarker(label),
  };
}

function parseMusicalTokens(line: string, annotationsMaskedLine: string, offset: number, lineIndex: number) {
  const tokens = tokenizeLine(annotationsMaskedLine.slice(offset), offset);
  const chords: ParsedLineChord[] = [];
  const separators: MusicalSeparator[] = [];
  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index];
    const cleaned = cleanToken(token.text);
    if (!cleaned) {
      index += 1;
      continue;
    }

    const separatorKind = classifySeparatorToken(cleaned);
    if (separatorKind) {
      separators.push({
        kind: separatorKind,
        originalText: line.slice(token.start, token.end),
        lineIndex,
        charStart: token.start,
        charEnd: token.end,
      });
      index += 1;
      continue;
    }

    const parsed = parseChordAt(tokens, index, line);
    if (!parsed) return null;
    chords.push(parsed);
    index = parsed.nextTokenIndex;
  }

  return { chords, separators };
}

export function deriveChordLineMetadata(line: string, lineIndex = 0): ChordLineMetadata {
  const { annotations: annotationRanges, masked } = extractParentheticalAnnotations(line);
  const annotations = annotationRanges.map((annotation) => annotation.text);
  const boundaries = annotations.map(classifyBoundaryFromAnnotation).filter((value): value is string => Boolean(value));
  const sectionMarkers: string[] = [];

  const emptyResult = (overrides: Partial<ChordLineMetadata> = {}): ChordLineMetadata => ({
    originalText: line,
    lineIndex,
    chordEvents: [],
    annotations,
    sectionMarkers,
    boundaries,
    separators: [],
    lyricText: line.trim() ? line : null,
    ...overrides,
  });

  const lineOnlyBoundary = classifyLineOnlyBoundary(line);
  if (lineOnlyBoundary) {
    return emptyResult({ boundaries: [lineOnlyBoundary], lyricText: null });
  }

  const bracketLineOnlySection = getBracketSectionPrefix(masked);
  const lineOnlySection =
    bracketLineOnlySection && masked.slice(bracketLineOnlySection.offset).trim() === ""
      ? bracketLineOnlySection.marker
      : classifySectionMarker(masked.trim());
  if (lineOnlySection) {
    return emptyResult({ sectionMarkers: [lineOnlySection], lyricText: null });
  }

  const segment = getParseSegment(masked);
  if (segment.sectionMarker) sectionMarkers.push(segment.sectionMarker);

  const parsed = parseMusicalTokens(line, masked, segment.offset, lineIndex);
  if (!parsed) {
    return emptyResult({ sectionMarkers, lyricText: line.trim() ? line : null });
  }

  const chordEvents = parsed.chords.map((chord, chordIndex): ChordTimelineEvent => {
    const supportedChord = normalizeSupportedChord(chord.normalizedChord);
    return {
      id: `${lineIndex}:${chord.charStart}:${chord.originalChord}`,
      chord: chord.originalChord,
      originalChord: chord.originalChord,
      normalizedChord: chord.normalizedChord,
      lineIndex,
      charIndex: chord.charStart,
      charStart: chord.charStart,
      charEnd: chord.charEnd,
      supportedChord,
      matchChords: getMatchChords(chord.normalizedChord),
      annotations,
      sectionMarkers,
      boundaries,
      boundaryAfter: chordIndex === parsed.chords.length - 1 ? boundaries[0] ?? null : null,
    };
  });

  return {
    originalText: line,
    lineIndex,
    chordEvents,
    annotations,
    sectionMarkers,
    boundaries,
    separators: parsed.separators,
    lyricText: chordEvents.length > 0 ? null : line.trim() ? line : null,
  };
}

export function normalizeSongContent(content: string): NormalizedSongContent {
  const events: ChordTimelineEvent[] = [];
  const lines = content.split(/\r?\n/).map((line, lineIndex) => {
    const metadata = deriveChordLineMetadata(line, lineIndex);

    if (metadata.chordEvents.length === 0 && metadata.boundaries.length > 0) {
      const previous = events[events.length - 1];
      if (previous) previous.boundaryAfter = metadata.boundaries[0];
      return metadata;
    }

    events.push(...metadata.chordEvents);
    return metadata;
  });

  return {
    originalContent: content,
    lines,
    chordEvents: events,
  };
}
