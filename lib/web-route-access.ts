export function isProtectedWebPath(pathname: string) {
  return pathname === "/songs" || pathname.startsWith("/songs/");
}
