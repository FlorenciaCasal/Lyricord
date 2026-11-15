export const SONG_LIMIT_REACHED_MESSAGE =
  "Alcanzaste el límite de 10 canciones y versiones. Esta canción todavía no se guardó. Podés pasar a Premium para conservarla sin eliminar ninguna de tus canciones, o liberar espacio en tu biblioteca";

export function getSongLimitReachedMessage(reason: unknown) {
  return reason instanceof Error && reason.name === "LocalSongLimitReachedError"
    ? SONG_LIMIT_REACHED_MESSAGE
    : null;
}
