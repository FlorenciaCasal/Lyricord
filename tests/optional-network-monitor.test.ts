import assert from "node:assert/strict";
import test from "node:test";
import { attachOptionalNetworkMonitor } from "../mobile/src/data/songs/sync/OptionalNetworkMonitor.ts";

test("missing ExpoNetwork native module is a safe no-op", async () => {
  let states = 0;
  const monitor = attachOptionalNetworkMonitor(() => null, () => { states += 1; });
  assert.equal(await monitor.refresh(), false);
  assert.doesNotThrow(monitor.remove);
  await Promise.resolve();
  assert.equal(states, 0);
});

test("native module lookup failures do not disable the rest of automatic sync", () => {
  const monitor = attachOptionalNetworkMonitor(() => {
    throw new Error("Cannot find native module 'ExpoNetwork'");
  }, () => assert.fail("network listener must not run"));
  assert.doesNotThrow(monitor.remove);
});

test("available ExpoNetwork module reports initial state and reconnections", async () => {
  const states: boolean[] = [];
  let listener: ((state: { isConnected?: boolean }) => void) | null = null;
  let removed = false;
  const monitor = attachOptionalNetworkMonitor(
    () => ({
      async getNetworkStateAsync() {
        return { isConnected: false, isInternetReachable: false };
      },
      addListener(_eventName, nextListener) {
        listener = nextListener;
        return { remove() { removed = true; } };
      },
    }),
    (state) => states.push(state.isConnected === true),
  );

  await Promise.resolve();
  (listener as ((state: { isConnected?: boolean; isInternetReachable?: boolean }) => void) | null)?.({
    isConnected: true,
    isInternetReachable: true,
  });
  monitor.remove();
  assert.deepEqual(states, [false, true]);
  assert.equal(removed, true);
});

test("foreground refresh re-reads native connectivity after a missed event", async () => {
  const states: boolean[] = [];
  let connected = false;
  const monitor = attachOptionalNetworkMonitor(
    () => ({
      async getNetworkStateAsync() {
        return { isConnected: connected, isInternetReachable: connected };
      },
      addListener() {
        return { remove() {} };
      },
    }),
    (state) => states.push(state.isConnected === true),
  );

  await Promise.resolve();
  connected = true;
  assert.equal(await monitor.refresh(), true);
  assert.deepEqual(states, [false, true]);
});
