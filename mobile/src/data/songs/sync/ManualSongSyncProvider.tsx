import { createContext, type ReactNode, useContext } from "react";
import type { ManualSongSyncController } from "./ManualSongSyncController";

const ManualSongSyncContext = createContext<ManualSongSyncController | null>(null);

export function ManualSongSyncProvider({
  children,
  controller,
}: {
  children: ReactNode;
  controller: ManualSongSyncController;
}) {
  return (
    <ManualSongSyncContext.Provider value={controller}>
      {children}
    </ManualSongSyncContext.Provider>
  );
}

export function useManualSongSync() {
  const value = useContext(ManualSongSyncContext);
  if (!value) throw new Error("useManualSongSync debe usarse dentro de ManualSongSyncProvider.");
  return value;
}
