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

/**
 * JSON response không qua kiểu generic `JsonBodyType` của MSW: kiểu body lồng sâu của item 02 (phiên + kết luận +
 * bảo vệ clip) làm `tsc` kiểm kiểu rất chậm. Body vẫn được kiểm bằng kiểu contract ở nơi tạo.
 */
export function json(data: unknown, init: { status?: number } = {}) {
  return new HttpResponse(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}
