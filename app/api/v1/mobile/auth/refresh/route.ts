import { rotateMobileSession } from "@/lib/mobile-api/auth";
import { mobileApiError } from "@/lib/mobile-api/errors";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { refreshToken?: unknown }
      | null;
    if (!body || typeof body.refreshToken !== "string" || body.refreshToken.length > 256) {
      return mobileApiError(400, "INVALID_REQUEST", "Refresh token inválido.");
    }

    const tokens = await rotateMobileSession(body.refreshToken);
    if (!tokens) {
      return mobileApiError(401, "UNAUTHORIZED", "La sesión venció. Iniciá sesión nuevamente.");
    }
    return Response.json(tokens);
  } catch (error) {
    console.error("Mobile refresh API: error inesperado.", { error });
    return mobileApiError(500, "INTERNAL_ERROR", "No pudimos renovar la sesión.");
  }
}
