import { createSongAction } from "@/app/actions";
import { SongForm } from "@/components/song-form";

export default function NewSongPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-6 sm:px-6 sm:py-8">
      <section className="rounded-[2rem] border border-slate-700 bg-slate-900 p-5 shadow-sm shadow-black/20 sm:p-8">
        <div className="mb-6 space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-400">
            Nueva canción
          </p>
          <h1 className="font-heading text-4xl text-white">Cargar canción</h1>
          <p className="text-base text-slate-300">
            Completá los datos básicos y pegá la letra con acordes en el área
            principal.
          </p>
        </div>

        <SongForm action={createSongAction} submitLabel="Guardar canción" />
      </section>
    </main>
  );
}
