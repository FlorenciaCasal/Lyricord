export const OCR_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
export const OCR_IMAGE_MAX_DIMENSION = 2400;
export const OCR_IMAGE_COMPRESSION_LEVELS = [0.82, 0.68, 0.52] as const;

export const OCR_IMAGE_TOO_LARGE_MESSAGE =
  "Esta imagen es demasiado grande para importarla. Probá con una captura más chica.";

export function getOcrResizeDimensions(width: number, height: number) {
  if (width <= 0 || height <= 0 || Math.max(width, height) <= OCR_IMAGE_MAX_DIMENSION) {
    return null;
  }

  return width >= height
    ? { width: OCR_IMAGE_MAX_DIMENSION }
    : { height: OCR_IMAGE_MAX_DIMENSION };
}

export function validateOcrUploadSize(size: number) {
  return size > 0 && size <= OCR_UPLOAD_MAX_BYTES
    ? null
    : OCR_IMAGE_TOO_LARGE_MESSAGE;
}
