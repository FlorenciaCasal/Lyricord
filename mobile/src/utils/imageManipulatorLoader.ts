export const IMAGE_MANIPULATOR_UNAVAILABLE_MESSAGE =
  "Esta instalación no incluye el procesamiento de imágenes. Actualizá Musum para importar desde imagen.";

export type ImageManipulatorModule = typeof import("expo-image-manipulator");
export type ImageManipulatorImporter = () => Promise<ImageManipulatorModule>;

const importImageManipulator: ImageManipulatorImporter = () => import("expo-image-manipulator");

export async function loadImageManipulatorModule(
  importer: ImageManipulatorImporter = importImageManipulator,
): Promise<ImageManipulatorModule> {
  try {
    return await importer();
  } catch {
    throw new Error(IMAGE_MANIPULATOR_UNAVAILABLE_MESSAGE);
  }
}
