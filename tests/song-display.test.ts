import assert from "node:assert/strict";
import test from "node:test";
import { getSongDisplayMeta, getSongDisplayTitle } from "../mobile/src/utils/songDisplay.ts";

test("biblioteca muestra versionName como titulo visible de una version guardada", () => {
  const song = {
    title: "Cae el sol",
    artist: "Airbag",
    key: "Em",
    versionName: "Cae el sol en Em",
  };

  assert.equal(getSongDisplayTitle(song), "Cae el sol en Em");
  assert.equal(getSongDisplayMeta(song), "Versión de Cae el sol · Airbag · Em");
});

test("biblioteca muestra el titulo base para canciones principales", () => {
  const song = {
    title: "Cae el sol",
    artist: null,
    key: null,
    versionName: null,
  };

  assert.equal(getSongDisplayTitle(song), "Cae el sol");
  assert.equal(getSongDisplayMeta(song), "Sin datos adicionales");
});

test("versiones antiguas llamadas Nueva version usan fallback legible", () => {
  const song = {
    title: "Cae el sol",
    artist: null,
    key: "C#m",
    versionName: "Nueva versión",
  };

  assert.equal(getSongDisplayTitle(song), "Cae el sol - versión");
  assert.equal(getSongDisplayMeta(song), "C#m");
});
