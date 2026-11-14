import * as SecureStore from "expo-secure-store";
import { fetch as expoFetch } from "expo/fetch";
import { File } from "expo-file-system";
import { getApiUrl } from "./config";
import type { PremiumStatus, SongDetail, SongFormValues, SongListItem, SongVersionCreateValues, SongVersionItem, User } from "../types";
import type {
  SongSyncPullRequest,
  SongSyncPullResponse,
  SongSyncPushOperation,
  SongSyncPushResponse,
} from "../data/songs/sync/types";
import { ApiRequestError } from "./errors";
export { ApiRequestError, isTransientApiError } from "./errors";

const REFRESH_TOKEN_KEY = "lyricord.mobile.refresh-token";

type TokenResponse = {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
};

type LoginResponse = TokenResponse & { user: User; premium?: PremiumStatus };
type ApiErrorPayload = { error?: { code?: string; message?: string }; errors?: Record<string, string | undefined> };

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;
let apiSessionOwnerUserId: string | null = null;

export function isApiSessionOwner(ownerUserId: string) {
  return apiSessionOwnerUserId === ownerUserId;
}

function logApiRequest(endpoint: string) {
  console.log("[Lyricord API]", {
    baseUrl: getApiUrl(),
    endpoint,
  });
}

function logApiError(endpoint: string, error: unknown) {
  console.log("[Lyricord API error]", {
    endpoint,
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
  });
}

async function parseError(response: Response) {
  const body = (await response.json().catch(() => null)) as ApiErrorPayload | null;
  if (body?.error?.message) return { message: body.error.message, code: body.error.code ?? null };
  if (body?.errors) {
    return { message: Object.values(body.errors).find(Boolean) ?? `Error HTTP ${response.status}`, code: null };
  }
  return { message: `Error HTTP ${response.status}`, code: null };
}

async function responseError(response: Response) {
  const parsed = await parseError(response);
  return new ApiRequestError(parsed.message, {
    status: response.status,
    code: parsed.code,
    retryable: parsed.code !== "LIMIT_REACHED" && (
      response.status === 408 || response.status === 429 || response.status >= 500
    ),
  });
}

async function storeTokens(tokens: TokenResponse) {
  accessToken = tokens.accessToken;
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    if (!refreshToken) return false;

    const endpoint = "/api/v1/mobile/auth/refresh";
    logApiRequest(endpoint);
    let response: Response;
    try {
      response = await fetch(`${getApiUrl()}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
    } catch (error) {
      logApiError(endpoint, error);
      throw error;
    }
    if (!response.ok) {
      accessToken = null;
      apiSessionOwnerUserId = null;
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      return false;
    }

    await storeTokens((await response.json()) as TokenResponse);
    return true;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

type AuthenticatedFetchOptions = {
  method?: string;
  body?: BodyInit;
  headers?: HeadersInit;
  fetchImpl?: typeof fetch;
};

async function authenticatedFetch(path: string, options: AuthenticatedFetchOptions = {}, retry = true) {
  if (!accessToken && !(await refreshAccessToken())) {
    throw new ApiRequestError("SESSION_EXPIRED", { code: "SESSION_EXPIRED" });
  }

  let response: Response;
  try {
    logApiRequest(path);
    const requestFetch = options.fetchImpl ?? fetch;
    response = await requestFetch(`${getApiUrl()}${path}`, {
      method: options.method,
      body: options.body,
      headers: { ...options.headers, Authorization: `Bearer ${accessToken}` },
    });
  } catch (error) {
    logApiError(path, error);
    throw error;
  }
  if (response.status === 401 && retry && (await refreshAccessToken())) {
    return authenticatedFetch(path, options, false);
  }
  if (!response.ok) throw await responseError(response);
  return response;
}

export async function login(email: string, password: string) {
  const endpoint = "/api/v1/mobile/auth/login";
  let response: Response;
  try {
    logApiRequest(endpoint);
    response = await fetch(`${getApiUrl()}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch (error) {
    logApiError(endpoint, error);
    throw error;
  }
  if (!response.ok) throw await responseError(response);
  const body = (await response.json()) as LoginResponse;
  await storeTokens(body);
  apiSessionOwnerUserId = body.user.id;
  return {
    user: body.user,
    premium: body.premium ?? null,
  };
}

export async function restoreSession() {
  if (!(await refreshAccessToken())) return null;
  const response = await authenticatedFetch("/api/v1/mobile/me");
  const session = (await response.json()) as { user: User; premium?: PremiumStatus };
  apiSessionOwnerUserId = session.user.id;
  return session;
}

export async function logout() {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  accessToken = null;
  apiSessionOwnerUserId = null;
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  if (refreshToken) {
    const endpoint = "/api/v1/mobile/auth/logout";
    logApiRequest(endpoint);
    await fetch(`${getApiUrl()}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    }).catch((error) => {
      logApiError(endpoint, error);
    });
  }
}

export async function getSongs() {
  const response = await authenticatedFetch("/api/v1/mobile/songs");
  return ((await response.json()) as { songs: SongListItem[] }).songs;
}

export async function getSong(id: string) {
  const response = await authenticatedFetch(`/api/v1/mobile/songs/${encodeURIComponent(id)}`);
  return ((await response.json()) as { song: SongDetail }).song;
}

export async function createSong(values: SongFormValues) {
  const response = await authenticatedFetch("/api/v1/mobile/songs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  return ((await response.json()) as { song: SongDetail }).song;
}

export async function updateSong(id: string, values: SongFormValues) {
  const response = await authenticatedFetch(`/api/v1/mobile/songs/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  return ((await response.json()) as { song: SongDetail }).song;
}

export async function deleteSong(id: string) {
  await authenticatedFetch(`/api/v1/mobile/songs/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function getSongVersions(id: string) {
  const response = await authenticatedFetch(`/api/v1/mobile/songs/${encodeURIComponent(id)}/versions`);
  return ((await response.json()) as { versions: SongVersionItem[] }).versions;
}

export async function createSongVersion(id: string, values?: SongVersionCreateValues) {
  const response = await authenticatedFetch(`/api/v1/mobile/songs/${encodeURIComponent(id)}/versions`, {
    method: "POST",
    ...(values
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        }
      : {}),
  });
  return ((await response.json()) as { version: SongDetail }).version;
}

export async function pullSongSyncChanges(request: SongSyncPullRequest) {
  const query = new URLSearchParams();
  if (request.since) query.set("since", request.since);
  if (request.cursor) query.set("cursor", request.cursor);
  if (request.limit) query.set("limit", String(request.limit));
  const suffix = query.toString();
  const response = await authenticatedFetch(`/api/v1/mobile/sync/songs${suffix ? `?${suffix}` : ""}`);
  return (await response.json()) as SongSyncPullResponse;
}

export async function pushSongSyncChanges(changes: SongSyncPushOperation[]) {
  const response = await authenticatedFetch("/api/v1/mobile/sync/songs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ changes }),
  });
  return (await response.json()) as SongSyncPushResponse;
}

export async function getPremiumStatus() {
  const response = await authenticatedFetch("/api/v1/mobile/premium/status");
  return (await response.json()) as PremiumStatus;
}

export async function extractTextFromImage(image: { uri: string; fileName?: string | null; mimeType?: string | null }) {
  const formData = new FormData();
  formData.append("sourceImage", new File(image.uri));

  const response = await authenticatedFetch("/api/v1/mobile/ocr", {
    method: "POST",
    body: formData,
    headers: {
      Accept: "application/json",
      "x-musum-operation-id": `ocr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`,
    },
    fetchImpl: expoFetch,
  });
  return ((await response.json()) as { text: string }).text;
}
