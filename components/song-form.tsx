"use client";

import Link from "next/link";
import { useActionState, useId, useRef, useState, useTransition } from "react";
import { extractSongTextAction } from "@/app/actions";
import { formatFileSize, OCR_MAX_IMAGE_SIZE_BYTES } from "@/lib/ocr-upload";
import { SubmitButton } from "@/components/submit-button";
import type { SongFormState } from "@/lib/songs";

const initialState: SongFormState = {
  errors: {},
};

type SongFormValues = {
  title: string;
  artist: string;
  key: string;
  versionName: string;
  content: string;
  notes: string;
};

type SongFormProps = {
  action: (state: SongFormState, formData: FormData) => Promise<SongFormState>;
  submitLabel: string;
  initialValues?: SongFormValues;
};

export function SongForm({
  action,
  submitLabel,
  initialValues = {
    title: "",
    artist: "",
    key: "",
    versionName: "",
    content: "",
    notes: "",
  },
}: SongFormProps) {
  const [state, formAction] = useActionState(action, initialState);
  const [content, setContent] = useState(initialValues.content);
  const [ocrMessage, setOcrMessage] = useState<string | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isOcrPending, startOcrTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputId = useId();

  function handleOcrImport() {
    if (!formRef.current) {
      return;
    }

    setOcrMessage(null);
    setOcrError(null);

    const hadExistingContent = content.trim().length > 0;
    const ocrFormData = new FormData(formRef.current);

    startOcrTransition(async () => {
      const result = await extractSongTextAction(ocrFormData);

      if (!result.success) {
        setOcrError(result.error);
        return;
      }

      setContent((currentContent) =>
        currentContent.trim().length > 0
          ? `${currentContent}\n\n${result.text}`
          : result.text,
      );

      setOcrMessage(
        hadExistingContent
          ? "Texto importado y agregado al contenido existente."
          : "Texto importado correctamente en el contenido.",
      );
    });
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-200">Título</span>
          <input
            type="text"
            name="title"
            defaultValue={initialValues.title}
            className="min-h-12 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 text-base text-white outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:bg-slate-950"
            placeholder="Ej. Zamba de mi esperanza"
          />
          {state.errors?.title ? (
            <p className="text-sm text-red-400">{state.errors.title}</p>
          ) : null}
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-200">Artista</span>
          <input
            type="text"
            name="artist"
            defaultValue={initialValues.artist}
            className="min-h-12 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 text-base text-white outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:bg-slate-950"
            placeholder="Opcional"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-200">Tono</span>
          <input
            type="text"
            name="key"
            defaultValue={initialValues.key}
            className="min-h-12 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 text-base text-white outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:bg-slate-950"
            placeholder="Ej. Sol mayor"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-200">Versión</span>
          <input
            type="text"
            name="versionName"
            defaultValue={initialValues.versionName}
            className="min-h-12 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 text-base text-white outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:bg-slate-950"
            placeholder="Ej. Principal, acústica, tono bajo"
          />
        </label>

        <label className="space-y-2 sm:col-span-2">
          <span className="text-sm font-semibold text-slate-200">Notas</span>
          <textarea
            name="notes"
            defaultValue={initialValues.notes}
            rows={4}
            className="w-full rounded-[1.5rem] border border-slate-700 bg-slate-950 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:bg-slate-950"
            placeholder="Comentarios adicionales, estructura o referencias"
          />
        </label>

        <div className="space-y-2 sm:col-span-2">
          <span className="text-sm font-semibold text-slate-200">
            Letra y acordes
          </span>

          <div className="rounded-[1.5rem] border border-dashed border-slate-700 bg-slate-950/70 p-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">
                Importar desde imagen con OCR
              </p>
              <p className="text-sm text-slate-300">
                Subí una imagen JPG o PNG de hasta{" "}
                {formatFileSize(OCR_MAX_IMAGE_SIZE_BYTES)}. El texto detectado
                se agregará al contenido actual sin reemplazarlo.
              </p>
            </div>

            <div className="mt-4 space-y-2">
              <span className="text-sm font-semibold text-slate-200">
                Imagen
              </span>

              <input
                id={fileInputId}
                type="file"
                name="sourceImage"
                accept="image/jpeg,image/jpg,image/png"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setSelectedFileName(file ? file.name : null);
                  setOcrError(null);
                  setOcrMessage(null);
                }}
              />

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label
                  htmlFor={fileInputId}
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-slate-700 px-4 text-sm font-semibold text-white transition hover:border-green-400 hover:text-green-400"
                >
                  Seleccionar imagen
                </label>

                <p className="min-w-0 text-sm text-slate-400">
                  {selectedFileName ? (
                    <span className="block truncate text-slate-300">
                      {selectedFileName}
                    </span>
                  ) : (
                    "No hay ninguna imagen seleccionada."
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleOcrImport}
              disabled={isOcrPending || !selectedFileName}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-green-500 px-4 text-sm font-semibold text-black transition hover:bg-green-400 disabled:cursor-not-allowed disabled:bg-green-700 disabled:text-slate-200 sm:w-auto"
            >
              {isOcrPending ? "Procesando OCR..." : "Extraer texto"}
            </button>

            {ocrError ? (
              <p className="mt-3 rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                {ocrError}
              </p>
            ) : null}
            {ocrMessage ? (
              <p className="mt-3 rounded-2xl border border-green-500/30 bg-green-950/30 px-4 py-3 text-sm text-green-300">
                {ocrMessage}
              </p>
            ) : null}
          </div>

          <textarea
            name="content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={18}
            className="w-full rounded-[1.75rem] border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-[12px] leading-[1.45] text-white outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:bg-slate-950 sm:px-4 sm:py-3 sm:text-base sm:leading-7"
            placeholder="Pegá acá la letra completa con acordes"
          />
          {state.errors?.content ? (
            <p className="text-sm text-red-400">{state.errors.content}</p>
          ) : null}
        </div>
      </div>

      {state.errors?.form ? (
        <p className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {state.errors.form}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <SubmitButton label={submitLabel} />
        <Link
          href="/"
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-slate-700 px-5 text-sm font-semibold text-white transition hover:border-green-400 hover:text-green-400"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
