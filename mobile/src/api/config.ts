const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
const configuredRegistrationUrl = normalizeRegistrationUrl(process.env.EXPO_PUBLIC_REGISTRATION_URL);

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
}

export function normalizeRegistrationUrl(value: string | undefined) {
  const candidate = value?.trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase();
    const localHttp = url.protocol === "http:" && (
      hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || isPrivateIpv4(hostname)
    );
    if (url.username || url.password || (url.protocol !== "https:" && !localHttp)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function getConfiguredApiUrl() {
  return configuredApiUrl ?? null;
}

export function getConfiguredRegistrationUrl() {
  return configuredRegistrationUrl;
}

export function getApiUrl() {
  if (!configuredApiUrl) {
    throw new Error("Falta EXPO_PUBLIC_API_URL en mobile/.env.local.");
  }
  return configuredApiUrl;
}
