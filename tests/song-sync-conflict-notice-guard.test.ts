import assert from "node:assert/strict";
import test from "node:test";
import { SongSyncConflictNoticeGuard } from "../mobile/src/data/songs/sync/SongSyncConflictNoticeGuard.ts";

test("deletion conflict notice allows only one concurrent lookup and one resolution", () => {
  const guard = new SongSyncConflictNoticeGuard();

  assert.equal(guard.beginCheck(), true);
  assert.equal(guard.beginCheck(), false);
  assert.equal(guard.finishCheck("conflict_1"), true);
  assert.equal(guard.finishCheck("conflict_1"), false);

  assert.equal(guard.beginResolution("conflict_1"), true);
  assert.equal(guard.beginResolution("conflict_1"), false);
  guard.finishResolution("conflict_1");

  assert.equal(guard.beginCheck(), true);
  assert.equal(guard.finishCheck(null), false);
  assert.equal(guard.beginCheck(), true);
});
