import { transposeChordName, transposeSongText } from "../music/transpose.ts";
import type { SongDetail, SongVersionCreateValues } from "../types.ts";

export type VersionFormValues = SongVersionCreateValues;

export function createVersionFormValues(
  source: Pick<SongDetail, "title" | "key" | "content">,
  initialSemitones = 0,
): VersionFormValues {
  return {
    versionName: `${source.title} - versión`,
    key: source.key ? transposeChordName(source.key, initialSemitones) : "",
    content: transposeSongText(source.content, initialSemitones),
  };
}

export function transposeVersionFormValues(
  values: VersionFormValues,
  semitones: number,
): VersionFormValues {
  return {
    versionName: values.versionName,
    key: values.key ? transposeChordName(values.key, semitones) : "",
    content: transposeSongText(values.content, semitones),
  };
}

export function toVersionCreateValues(values: VersionFormValues): SongVersionCreateValues {
  return {
    versionName: values.versionName.trim(),
    key: values.key.trim(),
    content: values.content,
  };
}
