export class SongSyncConflictNoticeGuard {
  private checking = false;
  private activeConflictId: string | null = null;
  private resolving = false;

  beginCheck() {
    if (this.checking || this.activeConflictId) return false;
    this.checking = true;
    return true;
  }

  finishCheck(conflictId: string | null) {
    this.checking = false;
    if (!conflictId || this.activeConflictId) return false;
    this.activeConflictId = conflictId;
    return true;
  }

  beginResolution(conflictId: string) {
    if (this.activeConflictId !== conflictId || this.resolving) return false;
    this.resolving = true;
    return true;
  }

  finishResolution(conflictId: string) {
    if (this.activeConflictId === conflictId) this.activeConflictId = null;
    this.resolving = false;
  }
}
