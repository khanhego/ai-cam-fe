/** Lỗi API theo format chung (02 §6): `{ error: { code, message, details } }`. FE xử lý theo `code`. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Lỗi theo field (422 VALIDATION_ERROR → `details.fields`). */
  get fieldErrors(): Record<string, string> {
    const fields = this.details.fields;
    return fields && typeof fields === "object" ? (fields as Record<string, string>) : {};
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

/** Chữ mặc định cho lỗi chung (02 §6 "Lỗi chung mọi API") khi server không gửi message. */
export const GENERIC_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Phiên đăng nhập đã hết hạn. Đăng nhập lại.",
  FORBIDDEN: "Tài khoản không có quyền thực hiện thao tác này.",
  NOT_FOUND: "Không tìm thấy dữ liệu.",
  VALIDATION_ERROR: "Dữ liệu không hợp lệ.",
  RATE_LIMITED: "Thao tác quá nhanh, thử lại sau.",
  INTERNAL: "Có lỗi hệ thống. Thử lại sau ít phút.",
  NETWORK_ERROR: "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
};

export async function toApiError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);
  const err = (body as { error?: { code?: string; message?: string; details?: Record<string, unknown> } })
    ?.error;
  const code = err?.code ?? (response.status >= 500 ? "INTERNAL" : `HTTP_${response.status}`);
  return new ApiError(
    response.status,
    code,
    err?.message ?? GENERIC_MESSAGES[code] ?? GENERIC_MESSAGES.INTERNAL!,
    err?.details ?? {},
  );
}
