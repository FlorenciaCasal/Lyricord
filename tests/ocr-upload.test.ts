import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatFileSize,
  validateOcrImageFile,
  OCR_MAX_IMAGE_SIZE_BYTES,
} from "../lib/ocr-upload.ts";

function makeFile(name: string, type: string, size: number) {
  return new File([new Uint8Array(size)], name, { type });
}

test("validateOcrImageFile accepts JPG and PNG images within size limit", () => {
  assert.equal(validateOcrImageFile(makeFile("foto.jpg", "image/jpeg", 1024)), null);
  assert.equal(validateOcrImageFile(makeFile("captura.png", "image/png", 1024)), null);
});

test("validateOcrImageFile allows camera files with a JPG extension even if MIME is missing", () => {
  assert.equal(validateOcrImageFile(makeFile("image.jpg", "", 1024)), null);
});

test("validateOcrImageFile rejects HEIC/HEIF explicitly", () => {
  const error = validateOcrImageFile(makeFile("foto.heic", "image/heic", 1024));

  assert.match(error ?? "", /HEIC\/HEIF/);
});

test("validateOcrImageFile rejects unsupported MIME even if filename looks like JPG", () => {
  const error = validateOcrImageFile(makeFile("foto.jpg", "image/heic", 1024));

  assert.match(error ?? "", /HEIC\/HEIF/);
});

test("validateOcrImageFile rejects images above the OCR size limit", () => {
  const error = validateOcrImageFile(
    makeFile("foto.jpg", "image/jpeg", OCR_MAX_IMAGE_SIZE_BYTES + 1),
  );

  assert.match(error ?? "", new RegExp(formatFileSize(OCR_MAX_IMAGE_SIZE_BYTES)));
});
