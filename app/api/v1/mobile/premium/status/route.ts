import { mobileApiError } from "@/lib/mobile-api/errors";
import { getMobileUserId } from "@/lib/mobile-api/request-auth";
import { getPremiumStatusForUser } from "@/lib/premium/entitlements";

export async function GET(request: Request) {
  const userId = getMobileUserId(request);
  if (!userId) return mobileApiError(401, "UNAUTHORIZED", "Sesion invalida o vencida.");

  try {
    const premium = await getPremiumStatusForUser(userId);
    return Response.json(premium);
  } catch (error) {
    console.error("Mobile premium status API: error inesperado.", { error });
    return mobileApiError(500, "INTERNAL_ERROR", "No pudimos obtener el estado Premium.");
  }
}
