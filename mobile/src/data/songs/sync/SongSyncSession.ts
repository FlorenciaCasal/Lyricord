export class SongSyncSessionChangedError extends Error {
  constructor() {
    super("La sesión cambió durante la sincronización.");
    this.name = "SongSyncSessionChangedError";
  }
}

export class SongSyncOwnerSession {
  private ownerUserId: string | null = null;
  private generation = 0;

  setOwner(ownerUserId: string | null) {
    const normalized = ownerUserId?.trim() || null;
    if (normalized === this.ownerUserId) return this.generation;
    this.ownerUserId = normalized;
    this.generation += 1;
    return this.generation;
  }

  getOwner() {
    return this.ownerUserId;
  }

  getGeneration() {
    return this.generation;
  }

  isActive(ownerUserId: string, generation?: number) {
    return this.ownerUserId === ownerUserId && (generation === undefined || generation === this.generation);
  }
}
