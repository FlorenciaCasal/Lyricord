import { createContext, type ReactNode, useContext } from "react";
import type { SongRepository } from "./SongRepository";
import { remoteSongRepository } from "./defaultSongRepository";

const SongRepositoryContext = createContext<SongRepository>(remoteSongRepository);

export function SongRepositoryProvider({
  children,
  repository = remoteSongRepository,
}: {
  children: ReactNode;
  repository?: SongRepository;
}) {
  return (
    <SongRepositoryContext.Provider value={repository}>
      {children}
    </SongRepositoryContext.Provider>
  );
}

export function useSongRepository() {
  return useContext(SongRepositoryContext);
}
