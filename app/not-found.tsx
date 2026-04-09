import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-4 py-10 sm:px-6">
      <section className="rounded-[2rem] border border-slate-700 bg-slate-900 p-8 text-center shadow-sm shadow-black/20">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-400">
          404
        </p>
        <h1 className="mt-3 font-heading text-4xl text-white">
          Canción no encontrada
        </h1>
        <p className="mt-3 text-base text-slate-300">
          La canción que buscás no existe o fue eliminada.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-full bg-green-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-green-400"
        >
          Volver al inicio
        </Link>
      </section>
    </main>
  );
}
