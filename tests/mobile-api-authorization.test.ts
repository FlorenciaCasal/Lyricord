import assert from "node:assert/strict";
import test from "node:test";
import { buildOwnedSongWhere, isValidSongId } from "../lib/mobile-api/ownership.ts";

type FakeSong = { id: string; userId: string; title: string };

function fakeFindFirst(songs: FakeSong[], where: ReturnType<typeof buildOwnedSongWhere>) {
  return songs.find((song) => song.id === where.id && song.userId === where.userId) ?? null;
}

test("un usuario no puede leer una canción perteneciente a otro usuario", () => {
  const songs: FakeSong[] = [
    { id: "song_owner_123", userId: "user-owner", title: "Privada" },
  ];

  const result = fakeFindFirst(songs, buildOwnedSongWhere("user-attacker", "song_owner_123"));
  assert.equal(result, null);
});

test("el propietario sí puede leer su canción", () => {
  const songs: FakeSong[] = [
    { id: "song_owner_123", userId: "user-owner", title: "Privada" },
  ];

  const result = fakeFindFirst(songs, buildOwnedSongWhere("user-owner", "song_owner_123"));
  assert.equal(result?.title, "Privada");
});

test("un usuario no puede editar una canción ajena", () => {
  const songs: FakeSong[] = [
    { id: "song_owner_123", userId: "user-owner", title: "Canción privada" },
  ];

  const result = fakeFindFirst(songs, buildOwnedSongWhere("user-attacker", "song_owner_123"));

  assert.equal(result, null);
});

test("un usuario no puede borrar una canción ajena", () => {
  const songs: FakeSong[] = [
    { id: "song_owner_123", userId: "user-owner", title: "Canción privada" },
  ];

  const before = songs.length;
  const remaining = songs.filter((song) => {
    const where = buildOwnedSongWhere("user-attacker", "song_owner_123");
    return !(song.id === where.id && song.userId === where.userId);
  });

  assert.equal(remaining.length, before);
});

test("el filtro de detalle incluye simultáneamente id y userId", () => {
  assert.deepEqual(buildOwnedSongWhere("user-1", "song_12345678"), {
    id: "song_12345678",
    userId: "user-1",
  });
});

test("se rechazan IDs vacíos o con caracteres de ruta", () => {
  assert.equal(isValidSongId("song_12345678"), true);
  assert.equal(isValidSongId(""), false);
  assert.equal(isValidSongId("../../otra-cancion"), false);
});
