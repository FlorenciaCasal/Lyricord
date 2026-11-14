import type { LocalSongOwnership } from "./LocalSongOwnershipProvider.tsx";

export type AnonymousSongLinkDecision = "cancel" | "confirm";

export type AnonymousSongLinkResult = {
  linkedCount: number;
  status: "cancelled" | "stale-session" | "linked";
  syncRequested: boolean;
};

export async function applyAnonymousSongLinkDecision({
  decision,
  ownerUserId,
  ownership,
  isOwnerActive,
  notifyOwnershipLinked,
}: {
  decision: AnonymousSongLinkDecision;
  ownerUserId: string;
  ownership: LocalSongOwnership;
  isOwnerActive: (ownerUserId: string) => boolean;
  notifyOwnershipLinked: () => void;
}): Promise<AnonymousSongLinkResult> {
  if (decision === "cancel") {
    return { linkedCount: 0, status: "cancelled", syncRequested: false };
  }

  if (!isOwnerActive(ownerUserId)) {
    return { linkedCount: 0, status: "stale-session", syncRequested: false };
  }

  const { linkedCount } = await ownership.linkAnonymousSongsToOwner(ownerUserId);
  const ownerStillActive = isOwnerActive(ownerUserId);
  if (linkedCount > 0 && ownerStillActive) {
    notifyOwnershipLinked();
  }

  return {
    linkedCount,
    status: ownerStillActive ? "linked" : "stale-session",
    syncRequested: linkedCount > 0 && ownerStillActive,
  };
}
