"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";

type AuthFormProps = {
  mode: "login" | "register";
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isRegister = mode === "register";

  async function handleSubmit(formData: FormData) {
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");
    const acceptTerms = formData.get("acceptTerms") === "on";

    setError(null);
    setPending(true);

    try {
      if (isRegister) {
        const response = await fetch("/api/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
            confirmPassword,
            acceptTerms,
          }),
        });

        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          setError(payload.error ?? "No pudimos crear la cuenta.");
          return;
        }
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: "/",
      });

      if (result?.error) {
        setError("Email o contraseña incorrectos.");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Ocurrió un error. Intentá de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-slate-700 bg-slate-900 p-6 shadow-sm shadow-black/20 sm:p-8">
      <div className="space-y-2">
        <h1 className="font-heading text-4xl text-white">
          {isRegister ? "Crear cuenta" : "Iniciar sesión"}
        </h1>
        <p className="text-base text-slate-300">
          {isRegister
            ? "Registrate para guardar y editar tus canciones."
            : "Entrá para ver y editar tus canciones."}
        </p>
      </div>

      <form action={handleSubmit} className="mt-6 space-y-4">
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-200">Email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            className="min-h-12 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 text-base text-white outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:bg-slate-950"
            placeholder="tu@email.com"
            required
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-200">
            Contraseña
          </span>
          <input
            type="password"
            name="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            className="min-h-12 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 text-base text-white outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:bg-slate-950"
            placeholder="********"
            required
          />
        </label>

        {isRegister ? (
          <>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-200">
                Repetir contraseña
              </span>
              <input
                type="password"
                name="confirmPassword"
                autoComplete="new-password"
                className="min-h-12 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 text-base text-white outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:bg-slate-950"
                placeholder="********"
                required
              />
            </label>

            <label className="flex gap-3 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm leading-6 text-slate-300">
              <input
                type="checkbox"
                name="acceptTerms"
                className="mt-1 size-4 shrink-0 accent-green-500"
                required
              />
              <span>
                Acepto los{" "}
                <Link
                  href="/terms"
                  className="font-semibold text-green-400 hover:text-green-300"
                >
                  terminos de uso
                </Link>
                , la{" "}
                <Link
                  href="/privacy"
                  className="font-semibold text-green-400 hover:text-green-300"
                >
                  politica de privacidad
                </Link>{" "}
                y entiendo que soy responsable por el contenido que cargo.
              </span>
            </label>
          </>
        ) : null}

        {error ? (
          <p className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-green-500 px-5 text-sm font-semibold text-black transition hover:bg-green-400 disabled:cursor-not-allowed disabled:bg-green-700 disabled:text-slate-200"
        >
          {pending
            ? "Procesando..."
            : isRegister
              ? "Crear cuenta"
              : "Ingresar"}
        </button>
      </form>

      <p className="mt-5 text-sm text-slate-300">
        {isRegister ? "¿Ya tenés cuenta?" : "¿No tenés cuenta?"}{" "}
        <Link
          href={isRegister ? "/login" : "/register"}
          className="font-semibold text-green-400 hover:text-green-300"
        >
          {isRegister ? "Iniciar sesión" : "Crear cuenta"}
        </Link>
      </p>

      <p className="mt-4 text-xs leading-5 text-slate-500">
        Uso responsable: Lyricord no provee letras oficiales. Ver{" "}
        <Link href="/copyright" className="text-slate-300 hover:text-green-400">
          copyright y denuncias
        </Link>
        .
      </p>
    </section>
  );
}
