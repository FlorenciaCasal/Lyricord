import { notFound } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { updateSongAction } from "@/app/actions";
import { SongForm } from "@/components/song-form";
import { getSongById } from "@/lib/songs";

type EditSongPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditSongPage({ params }: EditSongPageProps) {
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

  const boundAction = updateSongAction.bind(null, song.id);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-6 sm:px-6 sm:py-8">
      <section className="rounded-[2rem] border border-slate-700 bg-slate-900 py-5 px-2 shadow-sm shadow-black/20 sm:py-8 sm:px-8">
        <div className="mb-6 space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-400">
            Edición
          </p>
          <h1 className="font-heading text-4xl text-white">Editar canción</h1>
          <p className="text-base text-slate-300">
            Actualizá el título, el tono o el contenido completo cuando haga
            falta.
          </p>
        </div>

        <SongForm
          action={boundAction}
          submitLabel="Guardar cambios"
          initialValues={{
            title: song.title,
            artist: song.artist ?? "",
            key: song.key ?? "",
            versionName: song.versionName ?? "",
            content: song.content,
            notes: song.notes ?? "",
          }}
        />
      </section>
    </main>
  );
}
