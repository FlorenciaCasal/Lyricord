import { BackButton } from "@/components/back-button";

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-10 sm:px-6">
      <section className="rounded-[2rem] border border-slate-700 bg-slate-900 p-6 shadow-sm shadow-black/20 sm:p-8">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-400">
          Lyricord
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-white">
          Política de privacidad
        </h1>
        <div className="mt-6 space-y-5 text-sm leading-7 text-slate-300">
          <p>
            Para crear y usar una cuenta guardamos tu email, un hash de tu
            contraseña, tus canciones, notas, versiones y datos técnicos
            necesarios para operar el servicio.
          </p>
          <p>
            Usamos esos datos para autenticarte, guardar tu cancionero, procesar
            acciones solicitadas por vos, prevenir abuso y mantener la app.
          </p>
          <p>
            Cuando usas OCR, la imagen seleccionada se envía a un proveedor
            externo de procesamiento de imágenes para extraer texto. No subas
            imágenes con informacion sensible o contenido que no estes
            autorizado a procesar.
          </p>
          <p>
            No vendemos tus datos personales. Podemos usar proveedores de
            infraestructura, base de datos, autenticación, hosting, logs y OCR
            para operar Lyricord.
          </p>
          <p>
            Podemos conservar logs técnicos minimos para seguridad, diagnóstico
            y prevención de abuso. Evitamos registrar secretos o credenciales.
          </p>
          <p>
            Para pedir baja, corrección o eliminación de datos, escribinos al
            email de contacto publicado en la app o en el dominio del servicio.
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
