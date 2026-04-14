import { BackButton } from "@/components/back-button";

const contactEmail = "contacto.lyricord@gmail.com";

export default function CopyrightPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-10 sm:px-6">
      <section className="rounded-[2rem] border border-slate-700 bg-slate-900 p-6 shadow-sm shadow-black/20 sm:p-8">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-400">
          Lyricord
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-white">
          Copyright y denuncias
        </h1>
        <div className="mt-6 space-y-5 text-sm leading-7 text-slate-300">
          <p>
            Lyricord no es una biblioteca oficial de letras ni provee contenido
            musical propio. El contenido es cargado, pegado o importado por cada
            usuario en su cuenta.
          </p>
          <p>
            Si crees que contenido usado en Lyricord infringe tus derechos,
            escribinos a{" "}
            <a
              href={`mailto:${contactEmail}`}
              className="font-semibold text-green-400 hover:text-green-300"
            >
              {contactEmail}
            </a>{" "}
            para que podamos revisar el reclamo.
          </p>
          <p>
            Inclui, cuando sea posible, la obra afectada, una descripcion del
            contenido presuntamente infractor, informacion suficiente para
            ubicarlo, tus datos de contacto y una declaracion de buena fe sobre
            el reclamo.
          </p>
          <p>
            Podemos remover o restringir contenido y cuentas cuando recibimos un
            reclamo razonable o detectamos uso indebido.
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
