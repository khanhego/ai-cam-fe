import { isApiError } from "@/lib/api/errors";

const timeVN = (iso: unknown) =>
  typeof iso === "string"
    ? new Intl.DateTimeFormat("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Ho_Chi_Minh",
      }).format(new Date(iso))
    : null;

/** Chữ lỗi đăng nhập (01 §10.4 S0, 02 API-01, 02b-station §5). `area` đổi câu WRONG_CLIENT. */
export function loginErrorMessage(err: unknown, area: "station" | "dashboard"): string {
  if (!isApiError(err)) return "Có lỗi hệ thống. Thử lại sau ít phút.";
  switch (err.code) {
    case "INVALID_CREDENTIALS":
      return area === "station"
        ? "Sai tài khoản hoặc mật khẩu. Kiểm tra lại hoặc hỏi Admin."
        : "Sai tài khoản hoặc mật khẩu.";
    case "WRONG_CLIENT":
      return area === "station"
        ? "Tài khoản này không dùng cho station. Đăng nhập dashboard tại /admin."
        : "Tài khoản station chỉ đăng nhập tại màn station.";
    case "ACCOUNT_DISABLED":
      return "Tài khoản đã bị khóa. Liên hệ Admin.";
    case "ACCOUNT_LOCKED": {
      const until = timeVN(err.details.until);
      return until
        ? `Đăng nhập sai quá nhiều lần. Thử lại sau ${until}.`
        : "Đăng nhập sai quá nhiều lần. Thử lại sau ít phút.";
    }
    case "STATION_INACTIVE":
      return "Station này đang tắt. Liên hệ Admin.";
    case "RATE_LIMITED":
      return "Thử lại sau ít phút.";
    case "NETWORK_ERROR":
      return "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";
    default:
      return err.message;
  }
}
