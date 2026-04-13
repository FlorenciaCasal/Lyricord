import Link from "next/link";
import { getAuthSession } from "@/lib/auth";
import { EmptyState } from "@/components/empty-state";
import { SongList } from "@/components/song-list";
import { searchSongs } from "@/lib/songs";

type HomePageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

export default async function Home({ searchParams }: HomePageProps) {
  const session = await getAuthSession();
  const userId = session?.user?.id;
  const { q = "" } = await searchParams;
  const songs = userId ? await searchSongs(userId, q) : [];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-6 sm:py-8">
      <section className="rounded-[2rem] border border-slate-700 bg-slate-900 p-5 shadow-sm shadow-black/20 sm:p-8">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-400">
                Lyricord
              </p>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
                Letras y acordes, listos para tocar
              </h1>
              <p className="max-w-2xl text-base text-slate-300">
                Buscá, editá o importá canciones desde una imagen.
              </p>
            </div>

            <Link
              href="/songs/new"
              className="inline-flex items-center justify-center rounded-full bg-green-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-green-400"
            >
              Nueva canción
            </Link>
          </div>

          <form action="/" className="relative">
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Buscar por título o artista"
              className="min-h-12 w-full rounded-2xl border border-slate-700 bg-slate-950 py-3 pl-2 sm:pl-4 pr-10 sm:pr-12 text-sm sm:text-base text-white outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:bg-slate-950"
            />
            <button
              type="submit"
              aria-label="Buscar"
              className="absolute right-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-300 transition hover:bg-slate-800 hover:text-green-400"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m21 21-4.34-4.34" />
                <circle cx="11" cy="11" r="8" />
              </svg>
            </button>
          </form>
        </div>
      </section>

      <section className="mt-6">
        {songs.length > 0 ? (
          <SongList songs={songs} />
        ) : (
          <EmptyState
            title={q ? "No encontramos canciones" : "Todavía no hay canciones"}
            description={
              q
                ? "Probá con otro título o artista para seguir buscando."
                : "Empezá cargando tu primera canción o importá una imagen con OCR desde el formulario."
            }
            actionLabel="Nueva canción"
            actionHref="/songs/new"
          />
        )}
      </section>
    </main>
  );
}
