import type { Metadata } from "next";
import Link from "next/link";
import { BackButton } from "@/components/back-button";
import {
  CURRENT_SUPPORT_EMAIL,
  SUPPORT_FAQS,
  SUPPORT_LEGAL_LINKS,
} from "@/lib/support-content";

export const metadata: Metadata = {
  title: "Soporte de Musum",
  description: "Ayuda y contacto para usar Musum.",
};

export default function SupportPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-10 sm:px-6">
      <section className="rounded-[2rem] border border-slate-700 bg-slate-900 p-6 shadow-sm shadow-black/20 sm:p-8">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-400">
          Musum
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-white">Soporte</h1>
        <p className="mt-4 text-base leading-7 text-slate-300">
          Encontrá respuestas rápidas para organizar, importar y respaldar tu
          cancionero.
        </p>

        <dl className="mt-8 space-y-6">
          {SUPPORT_FAQS.map((item) => (
            <div key={item.question}>
              <dt className="text-base font-semibold text-white">
                {item.question}
              </dt>
              <dd className="mt-2 text-sm leading-7 text-slate-300">
                {item.answer}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 rounded-2xl border border-slate-700 bg-slate-950 p-5">
          <h2 className="text-lg font-semibold text-white">¿Necesitás ayuda?</h2>
          <p className="mt-2 text-sm leading-7 text-slate-300">
            Mientras terminamos de habilitar el nuevo correo de Musum, podés
            escribirnos a{" "}
            <a
              href={`mailto:${CURRENT_SUPPORT_EMAIL}`}
              className="font-semibold text-green-400 hover:text-green-300"
            >
              {CURRENT_SUPPORT_EMAIL}
            </a>
            .
          </p>
        </div>

        <nav
          aria-label="Información legal"
          className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-sm"
        >
          {SUPPORT_LEGAL_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-medium text-slate-300 underline decoration-slate-600 underline-offset-4 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <BackButton
          fallbackHref="/"
          className="mt-8 inline-flex min-h-11 items-center justify-center rounded-full bg-green-500 px-5 text-sm font-semibold text-black transition hover:bg-green-400"
        >
          Volver
        </BackButton>
      </section>
    </main>
  );
}
