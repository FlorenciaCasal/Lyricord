import type { User } from "../types";

export const CLOUD_OCR_AUTH_REQUIRED_MESSAGE =
  "Para importar una canción desde imagen con extracción automática necesitás una cuenta de Musum. Podés seguir escribiendo o pegando la letra y los acordes sin iniciar sesión.";

export const PREMIUM_AUTH_REQUIRED_MESSAGE =
  "Protegé tu compra y tu repertorio. Creá una cuenta o iniciá sesión para activar Premium.";

export function canUseCloudOcr(user: User | null) {
  return user !== null;
}

export function canStartPremiumPurchase(user: User | null) {
  return user !== null;
}
