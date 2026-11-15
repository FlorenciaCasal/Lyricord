import { extractTextFromImage } from "@/lib/google-vision";
import { mobileApiError } from "@/lib/mobile-api/errors";
import { getMobileUserId } from "@/lib/mobile-api/request-auth";
import { validateOcrImageFile } from "@/lib/ocr-upload";
import { executeOcrWithReservedQuota } from "@/lib/premium/ocr-execution";
import { releaseOcrUsage, reserveOcrUsage } from "@/lib/usage";

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

    const { usage, result } = await executeOcrWithReservedQuota({
      reserve: () => reserveOcrUsage(userId, request.headers.get("x-musum-operation-id")),
      release: (operationKey) => releaseOcrUsage(userId, operationKey),
      extract: () => extractTextFromImage(image),
    });
    if (!usage.allowed) {
      return mobileApiError(
        429,
        "LIMIT_REACHED",
        `Ya usaste las ${usage.totalLimit} extracciones gratuitas de tu cuenta. Premium incluye extracciones ilimitadas.`,
      );
    }

    if (!result) {
      return mobileApiError(500, "INTERNAL_ERROR", "No pudimos extraer texto de la imagen.");
    }
    if (!result.success) {
      return mobileApiError(422, "VALIDATION_ERROR", result.error);
    }

    return Response.json({
      text: result.text,
      usage: {
        remainingTotal: usage.remainingTotal,
        remainingToday: usage.remainingTotal,
      },
    });
  } catch (error) {
    console.error("Mobile OCR API: error inesperado.", { error });
    return mobileApiError(500, "INTERNAL_ERROR", "No pudimos extraer texto de la imagen.");
  }
}
