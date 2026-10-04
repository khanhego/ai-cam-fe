import type { Role } from "@/lib/api/session";

import { userFromAuth } from "../db";
import { apiError } from "../http";

/** Kiểm token + vai cho handler mock (401 / 403 đúng 02 §6 "Lỗi chung"). Trả `[user, null]` hoặc `[null, response]`. */
export function requireRole(request: Request, roles: Role[]) {
  const user = userFromAuth(request.headers.get("Authorization"));
  if (!user)
    return [null, apiError(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn. Đăng nhập lại.")] as const;
  if (!roles.includes(user.role))
    return [null, apiError(403, "FORBIDDEN", "Tài khoản không có quyền thực hiện thao tác này.")] as const;
  return [user, null] as const;
}

export const DASHBOARD_ROLES: Role[] = ["ADMIN", "SUPERVISOR", "CSKH"];
