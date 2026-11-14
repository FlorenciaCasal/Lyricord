export type AnonymousSongCapacity =
  | { allowed: true; projectedCount: number }
  | { allowed: false; projectedCount: number; missingPlaces: number };

export function evaluateAnonymousSongCapacity(input: {
  maxSongs: number | null;
  remoteActive: number;
  ownedUnsynced: number;
  anonymousSongs: number;
}): AnonymousSongCapacity {
  const projectedCount = input.remoteActive + input.ownedUnsynced + input.anonymousSongs;
  if (input.maxSongs === null || projectedCount <= input.maxSongs) {
    return { allowed: true, projectedCount };
  }
  return {
    allowed: false,
    projectedCount,
    missingPlaces: projectedCount - input.maxSongs,
  };
}
