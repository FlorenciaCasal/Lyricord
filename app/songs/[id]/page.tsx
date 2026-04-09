import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { DeleteSongButton } from "@/components/delete-song-button";
import { formatSongDate, getSongById } from "@/lib/songs";

type SongDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function SongDetailPage({ params }: SongDetailPageProps) {
  const session = await getAuthSession();
  const userId = session?.user?.id;
  const { id } = await params;

  if (!userId) {
    notFound();
  }

  const song = await getSongById(id, userId);

  if (!song) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-6 sm:py-8">
      <section className="rounded-[2rem] border border-slate-700 bg-slate-900 p-5 shadow-sm shadow-black/20 sm:p-8">
        <div className="flex flex-col gap-5 border-b border-slate-700 pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-3">
              <Link
                href="/"
                className="text-sm font-medium text-slate-400 transition hover:text-green-400"
              >
                Volver al listado
              </Link>
              <div className="space-y-2">
                <h1 className="font-heading text-4xl text-white">
                  {song.title}
                </h1>
                <div className="flex flex-wrap gap-2 text-sm text-slate-300">
                  {song.artist ? <span>Artista: {song.artist}</span> : null}
                  {song.key ? <span>Tono: {song.key}</span> : null}
                  <span>Actualizada: {formatSongDate(song.updatedAt)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:items-end">
              <Link
                href={`/songs/${song.id}/edit`}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-green-500 px-5 text-sm font-semibold text-black transition hover:bg-green-400"
              >
                Editar
              </Link>
              <DeleteSongButton id={song.id} title={song.title} />
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
              Letra y acordes
            </h2>
            <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-950 px-3 py-4 text-[12px] text-slate-100 sm:p-6 sm:text-[0.95rem]">
              <pre className="font-mono whitespace-pre leading-[1.45] sm:leading-relaxed">
                {song.content}
              </pre>
            </div>
          </section>

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
