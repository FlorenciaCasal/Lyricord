import "server-only";

import { verifyMobileAccessToken } from "@/lib/mobile-api/tokens";

export function getMobileUserId(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? verifyMobileAccessToken(match[1])?.userId ?? null : null;
}
