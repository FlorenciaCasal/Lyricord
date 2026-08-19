import { mobileApiError } from "@/lib/mobile-api/errors";
import { getMobileUserId } from "@/lib/mobile-api/request-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const userId = getMobileUserId(request);
  if (!userId) return mobileApiError(401, "UNAUTHORIZED", "Sesión inválida o vencida.");

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) return mobileApiError(401, "UNAUTHORIZED", "La cuenta ya no está disponible.");
    return Response.json({ user });
  } catch (error) {
    console.error("Mobile me API: error inesperado.", { error });
    return mobileApiError(500, "INTERNAL_ERROR", "No pudimos obtener la cuenta.");
  }
}
