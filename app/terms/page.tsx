import { BackButton } from "@/components/back-button";

export default function TermsPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-10 sm:px-6">
      <section className="rounded-[2rem] border border-slate-700 bg-slate-900 p-6 shadow-sm shadow-black/20 sm:p-8">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-400">
          Lyricord
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-white">
          Términos de uso
        </h1>
        <div className="mt-6 space-y-5 text-sm leading-7 text-slate-300">
          <p>
            Lyricord es una herramienta en beta para organizar un cancionero
            personal. El servicio permite guardar, editar e importar contenido
            provisto por cada usuario.
          </p>
          <p>
            Al usar Lyricord, declaras que tenes los derechos, permisos,
            licencias o una base legal suficiente para cargar, pegar o procesar
            el contenido que guardas en tu cuenta.
          </p>
          <p>
            No esta permitido usar Lyricord para almacenar, procesar o
            distribuir contenido que infrinja derechos de autor, marcas,
            privacidad u otros derechos de terceros.
          </p>
          <p>
            El contenido cargado por usuarios es responsabilidad de cada
            usuario. Lyricord no provee letras oficiales ni garantiza derechos
            sobre el contenido guardado por las cuentas.
          </p>
          <p>
            Podemos remover contenido, limitar funciones o suspender cuentas si
            detectamos abuso, reclamos razonables, riesgos técnicos o uso
            contrario a estos términos.
          </p>
          <p>
            Como beta publica, Lyricord puede cambiar, tener interrupciones o
            limitar funciones para mantener el servicio estable y seguro.
          </p>
        </div>
        <BackButton
          fallbackHref="/register"
          className="mt-8 inline-flex min-h-11 items-center justify-center rounded-full bg-green-500 px-5 text-sm font-semibold text-black transition hover:bg-green-400"
        >
          Volver
        </BackButton>
      </section>
    </main>
  );
}
