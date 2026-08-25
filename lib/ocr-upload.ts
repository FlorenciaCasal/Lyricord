export const OCR_ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
] as const;

export const OCR_MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

const OCR_ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png"] as const;

export function formatFileSize(sizeInBytes: number) {
  const sizeInMb = sizeInBytes / (1024 * 1024);
  return `${sizeInMb.toFixed(0)} MB`;
}

export function validateOcrImageFile(file: File) {
  if (!file || file.size === 0) {
    return "Elegí una imagen JPG o PNG para extraer el texto.";
  }

  const normalizedType = file.type.toLowerCase();
  const normalizedName = file.name.toLowerCase();
  const hasAllowedType = OCR_ALLOWED_IMAGE_TYPES.includes(
    normalizedType as (typeof OCR_ALLOWED_IMAGE_TYPES)[number],
  );
  const hasAllowedExtension = OCR_ALLOWED_IMAGE_EXTENSIONS.some((extension) =>
    normalizedName.endsWith(extension),
  );

  if ((normalizedType && !hasAllowedType) || (!normalizedType && !hasAllowedExtension)) {
    return "La imagen debe ser JPG o PNG. Si tu iPhone la guarda como HEIC/HEIF, exportala o convertila a JPG antes de usar OCR.";
  }

  if (file.size > OCR_MAX_IMAGE_SIZE_BYTES) {
    return `La imagen supera el límite de ${formatFileSize(
      OCR_MAX_IMAGE_SIZE_BYTES,
    )}.`;
  }

  return null;
}
