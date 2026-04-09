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
                Cancionero
              </p>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
                Tus canciones, letras y acordes en un solo lugar
              </h1>
              <p className="max-w-2xl text-base text-slate-300">
                Buscá por título o artista, abrí una ficha y editá el contenido
                cuando lo necesites.
              </p>
            </div>

            <Link
              href="/songs/new"
              className="inline-flex items-center justify-center rounded-full bg-green-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-green-400"
            >
              Nueva canción
            </Link>
          </div>

          <form className="flex flex-col gap-3 sm:flex-row" action="/">
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Buscar por título o artista"
              className="min-h-12 flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-4 text-base text-white outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:bg-slate-950"
            />
            <button
              type="submit"
              className="min-h-12 rounded-2xl border border-slate-700 px-4 text-sm font-semibold text-white transition hover:border-green-400 hover:text-green-400"
            >
              Buscar
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
