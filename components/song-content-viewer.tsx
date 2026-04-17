"use client";

import { useState } from "react";
import { transposeSongText } from "@/lib/transpose";

type SongContentViewerProps = {
  content: string;
};

function formatSemitones(semitones: number) {
  if (semitones === 0) {
    return "Original";
  }

  return semitones > 0 ? `+${semitones}` : String(semitones);
}

export function SongContentViewer({ content }: SongContentViewerProps) {
  const [semitones, setSemitones] = useState(0);
  const transposedContent = transposeSongText(content, semitones);

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
          Letra y acordes
        </h2>

        <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950 p-1">
          <button
            type="button"
            onClick={() => setSemitones((current) => current - 1)}
            className="inline-flex size-9 items-center justify-center rounded-full border border-slate-700 text-sm font-semibold text-white transition hover:border-green-400 hover:text-green-400"
            aria-label="Bajar medio tono"
          >
            -
          </button>
          <span className="min-w-20 text-center text-sm font-semibold text-slate-200">
            {formatSemitones(semitones)}
          </span>
          <button
            type="button"
            onClick={() => setSemitones((current) => current + 1)}
            className="inline-flex size-9 items-center justify-center rounded-full border border-slate-700 text-sm font-semibold text-white transition hover:border-green-400 hover:text-green-400"
            aria-label="Subir medio tono"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setSemitones(0)}
            className="inline-flex min-h-9 items-center justify-center rounded-full px-3 text-sm font-semibold text-slate-300 transition hover:text-green-400"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="-mx-2 overflow-x-auto rounded-3xl border border-slate-800 bg-slate-950 px-2 py-3 text-[12px] text-slate-100 sm:mx-0 sm:p-6 sm:text-[0.95rem]">
        <pre className="min-w-max whitespace-pre font-mono leading-[1.45] sm:leading-relaxed">
          {transposedContent}
        </pre>
      </div>
    </section>
  );
}
