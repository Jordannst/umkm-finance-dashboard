import { NextResponse } from "next/server";

/**
 * Format response standar untuk semua endpoint API publik:
 *
 *   sukses : { ok: true, data: T }
 *   gagal  : { ok: false, error: { code, message, fieldErrors? } }
 *
 * Konsisten supaya Liana / klien lain gampang parse.
 */

export interface ApiErrorBody {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
}

export function apiOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function apiError(
  code: string,
  message: string,
  status = 400,
  fieldErrors?: Record<string, string>,
): NextResponse {
  const error: ApiErrorBody = { code, message };
  if (fieldErrors) error.fieldErrors = fieldErrors;
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * Convert zod issues ke fieldErrors flat record {fieldName: message}.
 */
export function zodIssuesToFieldErrors(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
): Record<string, string> {
  const fe: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fe[key]) fe[key] = issue.message;
  }
  return fe;
}
