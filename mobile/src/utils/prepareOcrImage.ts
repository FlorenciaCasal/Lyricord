import type * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { loadImageManipulatorModule } from "./imageManipulatorLoader";
import {
  getOcrResizeDimensions,
  OCR_IMAGE_COMPRESSION_LEVELS,
  OCR_IMAGE_TOO_LARGE_MESSAGE,
  validateOcrUploadSize,
} from "./ocrImagePolicy";

export type PreparedOcrImage = {
  uri: string;
  fileName: string;
  mimeType: "image/jpeg";
};

export async function prepareOcrImage(asset: ImagePicker.ImagePickerAsset): Promise<PreparedOcrImage> {
  const { ImageManipulator, SaveFormat } = await loadImageManipulatorModule();
  const context = ImageManipulator.manipulate(asset.uri);
  const resize = getOcrResizeDimensions(asset.width, asset.height);
  if (resize) context.resize(resize);

  const rendered = await context.renderAsync();
  for (const compress of OCR_IMAGE_COMPRESSION_LEVELS) {
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress });
    const file = new File(saved.uri);
    if (!validateOcrUploadSize(file.size)) {
      return {
        uri: saved.uri,
        fileName: "musum-ocr.jpg",
        mimeType: "image/jpeg",
      };
    }
    if (file.exists) file.delete();
  }

  throw new Error(OCR_IMAGE_TOO_LARGE_MESSAGE);
}
