import assert from "node:assert/strict";
import test from "node:test";
import {
  getOcrResizeDimensions,
  OCR_IMAGE_MAX_DIMENSION,
  OCR_UPLOAD_MAX_BYTES,
  validateOcrUploadSize,
} from "../mobile/src/utils/ocrImagePolicy.ts";

test("las fotos grandes se reducen conservando su orientación", () => {
  assert.deepEqual(getOcrResizeDimensions(4032, 3024), { width: OCR_IMAGE_MAX_DIMENSION });
  assert.deepEqual(getOcrResizeDimensions(3024, 4032), { height: OCR_IMAGE_MAX_DIMENSION });
  assert.equal(getOcrResizeDimensions(1170, 2200), null);
});

test("el cliente acepta hasta 4 MiB y rechaza archivos mayores antes del request", () => {
  assert.equal(validateOcrUploadSize(OCR_UPLOAD_MAX_BYTES), null);
  assert.match(validateOcrUploadSize(OCR_UPLOAD_MAX_BYTES + 1) ?? "", /demasiado grande/);
  assert.match(validateOcrUploadSize(0) ?? "", /demasiado grande/);
});
