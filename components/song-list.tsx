import Link from "next/link";
import { formatSongDate, type SongListItem } from "@/lib/songs";

type SongListProps = {
  songs: SongListItem[];
};

export function SongList({ songs }: SongListProps) {
  return (
    <div className="grid gap-4">
      {songs.map((song) => (
        <article
          key={song.id}
          className="rounded-[1.75rem] border border-slate-700 bg-slate-900 p-5 shadow-sm shadow-black/20 transition hover:border-green-500/60 hover:shadow-md"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <h2 className="font-heading text-2xl text-white">
                {song.title}
              </h2>
              <div className="flex flex-wrap gap-2 text-sm text-slate-300">
                {song.artist ? <span>Artista: {song.artist}</span> : null}
                {song.key ? <span>Tono: {song.key}</span> : null}
                <span>Actualizada: {formatSongDate(song.updatedAt)}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <Link
                href={`/songs/${song.id}`}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-700 px-4 text-sm font-semibold text-white transition hover:border-green-400 hover:text-green-400"
              >
                Ver
              </Link>
              <Link
                href={`/songs/${song.id}/edit`}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-green-500 px-4 text-sm font-semibold text-black transition hover:bg-green-400"
              >
                Editar
              </Link>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
