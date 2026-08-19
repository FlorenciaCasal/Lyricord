import { extractTextFromImage } from "@/lib/google-vision";
import { mobileApiError } from "@/lib/mobile-api/errors";
import { getMobileUserId } from "@/lib/mobile-api/request-auth";
import { validateOcrImageFile } from "@/lib/ocr-upload";
import { getOcrUsageStatus, OCR_DAILY_LIMIT, recordOcrUsage } from "@/lib/usage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const userId = getMobileUserId(request);
  if (!userId) return mobileApiError(401, "UNAUTHORIZED", "Sesion invalida o vencida.");

  try {
    const formData = (await request.formData().catch(() => null)) as FormData | null;
    const image = formData?.get("sourceImage");

    if (!(image instanceof File)) {
      return mobileApiError(400, "INVALID_REQUEST", "Elegi una imagen JPG o PNG para extraer el texto.");
    }

    const validationError = validateOcrImageFile(image);
    if (validationError) {
      return mobileApiError(400, "INVALID_REQUEST", validationError);
    }

    const usageStatus = await getOcrUsageStatus(userId);
    if (!usageStatus.allowed) {
      return mobileApiError(
        429,
        "RATE_LIMITED",
        `Alcanzaste el limite diario de ${OCR_DAILY_LIMIT} usos de OCR para esta beta.`,
      );
    }

    await recordOcrUsage(userId);
    const result = await extractTextFromImage(image);
    if (!result.success) {
      return mobileApiError(422, "VALIDATION_ERROR", result.error);
    }

    return Response.json({
      text: result.text,
      usage: {
        remainingToday: Math.max(0, usageStatus.remainingToday - 1),
      },
    });
  } catch (error) {
    console.error("Mobile OCR API: error inesperado.", { error });
    return mobileApiError(500, "INTERNAL_ERROR", "No pudimos extraer texto de la imagen.");
  }
}
