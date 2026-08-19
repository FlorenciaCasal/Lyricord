import { NextResponse } from "next/server";

export type MobileApiErrorCode =
  | "INVALID_REQUEST"
  | "VALIDATION_ERROR"
  | "INVALID_CREDENTIALS"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export function mobileApiError(
  status: number,
  code: MobileApiErrorCode,
  message: string,
) {
  return NextResponse.json({ error: { code, message } }, { status });
}
