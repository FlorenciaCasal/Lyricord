import { mobileApiError } from "@/lib/mobile-api/errors";
import { getMobileUserId } from "@/lib/mobile-api/request-auth";
import {
  createMobileSongVersion,
  isValidSongId,
  listMobileSongVersions,
} from "@/lib/mobile-api/songs";

async function getValidContextId(context: RouteContext<"/api/v1/mobile/songs/[id]/versions">) {
  const { id } = await context.params;
  return isValidSongId(id) ? id : null;
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/mobile/songs/[id]/versions">,
) {
  const userId = getMobileUserId(request);
  if (!userId) return mobileApiError(401, "UNAUTHORIZED", "Sesion invalida o vencida.");

  const id = await getValidContextId(context);
  if (!id) return mobileApiError(400, "INVALID_REQUEST", "ID de cancion invalido.");

  try {
    const versions = await listMobileSongVersions(userId, id);
    if (versions.length === 0) return mobileApiError(404, "NOT_FOUND", "Cancion no encontrada.");
    return Response.json({ versions });
  } catch (error) {
    console.error("Mobile song versions API: error inesperado.", { error });
    return mobileApiError(500, "INTERNAL_ERROR", "No pudimos obtener las versiones.");
  }
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/mobile/songs/[id]/versions">,
) {
  const userId = getMobileUserId(request);
  if (!userId) return mobileApiError(401, "UNAUTHORIZED", "Sesion invalida o vencida.");

  const id = await getValidContextId(context);
  if (!id) return mobileApiError(400, "INVALID_REQUEST", "ID de cancion invalido.");

  try {
    const result = await createMobileSongVersion(userId, id);
    if (!result.success) {
      if (result.reason === "limit-reached") {
        return mobileApiError(422, "VALIDATION_ERROR", "Alcanzaste el limite de canciones para esta beta.");
      }
      return mobileApiError(404, "NOT_FOUND", "Cancion no encontrada.");
    }

    return Response.json({ version: result.version }, { status: 201 });
  } catch (error) {
    console.error("Mobile song version create API: error inesperado.", { error });
    return mobileApiError(500, "INTERNAL_ERROR", "No pudimos crear la version.");
  }
}
