import type { SongSyncRunResult } from "./types.ts";
import type { SongSyncPreview } from "./SQLiteSongSyncStore.ts";

export type SongSyncRunner = {
  sync(ownerUserId: string): Promise<SongSyncRunResult>;
};

export type SongSyncPreviewReader = {
  getPreview(ownerUserId: string): Promise<SongSyncPreview>;
};

export type ManualSongSyncControllerOptions = {
  engine: SongSyncRunner;
  previewReader: SongSyncPreviewReader;
  apiUrl: string | null;
  isDevelopment: boolean;
};

export class ManualSongSyncUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualSongSyncUnavailableError";
  }
}

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
}

export function isSafeDevelopmentApiUrl(apiUrl: string | null) {
  if (!apiUrl) return false;

  try {
    const url = new URL(apiUrl);
    const hostname = url.hostname.toLowerCase();
    const localHostname = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
    return (url.protocol === "http:" || url.protocol === "https:") && (localHostname || isPrivateIpv4(hostname));
  } catch {
    return false;
  }
}

export function shouldShowManualSongSyncControl(isDevelopment: boolean, apiUrl: string | null) {
  return isDevelopment && isSafeDevelopmentApiUrl(apiUrl);
}

export class ManualSongSyncController {
  private readonly engine: SongSyncRunner;
  private readonly previewReader: SongSyncPreviewReader;
  private readonly apiUrl: string | null;
  private readonly isDevelopment: boolean;
  private activeRun: Promise<SongSyncRunResult> | null = null;
  private activeOwnerUserId: string | null = null;

  constructor(options: ManualSongSyncControllerOptions) {
    this.engine = options.engine;
    this.previewReader = options.previewReader;
    this.apiUrl = options.apiUrl;
    this.isDevelopment = options.isDevelopment;
  }

  isAvailable() {
    return shouldShowManualSongSyncControl(this.isDevelopment, this.apiUrl);
  }

  isRunning() {
    return this.activeRun !== null;
  }

  preview(ownerUserId: string | null) {
    if (!this.isDevelopment) {
      return Promise.reject(new ManualSongSyncUnavailableError("La previsualización sólo está disponible en desarrollo."));
    }
    if (!isSafeDevelopmentApiUrl(this.apiUrl)) {
      return Promise.reject(new ManualSongSyncUnavailableError("La API configurada no corresponde a un entorno local seguro."));
    }

    const normalizedOwner = ownerUserId?.trim();
    if (!normalizedOwner) {
      return Promise.reject(new ManualSongSyncUnavailableError("Iniciá sesión para revisar la sincronización."));
    }
    return this.previewReader.getPreview(normalizedOwner);
  }

  run(ownerUserId: string | null) {
    if (!this.isDevelopment) {
      return Promise.reject(new ManualSongSyncUnavailableError("La sincronización manual sólo está disponible en desarrollo."));
    }
    if (!isSafeDevelopmentApiUrl(this.apiUrl)) {
      return Promise.reject(new ManualSongSyncUnavailableError("La API configurada no corresponde a un entorno local seguro."));
    }

    const normalizedOwner = ownerUserId?.trim();
    if (!normalizedOwner) {
      return Promise.reject(new ManualSongSyncUnavailableError("Iniciá sesión para sincronizar tu repertorio."));
    }

    if (this.activeRun) {
      if (this.activeOwnerUserId === normalizedOwner) return this.activeRun;
      return Promise.reject(new ManualSongSyncUnavailableError("Ya hay una sincronización en curso para otra cuenta."));
    }

    this.activeOwnerUserId = normalizedOwner;
    const run = this.engine.sync(normalizedOwner).finally(() => {
      if (this.activeRun === run) {
        this.activeRun = null;
        this.activeOwnerUserId = null;
      }
    });
    this.activeRun = run;
    return run;
  }
}

export function createManualSongSyncController(options: ManualSongSyncControllerOptions) {
  return new ManualSongSyncController(options);
}
