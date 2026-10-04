import { HttpResponse } from "msw";

/** Lỗi đúng format 02 §6. */
export function apiError(
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
) {
  return HttpResponse.json({ error: { code, message, details } }, { status });
}

export const API = "/api/v1";
