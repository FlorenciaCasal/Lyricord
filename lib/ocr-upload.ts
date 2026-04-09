export const OCR_ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
] as const;

export const OCR_MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export function formatFileSize(sizeInBytes: number) {
  const sizeInMb = sizeInBytes / (1024 * 1024);
  return `${sizeInMb.toFixed(0)} MB`;
}

export function validateOcrImageFile(file: File) {
  if (!file || file.size === 0) {
    return "Elegí una imagen JPG o PNG para extraer el texto.";
  }

  if (!OCR_ALLOWED_IMAGE_TYPES.includes(file.type as (typeof OCR_ALLOWED_IMAGE_TYPES)[number])) {
    return "La imagen debe ser JPG o PNG.";
  }

  if (file.size > OCR_MAX_IMAGE_SIZE_BYTES) {
    return `La imagen supera el límite de ${formatFileSize(
      OCR_MAX_IMAGE_SIZE_BYTES,
    )}.`;
  }

  return null;
}
