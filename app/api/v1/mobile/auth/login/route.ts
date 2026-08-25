import { authenticateMobileCredentials, createMobileSession } from "@/lib/mobile-api/auth";
import { mobileApiError } from "@/lib/mobile-api/errors";
import { getPremiumStatusForUser } from "@/lib/premium/entitlements";
import { checkRateLimit } from "@/lib/rate-limit";

const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function getClientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
}

export async function POST(request: Request) {
  try {
    const rateLimit = await checkRateLimit({
      type: "mobile-login",
      key: getClientIp(request),
      limit: LOGIN_LIMIT,
      windowMs: LOGIN_WINDOW_MS,
    });
    if (!rateLimit.allowed) {
      return mobileApiError(429, "RATE_LIMITED", "Demasiados intentos. Probá de nuevo más tarde.");
    }

    const body = (await request.json().catch(() => null)) as
      | { email?: unknown; password?: unknown }
      | null;
    if (!body || typeof body.email !== "string" || typeof body.password !== "string") {
      return mobileApiError(400, "INVALID_REQUEST", "Email y contraseña son obligatorios.");
    }
    if (body.email.length > 254 || body.password.length > 128) {
      return mobileApiError(400, "INVALID_REQUEST", "Los datos enviados no son válidos.");
    }

    const user = await authenticateMobileCredentials(body.email, body.password);
    if (!user) {
      return mobileApiError(401, "INVALID_CREDENTIALS", "Email o contraseña incorrectos.");
    }

    const [tokens, premium] = await Promise.all([
      createMobileSession(user.id),
      getPremiumStatusForUser(user.id),
    ]);
    return Response.json({ user, premium, ...tokens });
  } catch (error) {
    console.error("Mobile login API: error inesperado.", { error });
    return mobileApiError(500, "INTERNAL_ERROR", "No pudimos iniciar sesión.");
  }
}
