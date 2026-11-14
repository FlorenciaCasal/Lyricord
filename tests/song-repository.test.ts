import assert from "node:assert/strict";
import test from "node:test";
import { createRemoteSongRepository, type RemoteSongApi } from "../mobile/src/data/songs/RemoteSongRepository.ts";
import type { SongDetail, SongFormValues, SongListItem, SongVersionCreateValues, SongVersionItem } from "../mobile/src/types.ts";

const formValues: SongFormValues = {
  title: "Cae el sol",
  artist: "Airbag",
  key: "C#m",
  versionName: "",
  content: "C#m A E",
  notes: "",
};

const songDetail: SongDetail = {
  id: "song_1",
  title: "Cae el sol",
  artist: "Airbag",
  key: "C#m",
  versionName: null,
  updatedAt: "2026-08-20T00:00:00.000Z",
  content: "C#m A E",
  notes: null,
};

const songList: SongListItem[] = [
  {
    id: "song_1",
    title: "Cae el sol",
    artist: "Airbag",
    key: "C#m",
    versionName: null,
    updatedAt: "2026-08-20T00:00:00.000Z",
  },
];

const versions: SongVersionItem[] = [
  {
    id: "song_2",
    title: "Cae el sol",
    versionName: "Cae el sol en Em",
    updatedAt: "2026-08-21T00:00:00.000Z",
  },
];

function createApiStub() {
  const calls: Array<{ method: keyof RemoteSongApi; args: unknown[] }> = [];
  const api: RemoteSongApi = {
    async getSongs() {
      calls.push({ method: "getSongs", args: [] });
      return songList;
    },
    async getSong(id) {
      calls.push({ method: "getSong", args: [id] });
      return songDetail;
    },
    async createSong(values) {
      calls.push({ method: "createSong", args: [values] });
      return songDetail;
    },
    async updateSong(id, values) {
      calls.push({ method: "updateSong", args: [id, values] });
      return { ...songDetail, id };
    },
    async deleteSong(id) {
      calls.push({ method: "deleteSong", args: [id] });
    },
    async getSongVersions(id) {
      calls.push({ method: "getSongVersions", args: [id] });
      return versions;
    },
    async createSongVersion(id, values) {
      calls.push({ method: "createSongVersion", args: [id, values] });
      return { ...songDetail, id: "song_2", versionName: values?.versionName ?? "Nueva version" };
    },
  };

  return { api, calls };
}

test("RemoteSongRepository delega operaciones de canciones al API mobile actual", async () => {
  const { api, calls } = createApiStub();
  const repository = createRemoteSongRepository(api);
  const versionValues: SongVersionCreateValues = {
    versionName: "Cae el sol en Em",
    content: "Em C G",
    key: "Em",
  };

  assert.deepEqual(await repository.listSongs(), songList);
  assert.equal((await repository.getSong("song_1")).id, "song_1");
  assert.equal((await repository.createSong(formValues)).title, "Cae el sol");
  assert.equal((await repository.updateSong("song_1", formValues)).id, "song_1");
  await repository.deleteSong("song_1");
  assert.deepEqual(await repository.listVersions("song_1"), versions);
  assert.equal((await repository.createVersion("song_1", versionValues)).versionName, "Cae el sol en Em");

  assert.deepEqual(calls, [
    { method: "getSongs", args: [] },
    { method: "getSong", args: ["song_1"] },
    { method: "createSong", args: [formValues] },
    { method: "updateSong", args: ["song_1", formValues] },
    { method: "deleteSong", args: ["song_1"] },
    { method: "getSongVersions", args: ["song_1"] },
    { method: "createSongVersion", args: ["song_1", versionValues] },
  ]);
});

test("RemoteSongRepository propaga errores del API sin reemplazar mensajes", async () => {
  const expected = new Error("SESSION_EXPIRED");
  const { api } = createApiStub();
  api.getSongs = async () => {
    throw expected;
  };

  const repository = createRemoteSongRepository(api);

  await assert.rejects(() => repository.listSongs(), expected);
});
