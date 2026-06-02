"use client";

import Link from "next/link";
import { useState } from "react";

type ResetPasswordFormProps = {
  token?: string;
};

type ResetPasswordResponse = {
  message?: string;
  error?: string;
};

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    setError(null);
    setMessage(null);
    setPending(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          password,
          confirmPassword,
        }),
      });

      const payload = (await response.json()) as ResetPasswordResponse;

      if (!response.ok) {
        setError(payload.error ?? "No pudimos actualizar la contraseña.");
        return;
      }

      setMessage(payload.message ?? "Contraseña actualizada.");
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
          Nueva contraseña
        </h1>
        <p className="text-base text-slate-300">
          Elegí una contraseña nueva para volver a entrar a Lyricord.
        </p>
      </div>

      {!token ? (
        <div className="mt-6 space-y-4">
          <p className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            El link de recuperación no es válido o ya venció. Pedí uno nuevo.
          </p>
          <Link
            href="/forgot-password"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-green-500 px-5 text-sm font-semibold text-black transition hover:bg-green-400"
          >
            Pedir un nuevo link
          </Link>
        </div>
      ) : (
        <form action={handleSubmit} className="mt-6 space-y-4">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-200">
              Nueva contraseña
            </span>
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              className="min-h-12 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 text-base text-white outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:bg-slate-950"
              placeholder="********"
              required
            />
          </label>

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

          {error ? (
            <p className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              {error}
            </p>
          ) : null}

          {message ? (
            <p className="rounded-2xl border border-green-500/40 bg-green-950/40 px-4 py-3 text-sm text-green-200">
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending || Boolean(message)}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-green-500 px-5 text-sm font-semibold text-black transition hover:bg-green-400 disabled:cursor-not-allowed disabled:bg-green-700 disabled:text-slate-200"
          >
            {pending ? "Actualizando..." : "Actualizar contraseña"}
          </button>
        </form>
      )}

      <p className="mt-5 text-sm text-slate-300">
        <Link
          href="/login"
          className="font-semibold text-green-400 hover:text-green-300"
        >
          Volver a iniciar sesión
        </Link>
      </p>
    </section>
  );
}
