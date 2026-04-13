"use client";

import { deleteSongAction } from "@/app/actions";

type DeleteSongButtonProps = {
  id: string;
  title: string;
};

export function DeleteSongButton({ id, title }: DeleteSongButtonProps) {
  return (
    <form
      action={deleteSongAction}
      className="w-full sm:w-24"
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `¿Querés eliminar "${title}"? Esta acción no se puede deshacer.`,
        );

        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-slate-700 px-5 text-sm font-semibold text-white transition hover:border-green-400 hover:text-green-400"
      >
        Eliminar
      </button>
    </form>
  );
}
