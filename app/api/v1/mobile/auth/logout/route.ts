import { revokeMobileSession } from "@/lib/mobile-api/auth";
import { mobileApiError } from "@/lib/mobile-api/errors";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { refreshToken?: unknown }
      | null;
    if (!body || typeof body.refreshToken !== "string" || body.refreshToken.length > 256) {
      return mobileApiError(400, "INVALID_REQUEST", "Refresh token inválido.");
    }
    await revokeMobileSession(body.refreshToken);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Mobile logout API: error inesperado.", { error });
    return mobileApiError(500, "INTERNAL_ERROR", "No pudimos cerrar la sesión.");
  }
}
