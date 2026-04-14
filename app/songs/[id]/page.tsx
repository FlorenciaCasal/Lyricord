import Link from "next/link";
import { notFound } from "next/navigation";
import { createSongVersionAction } from "@/app/actions";
import { getAuthSession } from "@/lib/auth";
import { DeleteSongButton } from "@/components/delete-song-button";
import { SongContentViewer } from "@/components/song-content-viewer";
import { formatSongDate, getSongById, getSongVersions } from "@/lib/songs";

type SongDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    versionError?: string;
  }>;
};

export default async function SongDetailPage({
  params,
  searchParams,
}: SongDetailPageProps) {
  const session = await getAuthSession();
  const userId = session?.user?.id;
  const { id } = await params;
  const { versionError } = await searchParams;

  if (!userId) {
    notFound();
  }

  const song = await getSongById(id, userId);

  if (!song) {
    notFound();
  }

  const versions = await getSongVersions(song.id, userId);
  const versionLimitReached = versionError === "limit-reached";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-2 py-6 sm:px-6 sm:py-8">
      <section className="rounded-[2rem] border border-slate-700 bg-slate-900 py-5 px-2 shadow-sm shadow-black/20 sm:p-8">
        <div className="flex flex-col gap-5 border-b border-slate-700 pb-6">
          <Link
            href="/"
            className="inline-flex min-h-10 w-fit items-center justify-center rounded-full bg-green-500 px-4 text-sm font-semibold text-black transition hover:bg-green-400"
          >
            Volver al listado
          </Link>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-white">
                {song.title}
              </h1>
              <div className="flex flex-wrap gap-2 text-sm text-slate-300">
                {song.artist ? <span>Artista: {song.artist}</span> : null}
                {song.key ? <span>Tono: {song.key}</span> : null}
                {song.versionName ? (
                  <span>Versión: {song.versionName}</span>
                ) : null}
                <span>Actualizada: {formatSongDate(song.updatedAt)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-col sm:items-end">
              <Link
                href={`/songs/${song.id}/edit`}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-green-500 px-5 text-sm font-semibold text-black transition hover:bg-green-400 sm:w-24"
              >
                Editar
              </Link>
              <DeleteSongButton id={song.id} title={song.title} />
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          <section className="rounded-3xl border border-slate-800 bg-slate-950/60 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Versiones
                </h2>
                <p className="text-sm text-slate-300">
                  Duplicá esta canción para crear una variante editable.
                </p>
              </div>
              <form action={createSongVersionAction}>
                <input type="hidden" name="id" value={song.id} />
                <button
                  type="submit"
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-slate-700 px-4 text-sm font-semibold text-white transition hover:border-green-400 hover:text-green-400 sm:w-auto"
                >
                  Crear versión
                </button>
              </form>
            </div>

            {versions.length > 1 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {versions.map((version) => {
                  const isCurrentVersion = version.id === song.id;

                  return (
                    <Link
                      key={version.id}
                      href={`/songs/${version.id}`}
                      className={
                        isCurrentVersion
                          ? "inline-flex min-h-10 items-center justify-center rounded-full bg-green-500 px-4 text-sm font-semibold text-black"
                          : "inline-flex min-h-10 items-center justify-center rounded-full border border-slate-700 px-4 text-sm font-semibold text-white transition hover:border-green-400 hover:text-green-400"
                      }
                    >
                      {version.versionName || "Principal"}
                    </Link>
                  );
                })}
              </div>
            ) : null}

            {versionLimitReached ? (
              <p className="mt-4 rounded-2xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-sm leading-6 text-amber-200">
                Alcanzaste el limite inicial de 200 canciones y versiones para
                esta beta. Para crear otra version, elimina alguna cancion o
                version que ya no necesites.
              </p>
            ) : null}
          </section>

          <SongContentViewer content={song.content} />

          {song.notes ? (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
                Notas
              </h2>
              <div className="rounded-3xl border border-slate-700 bg-slate-950 p-4 text-sm leading-7 text-slate-300 sm:p-6">
                <p className="whitespace-pre-wrap break-words">{song.notes}</p>
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
