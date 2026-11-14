import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";

const ONBOARDING_COMPLETED_KEY = "musum.mobile.onboarding-completed";
const INSTALLATION_MARKER_FILE = "musum-installation.marker";

async function hasCurrentInstallationMarker() {
  if (!FileSystem.documentDirectory) return true;

  const marker = await FileSystem.getInfoAsync(`${FileSystem.documentDirectory}${INSTALLATION_MARKER_FILE}`);
  return marker.exists;
}

async function ensureCurrentInstallationMarker() {
  if (!FileSystem.documentDirectory) return;

  const markerUri = `${FileSystem.documentDirectory}${INSTALLATION_MARKER_FILE}`;
  const marker = await FileSystem.getInfoAsync(markerUri);
  if (!marker.exists) {
    await FileSystem.writeAsStringAsync(markerUri, new Date().toISOString());
  }
}

export async function getOnboardingCompleted() {
  const hasMarker = await hasCurrentInstallationMarker().catch(() => false);
  if (!hasMarker) {
    await SecureStore.deleteItemAsync(ONBOARDING_COMPLETED_KEY).catch(() => undefined);
    await ensureCurrentInstallationMarker().catch(() => undefined);
    return false;
  }

  return (await SecureStore.getItemAsync(ONBOARDING_COMPLETED_KEY)) === "true";
}

export async function markOnboardingCompleted() {
  await ensureCurrentInstallationMarker().catch(() => undefined);
  await SecureStore.setItemAsync(ONBOARDING_COMPLETED_KEY, "true", {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}
