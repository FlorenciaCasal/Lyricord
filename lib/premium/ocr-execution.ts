import type { OcrExtractionResult } from "@/lib/google-vision";
import type { OcrQuotaReservation } from "@/lib/premium/ocr-quota";

export type PersistedOcrReservation = OcrQuotaReservation & {
  operationKey: string;
};

export async function executeOcrWithReservedQuota(input: {
  reserve: () => Promise<PersistedOcrReservation>;
  release: (operationKey: string) => Promise<void>;
  extract: () => Promise<OcrExtractionResult>;
}) {
  const usage = await input.reserve();
  if (!usage.allowed) return { usage, result: null };

  const releaseNewReservation = async () => {
    if (usage.totalLimit !== null && !usage.alreadyReserved) {
      await input.release(usage.operationKey);
    }
  };

  try {
    const result = await input.extract();
    if (!result.success) await releaseNewReservation();
    return { usage, result };
  } catch (error) {
    await releaseNewReservation();
    throw error;
  }
}
