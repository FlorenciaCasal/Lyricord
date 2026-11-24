import assert from "node:assert/strict";
import test from "node:test";
import {
  LANDING_FEATURES,
  STORE_LISTINGS,
  getHomeExperience,
  getPublicStoreUrl,
} from "../lib/public-landing.ts";
import { isProtectedWebPath } from "../lib/web-route-access.ts";

test("la landing mantiene las tres ideas principales de Musum", () => {
  assert.deepEqual(
    LANDING_FEATURES.map((feature) => feature.title),
    [
      "De tus capturas a tu cancionero",
      "Tocá a tu ritmo",
      "Tu repertorio, siempre disponible",
    ],
  );
  assert.equal(
    LANDING_FEATURES[0].description,
    "Importá letras y acordes desde tus capturas, incluso si una canción ocupa varias imágenes. Corregí el resultado y armá tu propia versión.",
  );
  assert.match(LANDING_FEATURES[2].description, /En la app móvil/);
});

test("las tiendas quedan visibles pero sin enlaces activos antes de publicarse", () => {
  const appStore = STORE_LISTINGS.find(
    (listing) => listing.id === "app-store",
  );
  const googlePlay = STORE_LISTINGS.find(
    (listing) => listing.id === "google-play",
  );

  assert.ok(appStore);
  assert.ok(googlePlay);
  assert.equal(appStore.available, false);
  assert.equal(
    appStore.url,
    "https://apps.apple.com/app/id6802776824",
  );
  assert.equal(getPublicStoreUrl(appStore), null);
  assert.equal(getPublicStoreUrl(googlePlay), null);
});

test("la raiz es publica y las canciones web siguen protegidas", () => {
  assert.equal(isProtectedWebPath("/"), false);
  assert.equal(isProtectedWebPath("/support"), false);
  assert.equal(isProtectedWebPath("/api/v1/mobile/songs"), false);
  assert.equal(isProtectedWebPath("/songs"), true);
  assert.equal(isProtectedWebPath("/songs/new"), true);
  assert.equal(isProtectedWebPath("/songs/song-id"), true);
  assert.equal(isProtectedWebPath("/songs-archive"), false);
});

test("la raiz elige landing o biblioteca sin mezclar sesiones", () => {
  assert.deepEqual(getHomeExperience(null), { view: "landing" });
  assert.deepEqual(getHomeExperience(undefined), { view: "landing" });
  assert.deepEqual(getHomeExperience("user-123"), {
    view: "library",
    userId: "user-123",
  });
});
