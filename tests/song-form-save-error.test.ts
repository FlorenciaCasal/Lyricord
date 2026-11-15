import assert from "node:assert/strict";
import test from "node:test";
import { LocalSongLimitReachedError } from "../mobile/src/data/songs/local/LocalSongRepository.ts";
import {
  getSongLimitReachedMessage,
  SONG_LIMIT_REACHED_MESSAGE,
} from "../mobile/src/utils/songFormSaveError.ts";

test("SongForm muestra una explicación específica cuando se alcanza el límite Free", () => {
  const message = getSongLimitReachedMessage(new LocalSongLimitReachedError(10));

  assert.equal(
    message,
    "Alcanzaste el límite de 10 canciones y versiones. Esta canción todavía no se guardó. Podés pasar a Premium para conservarla, o volver a tu biblioteca y liberar espacio",
  );
  assert.equal(message, SONG_LIMIT_REACHED_MESSAGE);
  assert.match(message ?? "", /todavía no se guardó/i);
  assert.match(message ?? "", /Premium/i);
});

test("SongForm no confunde otros errores de guardado con el límite Free", () => {
  assert.equal(getSongLimitReachedMessage(new Error("Sin conexión")), null);
  assert.equal(getSongLimitReachedMessage(null), null);
});
