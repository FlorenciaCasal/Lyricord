"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  label: string;
};

export function SubmitButton({ label }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-12 items-center justify-center rounded-full bg-green-500 px-5 text-sm font-semibold text-black transition hover:bg-green-400 disabled:cursor-not-allowed disabled:bg-green-700 disabled:text-slate-200"
    >
      {pending ? "Guardando..." : label}
    </button>
  );
}
