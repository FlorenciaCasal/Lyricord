import { requireOptionalNativeModule } from "expo-modules-core";
import { AppState, type AppStateStatus } from "react-native";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AutomaticSongSyncCoordinator, AutomaticSongSyncState } from "./AutomaticSongSyncCoordinator.ts";
import {
  attachOptionalNetworkMonitor,
  type OptionalNetworkNativeModule,
  type OptionalNetworkState,
} from "./OptionalNetworkMonitor.ts";

type AutomaticSongSyncContextValue = {
  state: AutomaticSongSyncState;
  notifyOwnershipLinked(): void;
  notifyConflictResolved(): void;
  notifyLibraryFocused(): void;
};

const AutomaticSongSyncContext = createContext<AutomaticSongSyncContextValue | null>(null);

function isOnline(state: OptionalNetworkState) {
  return state.isConnected === true && state.isInternetReachable !== false;
}

export function AutomaticSongSyncProvider({
  children,
  coordinator,
  ownerUserId,
}: {
  children: ReactNode;
  coordinator: AutomaticSongSyncCoordinator;
  ownerUserId: string | null;
}) {
  const [state, setState] = useState<AutomaticSongSyncState>(coordinator.getState());

  useEffect(() => coordinator.subscribe(setState), [coordinator]);

  useEffect(() => {
    coordinator.setOwner(ownerUserId);
    return () => coordinator.setOwner(null);
  }, [coordinator, ownerUserId]);

  useEffect(() => {
    let appState: AppStateStatus = AppState.currentState;
    let mounted = true;
    const networkMonitor = attachOptionalNetworkMonitor(
      () => requireOptionalNativeModule<OptionalNetworkNativeModule>("ExpoNetwork"),
      (networkState) => {
        if (mounted) coordinator.setConnected(isOnline(networkState));
      },
    );
    const appSubscription = AppState.addEventListener("change", (nextState) => {
      const becameActive = appState !== "active" && nextState === "active";
      appState = nextState;
      if (!becameActive) return;

      void networkMonitor.refresh().then((networkStateRefreshed) => {
        if (mounted && !networkStateRefreshed) {
          coordinator.requestSync("foreground", true);
        }
      });
    });

    return () => {
      mounted = false;
      appSubscription.remove();
      networkMonitor.remove();
    };
  }, [coordinator]);

  const notifyOwnershipLinked = useCallback(() => {
    coordinator.requestSync("ownership-linked", true);
  }, [coordinator]);
  const notifyConflictResolved = useCallback(() => {
    coordinator.requestSync("local-change", true);
  }, [coordinator]);
  const notifyLibraryFocused = useCallback(() => {
    coordinator.requestSync("library-focus", true);
  }, [coordinator]);
  const value = useMemo<AutomaticSongSyncContextValue>(
    () => ({ state, notifyOwnershipLinked, notifyConflictResolved, notifyLibraryFocused }),
    [notifyConflictResolved, notifyLibraryFocused, notifyOwnershipLinked, state],
  );

  return <AutomaticSongSyncContext.Provider value={value}>{children}</AutomaticSongSyncContext.Provider>;
}

export function useAutomaticSongSync() {
  const value = useContext(AutomaticSongSyncContext);
  if (!value) throw new Error("useAutomaticSongSync debe usarse dentro de AutomaticSongSyncProvider.");
  return value;
}
