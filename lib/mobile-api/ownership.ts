export function buildOwnedSongWhere(userId: string, id: string) {
  return { id, userId };
}

export function isValidSongId(id: string) {
  return /^[a-z0-9_-]{8,64}$/i.test(id);
}
