"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  extractTextFromImage,
  type OcrExtractionResult,
} from "@/lib/google-vision";
import { getAuthSession } from "@/lib/auth";
import { validateOcrImageFile } from "@/lib/ocr-upload";
import {
  createSong,
  createSongVersion,
  deleteSong,
  getSongById,
  type SongFormState,
  updateSong,
} from "@/lib/songs";

async function requireUserId() {
  const session = await getAuthSession();
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  return userId;
}

export async function createSongAction(
  _prevState: SongFormState,
  formData: FormData,
): Promise<SongFormState> {
  const userId = await requireUserId();
  const result = await createSong(userId, formData);

  if (!result.success) {
    return result;
  }

  revalidatePath("/");
  redirect(`/songs/${result.song.id}`);
}

export async function updateSongAction(
  id: string,
  _prevState: SongFormState,
  formData: FormData,
): Promise<SongFormState> {
  const userId = await requireUserId();
  const existingSong = await getSongById(id, userId);

  if (!existingSong) {
    return {
      errors: {
        form: "La canción que intentás editar no existe.",
      },
    };
  }

  const result = await updateSong(id, userId, formData);

  if (!result.success) {
    return result;
  }

  revalidatePath("/");
  revalidatePath(`/songs/${id}`);
  redirect(`/songs/${id}`);
}

export async function extractSongTextAction(
  formData: FormData,
): Promise<OcrExtractionResult> {
  await requireUserId();

  const image = formData.get("sourceImage");

  if (!(image instanceof File)) {
    return {
      success: false,
      error: "Elegí una imagen JPG o PNG para extraer el texto.",
    };
  }

  const validationError = validateOcrImageFile(image);

  if (validationError) {
    return {
      success: false,
      error: validationError,
    };
  }

  return extractTextFromImage(image);
}

export async function createSongVersionAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");

  if (!id) {
    return;
  }

  const version = await createSongVersion(id, userId);

  if (!version) {
    return;
  }

  revalidatePath("/");
  revalidatePath(`/songs/${id}`);
  redirect(`/songs/${version.id}/edit`);
}

export async function deleteSongAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");

  if (!id) {
    return;
  }

  await deleteSong(id, userId);
  revalidatePath("/");
  redirect("/");
}
