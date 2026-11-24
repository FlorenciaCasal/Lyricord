export type StoreListing = {
  id: "app-store" | "google-play";
  name: string;
  eyebrow: string;
  available: boolean;
  url: string | null;
};

export const STORE_LISTINGS: readonly StoreListing[] = [
  {
    id: "app-store",
    name: "App Store",
    eyebrow: "Para iPhone y iPad",
    available: false,
    url: "https://apps.apple.com/app/id6802776824",
  },
  {
    id: "google-play",
    name: "Google Play",
    eyebrow: "Para Android",
    available: false,
    url: null,
  },
] as const;

export const LANDING_FEATURES = [
  {
    title: "De tus capturas a tu cancionero",
    description:
      "Importá letras y acordes desde tus capturas, incluso si una canción ocupa varias imágenes. Corregí el resultado y armá tu propia versión.",
  },
  {
    title: "Tocá a tu ritmo",
    description:
      "Musum puede seguir la canción mientras tocás. Cambiá el tono en el momento y mantené la letra y los acordes a mano.",
  },
  {
    title: "Tu repertorio, siempre disponible",
    description:
      "En la app móvil, tu biblioteca funciona sin conexión. Si iniciás sesión, podés respaldarla y mantenerla sincronizada entre dispositivos.",
  },
] as const;

export function getPublicStoreUrl(listing: StoreListing) {
  return listing.available ? listing.url : null;
}

export type HomeExperience =
  | { view: "landing" }
  | { view: "library"; userId: string };

export function getHomeExperience(
  userId: string | null | undefined,
): HomeExperience {
  return userId ? { view: "library", userId } : { view: "landing" };
}
