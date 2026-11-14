import { isTransientApiError } from "../../../api/errors.ts";
import type { SongSyncPreviewReader, SongSyncRunner } from "./ManualSongSyncController.ts";
import { SongSyncOwnerSession, SongSyncSessionChangedError } from "./SongSyncSession.ts";
import type { SongSyncRunResult } from "./types.ts";

export type AutomaticSongSyncReason =
  | "session"
  | "ownership-linked"
  | "local-change"
  | "foreground"
  | "connectivity"
  | "library-focus"
  | "manual";
export type AutomaticSongSyncState =
  | { status: "idle" }
  | { status: "syncing" }
  | { status: "offline"; pending: number }
  | { status: "pending"; pending: number }
  | { status: "attention"; pending: number }
  | { status: "error"; pending: number };

export function shouldRefreshSyncPreview(previousStatus: string, currentStatus: string) {
  return previousStatus === "syncing" && currentStatus !== "syncing";
}

type TimerHandle = ReturnType<typeof setTimeout>;
type Scheduler = {
  setTimeout(task: () => void, delay: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
};

type Options = {
  engine: SongSyncRunner;
  previewReader: SongSyncPreviewReader;
  ownerSession: SongSyncOwnerSession;
  isApiSessionOwner: (ownerUserId: string) => boolean;
  retryDelays?: number[];
  debounceMs?: number;
  scheduler?: Scheduler;
  transientError?: (error: unknown) => boolean;
};

export class AutomaticSongSyncCoordinator implements SongSyncRunner {
  private readonly engine: SongSyncRunner;
  private readonly previewReader: SongSyncPreviewReader;
  private readonly ownerSession: SongSyncOwnerSession;
  private readonly isApiSessionOwner: (ownerUserId: string) => boolean;
  private readonly retryDelays: number[];
  private readonly debounceMs: number;
  private readonly scheduler: Scheduler;
  private readonly transientError: (error: unknown) => boolean;
  private readonly listeners = new Set<(state: AutomaticSongSyncState) => void>();
  private state: AutomaticSongSyncState = { status: "idle" };
  private connected = true;
  private activeRun: Promise<SongSyncRunResult> | null = null;
  private scheduledRun: TimerHandle | null = null;
  private rerunRequested = false;
  private retryAttempt = 0;

  constructor(options: Options) {
    this.engine = options.engine;
    this.previewReader = options.previewReader;
    this.ownerSession = options.ownerSession;
    this.isApiSessionOwner = options.isApiSessionOwner;
    this.retryDelays = options.retryDelays ?? [1_000, 3_000, 10_000];
    this.debounceMs = options.debounceMs ?? 500;
    this.scheduler = options.scheduler ?? { setTimeout, clearTimeout };
    this.transientError = options.transientError ?? isTransientApiError;
  }

  getState() {
    return this.state;
  }

  subscribe(listener: (state: AutomaticSongSyncState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setOwner(ownerUserId: string | null) {
    const previous = this.ownerSession.getOwner();
    const normalized = ownerUserId?.trim() || null;
    if (previous === normalized) return;
    this.cancelScheduledRun();
    this.rerunRequested = false;
    this.retryAttempt = 0;
    this.ownerSession.setOwner(normalized);
    this.setState({ status: "idle" });
    if (normalized) this.requestSync("session", true);
  }

  setConnected(connected: boolean) {
    this.connected = connected;
    if (!connected) {
      this.cancelScheduledRun();
      void this.updatePendingState("offline");
    } else {
      this.retryAttempt = 0;
      this.requestSync("connectivity", true);
    }
  }

  requestSync(reason: AutomaticSongSyncReason, immediate = false) {
    const owner = this.ownerSession.getOwner();
    if (!owner || !this.isApiSessionOwner(owner)) return;
    if (!this.connected) {
      void this.updatePendingState("offline");
      return;
    }
    if (this.activeRun) {
      this.rerunRequested = true;
      return;
    }
    this.cancelScheduledRun();
    const delay = immediate || reason !== "local-change" ? 0 : this.debounceMs;
    this.scheduledRun = this.scheduler.setTimeout(() => {
      this.scheduledRun = null;
      void this.startRun(owner, this.ownerSession.getGeneration(), 0).catch(() => undefined);
    }, delay);
  }

  sync(ownerUserId: string) {
    if (!this.ownerSession.isActive(ownerUserId) || !this.isApiSessionOwner(ownerUserId)) {
      return Promise.reject(new SongSyncSessionChangedError());
    }
    this.cancelScheduledRun();
    return this.startRun(ownerUserId, this.ownerSession.getGeneration(), 0);
  }

  dispose() {
    this.cancelScheduledRun();
    this.listeners.clear();
    this.ownerSession.setOwner(null);
  }

  private startRun(ownerUserId: string, generation: number, attempt: number): Promise<SongSyncRunResult> {
    if (this.activeRun) return this.activeRun;
    if (!this.isCurrent(ownerUserId, generation)) return Promise.reject(new SongSyncSessionChangedError());

    this.setState({ status: "syncing" });
    const run = this.engine.sync(ownerUserId)
      .then(async (result) => {
        if (!this.isCurrent(ownerUserId, generation)) throw new SongSyncSessionChangedError();
        this.retryAttempt = 0;
        const preview = await this.previewReader.getPreview(ownerUserId);
        if (!this.isCurrent(ownerUserId, generation)) throw new SongSyncSessionChangedError();
        if (result.conflicts.length > 0 || result.itemErrors.length > 0) {
          this.setState({ status: "attention", pending: preview.pendingTotal });
        } else if (preview.pendingTotal > 0) {
          this.setState({ status: "pending", pending: preview.pendingTotal });
        } else {
          this.setState({ status: "idle" });
        }
        return result;
      })
      .catch(async (error) => {
        if (!this.isCurrent(ownerUserId, generation) || error instanceof SongSyncSessionChangedError) throw error;
        const preview = await this.previewReader.getPreview(ownerUserId).catch(() => null);
        const pending = preview?.pendingTotal ?? 0;
        if (!this.connected) {
          this.setState({ status: "offline", pending });
        } else if (this.transientError(error) && attempt < this.retryDelays.length) {
          this.retryAttempt = attempt + 1;
          this.scheduleRetry(ownerUserId, generation, attempt + 1);
          this.setState({ status: "pending", pending });
        } else {
          this.setState({ status: "error", pending });
        }
        throw error;
      })
      .finally(() => {
        if (this.activeRun === run) this.activeRun = null;
        if (this.rerunRequested) {
          this.rerunRequested = false;
          const currentOwner = this.ownerSession.getOwner();
          if (currentOwner && this.isApiSessionOwner(currentOwner)) {
            this.requestSync(currentOwner === ownerUserId ? "local-change" : "session", true);
          }
        }
      });
    this.activeRun = run;
    return run;
  }

  private scheduleRetry(ownerUserId: string, generation: number, attempt: number) {
    this.cancelScheduledRun();
    const delay = this.retryDelays[attempt - 1];
    this.scheduledRun = this.scheduler.setTimeout(() => {
      this.scheduledRun = null;
      if (this.isCurrent(ownerUserId, generation) && this.connected) {
        void this.startRun(ownerUserId, generation, attempt).catch(() => undefined);
      }
    }, delay);
  }

  private async updatePendingState(status: "offline" | "pending") {
    const owner = this.ownerSession.getOwner();
    if (!owner) return;
    const generation = this.ownerSession.getGeneration();
    const preview = await this.previewReader.getPreview(owner).catch(() => null);
    if (preview && this.isCurrent(owner, generation)) {
      this.setState({ status, pending: preview.pendingTotal });
    }
  }

  private isCurrent(ownerUserId: string, generation: number) {
    return this.ownerSession.isActive(ownerUserId, generation) && this.isApiSessionOwner(ownerUserId);
  }

  private cancelScheduledRun() {
    if (this.scheduledRun) this.scheduler.clearTimeout(this.scheduledRun);
    this.scheduledRun = null;
  }

  private setState(state: AutomaticSongSyncState) {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}

export function createAutomaticSongSyncCoordinator(options: Options) {
  return new AutomaticSongSyncCoordinator(options);
}
