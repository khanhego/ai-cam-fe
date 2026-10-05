import { api } from "./client";
import type { Role } from "./session";
import type { Page } from "./stations";

/** API-90..92 — tài khoản, thu hồi đăng nhập, nhật ký (02 §6.2). */
export type UserListItem = {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  is_active: boolean;
  station: { id: string; name: string } | null;
  created_at: string;
};
export type UserCreate = { username: string; display_name: string; role: Role; password: string };
export type UserPatch = Partial<{ display_name: string; role: Role; is_active: boolean; password: string }>;

export type AuditAction =
  | "LOGIN"
  | "VIEW_CLIP"
  | "EXPORT_CLIP"
  | "HOLD_CLIP"
  | "UNHOLD_CLIP"
  | "DELETE_CLIP"
  | "APPROVAL_DECISION"
  | "IMPORT_COMMIT"
  | "SETTINGS_UPDATE"
  | "STATION_UPDATE"
  | "CAMERA_UPDATE"
  | "USER_UPDATE"
  | "SESSIONS_REVOKED"
  | "SHOP_CONNECT"
  | "DOWNLOAD_EXPORT"
  | "ORDER_OVERWRITTEN_BY_API"
  | "REBUILD_CLIP";

export type AuditLogItem = {
  at: string;
  user: { id: string; display_name: string } | null;
  action: string;
  object_type: string | null;
  object_id: string | null;
  data?: Record<string, unknown> | null;
};
export type AuditFilters = {
  user_id?: string;
  action?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
};

export const usersApi = {
  list: (page: number, role?: Role) =>
    api.get<Page<UserListItem>>("/users", { query: { page, page_size: 20, role } }),
  /** Mọi tài khoản (bộ lọc "Người" ở D10): đọc hết các trang 100 dòng (review G3 F36 — trước chỉ 100 đầu). */
  all: async (): Promise<UserListItem[]> => {
    const items: UserListItem[] = [];
    for (let page = 1; page <= 50; page += 1) {
      const res = await api.get<Page<UserListItem>>("/users", { query: { page, page_size: 100 } });
      items.push(...res.items);
      if (res.items.length === 0 || items.length >= res.total) break;
    }
    return items;
  },
  create: (body: UserCreate) => api.post<UserListItem>("/users", body),
  patch: (id: string, body: UserPatch) => api.patch<UserListItem>(`/users/${id}`, body),
  /** API-91: 204. Station về đăng nhập khi access token hết hạn (≤ 15 phút, DEC-55). */
  revokeSessions: (id: string) => api.post<void>(`/users/${id}/revoke-sessions`),
  audit: (f: AuditFilters) =>
    api.get<Page<AuditLogItem>>("/audit-logs", { query: { ...f, page: f.page ?? 1, page_size: 20 } }),
};
