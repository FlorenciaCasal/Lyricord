"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-4 py-10 sm:px-6">
      <section className="rounded-[2rem] border border-slate-700 bg-slate-900 p-8 text-center shadow-sm shadow-black/20">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-400">
          Lyricord
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-white">
          Algo no salio bien
        </h1>
        <p className="mt-3 text-base leading-7 text-slate-300">
          Proba de nuevo. Si el problema sigue, volve al inicio o escribinos
          para revisarlo.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-green-500 px-5 text-sm font-semibold text-black transition hover:bg-green-400"
        >
          Reintentar
        </button>
      </section>
    </main>
  );
}
