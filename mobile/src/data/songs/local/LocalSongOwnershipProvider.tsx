import { createContext, type ReactNode, useContext } from "react";
import type { AnonymousSongSummary } from "./LocalSongRepository";

export type LocalSongOwnership = {
  getAnonymousSongSummary(): Promise<AnonymousSongSummary>;
  getOwnedUnsyncedSongCount(ownerUserId: string): Promise<number>;
  linkAnonymousSongsToOwner(
    ownerUserId: string,
    capacity?: { maxSongs: number | null; remoteActive: number },
  ): Promise<{ linkedCount: number }>;
};

const LocalSongOwnershipContext = createContext<LocalSongOwnership | null>(null);

export function LocalSongOwnershipProvider({
  children,
  ownership,
}: {
  children: ReactNode;
  ownership: LocalSongOwnership;
}) {
  return (
    <LocalSongOwnershipContext.Provider value={ownership}>
      {children}
    </LocalSongOwnershipContext.Provider>
  );
}

export function useLocalSongOwnership() {
  const value = useContext(LocalSongOwnershipContext);
  if (!value) throw new Error("useLocalSongOwnership debe usarse dentro de LocalSongOwnershipProvider.");
  return value;
}
