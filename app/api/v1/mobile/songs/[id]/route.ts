import { mobileApiError } from "@/lib/mobile-api/errors";
import { getMobileUserId } from "@/lib/mobile-api/request-auth";
import {
  deleteMobileSong,
  getMobileSong,
  isValidSongId,
  updateMobileSong,
} from "@/lib/mobile-api/songs";
import type { SongInputPayload } from "@/lib/songs";

async function getValidContextId(context: RouteContext<"/api/v1/mobile/songs/[id]">) {
  const { id } = await context.params;
  return isValidSongId(id) ? id : null;
}

export async function GET(request: Request, context: RouteContext<"/api/v1/mobile/songs/[id]">) {
  const userId = getMobileUserId(request);
  if (!userId) return mobileApiError(401, "UNAUTHORIZED", "Sesion invalida o vencida.");

  const id = await getValidContextId(context);
  if (!id) return mobileApiError(400, "INVALID_REQUEST", "ID de cancion invalido.");

  try {
    const song = await getMobileSong(userId, id);
    if (!song) return mobileApiError(404, "NOT_FOUND", "Cancion no encontrada.");
    return Response.json({ song });
  } catch (error) {
    console.error("Mobile song detail API: error inesperado.", { error });
    return mobileApiError(500, "INTERNAL_ERROR", "No pudimos obtener la cancion.");
  }
}

export async function PATCH(request: Request, context: RouteContext<"/api/v1/mobile/songs/[id]">) {
  const userId = getMobileUserId(request);
  if (!userId) return mobileApiError(401, "UNAUTHORIZED", "Sesion invalida o vencida.");

  const id = await getValidContextId(context);
  if (!id) return mobileApiError(400, "INVALID_REQUEST", "ID de cancion invalido.");

  try {
    const payload = (await request.json().catch(() => null)) as SongInputPayload | null;
    if (!payload || typeof payload !== "object") {
      return mobileApiError(400, "INVALID_REQUEST", "Los datos enviados no son validos.");
    }

    const result = await updateMobileSong(id, userId, payload);
    if (!result.success) {
      if (result.errors.form) {
        return mobileApiError(404, "NOT_FOUND", result.errors.form);
      }
      return Response.json({ errors: result.errors }, { status: 422 });
    }

    return Response.json({ song: result.song });
  } catch (error) {
    console.error("Mobile song update API: error inesperado.", { error });
    return mobileApiError(500, "INTERNAL_ERROR", "No pudimos actualizar la cancion.");
  }
}

export async function DELETE(request: Request, context: RouteContext<"/api/v1/mobile/songs/[id]">) {
  const userId = getMobileUserId(request);
  if (!userId) return mobileApiError(401, "UNAUTHORIZED", "Sesion invalida o vencida.");

  const id = await getValidContextId(context);
  if (!id) return mobileApiError(400, "INVALID_REQUEST", "ID de cancion invalido.");

  try {
    const deleted = await deleteMobileSong(id, userId);
    if (!deleted) return mobileApiError(404, "NOT_FOUND", "Cancion no encontrada.");
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Mobile song delete API: error inesperado.", { error });
    return mobileApiError(500, "INTERNAL_ERROR", "No pudimos borrar la cancion.");
  }
}
