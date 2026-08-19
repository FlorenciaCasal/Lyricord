import { mobileApiError } from "@/lib/mobile-api/errors";
import { getMobileUserId } from "@/lib/mobile-api/request-auth";
import { createMobileSong, listMobileSongs } from "@/lib/mobile-api/songs";
import type { SongInputPayload } from "@/lib/songs";

export async function GET(request: Request) {
  const userId = getMobileUserId(request);
  if (!userId) return mobileApiError(401, "UNAUTHORIZED", "Sesion invalida o vencida.");

  try {
    const songs = await listMobileSongs(userId);
    return Response.json({ songs });
  } catch (error) {
    console.error("Mobile songs API: error inesperado.", { error });
    return mobileApiError(500, "INTERNAL_ERROR", "No pudimos obtener las canciones.");
  }
}

export async function POST(request: Request) {
  const userId = getMobileUserId(request);
  if (!userId) return mobileApiError(401, "UNAUTHORIZED", "Sesion invalida o vencida.");

  try {
    const payload = (await request.json().catch(() => null)) as SongInputPayload | null;
    if (!payload || typeof payload !== "object") {
      return mobileApiError(400, "INVALID_REQUEST", "Los datos enviados no son validos.");
    }

    const result = await createMobileSong(userId, payload);
    if (!result.success) {
      return Response.json({ errors: result.errors }, { status: 422 });
    }

    return Response.json({ song: result.song }, { status: 201 });
  } catch (error) {
    console.error("Mobile song create API: error inesperado.", { error });
    return mobileApiError(500, "INTERNAL_ERROR", "No pudimos crear la cancion.");
  }
}
