import { createContext, type ReactNode, useContext } from "react";
import type { SongSyncConflictController } from "./SongSyncConflictController";

const SongSyncConflictContext = createContext<SongSyncConflictController | null>(null);

export function SongSyncConflictProvider({
  children,
  controller,
}: {
  children: ReactNode;
  controller: SongSyncConflictController;
}) {
  return (
    <SongSyncConflictContext.Provider value={controller}>
      {children}
    </SongSyncConflictContext.Provider>
  );
}

export function useSongSyncConflicts() {
  const value = useContext(SongSyncConflictContext);
  if (!value) throw new Error("useSongSyncConflicts debe usarse dentro de SongSyncConflictProvider.");
  return value;
}
