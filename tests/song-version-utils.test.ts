import assert from "node:assert/strict";
import test from "node:test";
import { buildSongVersionDraft, getDefaultSongVersionName } from "../lib/song-version-utils.ts";

const source = {
  id: "song-1",
  title: "Cae el sol",
  artist: "Airbag",
  key: "C#m",
  versionGroupId: null,
  content: "C#m A E\nLetra",
  notes: "Nota",
  userId: "user-1",
};

test("crea version dentro del grupo de la cancion principal", () => {
  const draft = buildSongVersionDraft(source, {
    versionName: "Cae el sol en Em",
    content: "Em C G\nLetra",
    key: "Em",
  });

  assert.equal(draft.title, "Cae el sol");
  assert.equal(draft.versionGroupId, "song-1");
  assert.equal(draft.versionName, "Cae el sol en Em");
  assert.equal(draft.content, "Em C G\nLetra");
  assert.equal(draft.key, "Em");
  assert.equal(draft.userId, "user-1");
});

test("usa nombre default razonable si el usuario no escribe uno", () => {
  assert.equal(getDefaultSongVersionName("Cae el sol", "Em", 1), "Cae el sol en Em");
  assert.equal(getDefaultSongVersionName("Cae el sol", null, 2), "Versión 3");

  const draft = buildSongVersionDraft(source, {
    versionName: "   ",
    content: "Em C G\nLetra",
    key: "Em",
  });

  assert.equal(draft.versionName, "Cae el sol en Em");
});

test("sin payload conserva principal como base y no persiste transposicion implicita", () => {
  const draft = buildSongVersionDraft(source, {});

  assert.equal(draft.content, source.content);
  assert.equal(draft.key, source.key);
  assert.equal(draft.versionName, "Cae el sol en C#m");
});
