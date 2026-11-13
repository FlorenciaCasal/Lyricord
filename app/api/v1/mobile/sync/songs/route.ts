import { mobileApiError } from "@/lib/mobile-api/errors";
import { getMobileUserId } from "@/lib/mobile-api/request-auth";
import {
  pullMobileSongSyncChanges,
  pushMobileSongSyncChanges,
} from "@/lib/mobile-api/song-sync";

export async function GET(request: Request) {
  const userId = getMobileUserId(request);
  if (!userId) return mobileApiError(401, "UNAUTHORIZED", "Sesion invalida o vencida.");

  try {
    const result = await pullMobileSongSyncChanges(userId, new URL(request.url).searchParams);
    if (!result.success) {
      return mobileApiError(result.status, "INVALID_REQUEST", result.message);
    }

    return Response.json({
      songs: result.songs,
      serverTime: result.serverTime,
      nextCursor: result.nextCursor,
    });
  } catch (error) {
    console.error("Mobile song sync pull API: error inesperado.", { error });
    return mobileApiError(500, "INTERNAL_ERROR", "No pudimos obtener los cambios.");
  }
}

export async function POST(request: Request) {
  const userId = getMobileUserId(request);
  if (!userId) return mobileApiError(401, "UNAUTHORIZED", "Sesion invalida o vencida.");

  try {
    const payload = await request.json().catch(() => null);
    const result = await pushMobileSongSyncChanges(userId, payload);
    if (!result.success) {
      return mobileApiError(result.status, "INVALID_REQUEST", result.message);
    }

    return Response.json({
      results: result.results,
      serverTime: result.serverTime,
    });
  } catch (error) {
    console.error("Mobile song sync push API: error inesperado.", { error });
    return mobileApiError(500, "INTERNAL_ERROR", "No pudimos sincronizar los cambios.");
  }
}
