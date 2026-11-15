export const SONG_LIMIT_REACHED_MESSAGE =
  "Alcanzaste el límite de 10 canciones y versiones. Esta canción todavía no se guardó. Podés pasar a Premium para conservarla, o volver a tu biblioteca y liberar espacio";

export function getSongLimitReachedMessage(reason: unknown) {
  return reason instanceof Error && reason.name === "LocalSongLimitReachedError"
    ? SONG_LIMIT_REACHED_MESSAGE
    : null;
}
