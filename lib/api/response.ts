import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "INVALID_JSON"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "VALIDATION_ERROR"
  | "INVALID_SELECTION"
  | "IDEMPOTENCY_CONFLICT"
  | "RATE_LIMITED"
  | "AI_NOT_CONFIGURED"
  | "AI_INVALID_OUTPUT"
  | "AI_TIMEOUT"
  | "AI_UNAVAILABLE"
  | "INTERNAL_ERROR";

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; fields?: Record<string, string> };
}

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function apiSuccess<T>(data: T, status = 200, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json({ data }, { status, headers: { ...NO_STORE, ...extraHeaders } });
}

/** Structured error with a safe message. Never includes stack traces or upstream details. */
export function apiError(status: number, code: ApiErrorCode, message: string, fields?: Record<string, string>) {
  const body: ApiErrorBody = { error: { code, message, ...(fields && { fields }) } };
  return NextResponse.json(body, { status, headers: NO_STORE });
}
