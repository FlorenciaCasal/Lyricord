import Link from "next/link";
import { formatSongDate, type SongListItem } from "@/lib/songs";

type SongListProps = {
  songs: SongListItem[];
};

export function SongList({ songs }: SongListProps) {
  return (
    <div className="grid min-w-0 gap-4">
      {songs.map((song) => {
        const summary = [song.artist, song.versionName, song.key]
          .filter(Boolean)
          .join(" - ");

        return (
          <article
            key={song.id}
            className="min-w-0 overflow-hidden rounded-[1.75rem] border border-slate-700 bg-slate-900 shadow-sm shadow-black/20 transition hover:border-green-500/60 hover:shadow-md"
          >
            <details className="group min-w-0">
              <summary className="flex min-w-0 cursor-pointer list-none items-center justify-between gap-4 p-5">
                <div className="min-w-0 space-y-1">
                  <h2 className="truncate text-2xl font-semibold tracking-[-0.03em] text-white">
                    {song.title}
                  </h2>
                  <p className="truncate text-sm text-slate-400">
                    {summary || "Sin datos adicionales"}
                  </p>
                </div>
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-slate-700 text-slate-300 transition group-open:rotate-180 group-hover:border-green-400 group-hover:text-green-400">
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
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
              </summary>

              <div className="border-t border-slate-800 px-5 pb-5 pt-4">
                <div className="flex flex-wrap gap-2 text-sm text-slate-300">
                  {song.artist ? <span>Artista: {song.artist}</span> : null}
                  {song.versionName ? (
                    <span>Versión: {song.versionName}</span>
                  ) : null}
                  {song.key ? <span>Tono: {song.key}</span> : null}
                  <span>Actualizada: {formatSongDate(song.updatedAt)}</span>
                </div>

                <div className="mt-4 flex gap-3">
                  <Link
                    href={`/songs/${song.id}`}
                    className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-slate-700 px-4 text-sm font-semibold text-white transition hover:border-green-400 hover:text-green-400 sm:flex-none"
                  >
                    Ver
                  </Link>
                  <Link
                    href={`/songs/${song.id}/edit`}
                    className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-green-500 px-4 text-sm font-semibold text-black transition hover:bg-green-400 sm:flex-none"
                  >
                    Editar
                  </Link>
                </div>
              </div>
            </details>
          </article>
        );
      })}
    </div>
  );
}
