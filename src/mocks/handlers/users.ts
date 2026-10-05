import { http, HttpResponse } from "msw";

import type { Role } from "@/lib/api/session";
import type { AuditLogItem, UserListItem } from "@/lib/api/users";
import { vnDay } from "@/shared/format";

import { mockRefresh, mockUsers, type MockUser } from "../db";
import { API, apiError } from "../http";
import { requireRole } from "./session";
import { mockStations } from "./stations";

/** API-90..92 theo 02 §6.2 + hành vi BE `users/service.py` (LAST_ADMIN, thu hồi khi khóa / đổi vai / đổi mật khẩu). */
const ROLES: Role[] = ["ADMIN", "SUPERVISOR", "CSKH", "STATION"];
const USERNAME = /^[a-z0-9._-]{3,32}$/;

export const mockAudit: (AuditLogItem & { id: number })[] = [];
let auditSeq = 0;
/** Seed lười: `db.ts` ↔ file này import vòng, và trình duyệt (dev:mock) không gọi `resetMockDb`. */
let seeded = false;

export function recordAudit(
  userId: string | null,
  action: string,
  objectType: string | null,
  objectId: string | null,
  at = new Date().toISOString(),
) {
  if (!seeded) resetMockAudit();
  const user = mockUsers.find((u) => u.id === userId);
  mockAudit.unshift({
    id: ++auditSeq,
    at,
    user: user ? { id: user.id, display_name: user.display_name } : null,
    action,
    object_type: objectType,
    object_id: objectId,
  });
  mockAudit.sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id);
}

/** 25 dòng nhật ký trong 3 ngày gần nhất (đủ 2 trang) + 1 dòng của hệ thống (J-02). */
export function resetMockAudit() {
  seeded = true;
  mockAudit.splice(0);
  auditSeq = 0;
  const now = Date.now();
  const plan: [string, string, string | null, string | null][] = [
    ["u-admin", "LOGIN", "USER", "u-admin"],
    ["u-sup", "LOGIN", "USER", "u-sup"],
    ["u-cskh", "VIEW_CLIP", "CLIP", "clip-0001-1"],
    ["u-cskh", "EXPORT_CLIP", "SESSION", "ses-0001-1"],
    ["u-sup", "HOLD_CLIP", "CLIP", "clip-0002-1"],
    ["u-admin", "SETTINGS_UPDATE", "SETTING", "retention"],
    ["u-sup", "APPROVAL_DECISION", "APPROVAL_REQUEST", "apr-1"],
    ["u-admin", "STATION_UPDATE", "STATION", "st-1"],
    ["u-admin", "CAMERA_UPDATE", "CAMERA", "cam-1"],
  ];
  for (let i = 0; i < 25; i += 1) {
    const [user, action, type, id] = plan[i % plan.length]!;
    recordAudit(user, action, type, id, new Date(now - (i * 3 + 1) * 3600_000).toISOString());
  }
  recordAudit(null, "DELETE_CLIP", "CLIP", "clip-old-1", new Date(now - 30 * 3600_000).toISOString());
}

const created = (u: MockUser) => u.created_at ?? "2026-10-01T00:00:00Z";

function toItem(u: MockUser): UserListItem {
  const st = mockStations.find((x) => x.account?.id === u.id);
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    role: u.role,
    is_active: !u.disabled,
    // Như BE: station suy ra từ station đang gắn tài khoản.
    station: st ? { id: st.id, name: st.name } : null,
    created_at: created(u),
  };
}

const activeAdmins = () => mockUsers.filter((u) => u.role === "ADMIN" && !u.disabled).length;

function revokeAll(userId: string) {
  for (const [client, id] of mockRefresh) if (id === userId) mockRefresh.delete(client);
}

const vnDayOf = (iso: string) => vnDay(iso);

export const usersHandlers = [
  http.get(`${API}/users`, ({ request }) => {
    const [, denied] = requireRole(request, ["ADMIN"]);
    if (denied) return denied;
    const url = new URL(request.url);
    const role = url.searchParams.get("role");
    const page = Number(url.searchParams.get("page") ?? 1);
    const pageSize = Number(url.searchParams.get("page_size") ?? 20);
    const all = mockUsers.filter((u) => !role || u.role === role);
    const items = all.slice((page - 1) * pageSize, page * pageSize).map(toItem);
    return HttpResponse.json({ items, page, page_size: pageSize, total: all.length });
  }),

  http.post(`${API}/users`, async ({ request }) => {
    const [actor, denied] = requireRole(request, ["ADMIN"]);
    if (denied) return denied;
    const body = (await request.json()) as Partial<{
      username: string;
      display_name: string;
      role: Role;
      password: string;
    }>;
    const fields: Record<string, string> = {};
    if (!body.username || !USERNAME.test(body.username)) fields.username = "Không hợp lệ";
    if (!body.display_name?.trim() || body.display_name.length > 80) fields.display_name = "Không hợp lệ";
    if (!body.role || !ROLES.includes(body.role)) fields.role = "Không hợp lệ";
    if (!body.password || body.password.length < 8) fields.password = "Ít nhất 8 ký tự";
    if (Object.keys(fields).length)
      return apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", { fields });
    if (mockUsers.some((u) => u.username === body.username))
      return apiError(409, "USERNAME_TAKEN", "Tên đăng nhập đã tồn tại.", {
        fields: { username: "Đã tồn tại" },
      });
    const user: MockUser = {
      id: `u-${Date.now()}-${mockUsers.length}`,
      username: body.username!,
      display_name: body.display_name!.trim(),
      role: body.role!,
      station: null,
      password: body.password,
      created_at: new Date().toISOString(),
    };
    mockUsers.push(user);
    recordAudit(actor.id, "USER_UPDATE", "USER", user.id);
    return HttpResponse.json(toItem(user), { status: 201 });
  }),

  http.patch(`${API}/users/:id`, async ({ request, params }) => {
    const [actor, denied] = requireRole(request, ["ADMIN"]);
    if (denied) return denied;
    const user = mockUsers.find((u) => u.id === params.id);
    if (!user) return apiError(404, "NOT_FOUND", "Không tìm thấy tài khoản.");
    const body = (await request.json()) as Partial<{
      display_name: string;
      role: Role;
      is_active: boolean;
      password: string;
    }>;
    if (body.password !== undefined && body.password.length < 8)
      return apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", {
        fields: { password: "Ít nhất 8 ký tự" },
      });
    const losingAdmin =
      user.role === "ADMIN" &&
      !user.disabled &&
      ((body.role !== undefined && body.role !== "ADMIN") || body.is_active === false);
    if (losingAdmin && activeAdmins() <= 1) return apiError(409, "LAST_ADMIN", "Phải còn ít nhất một Admin.");
    const roleChanged = body.role !== undefined && body.role !== user.role;
    if (body.display_name !== undefined) user.display_name = body.display_name.trim();
    if (body.role !== undefined) user.role = body.role;
    if (body.is_active !== undefined) user.disabled = !body.is_active;
    if (body.password !== undefined) user.password = body.password;
    if (body.is_active === false || body.password !== undefined || roleChanged) revokeAll(user.id);
    recordAudit(actor.id, "USER_UPDATE", "USER", user.id);
    return HttpResponse.json(toItem(user));
  }),

  http.post(`${API}/users/:id/revoke-sessions`, ({ request, params }) => {
    const [actor, denied] = requireRole(request, ["ADMIN"]);
    if (denied) return denied;
    const user = mockUsers.find((u) => u.id === params.id);
    if (!user) return apiError(404, "NOT_FOUND", "Không tìm thấy tài khoản.");
    revokeAll(user.id);
    recordAudit(actor.id, "SESSIONS_REVOKED", "USER", user.id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${API}/audit-logs`, ({ request }) => {
    const [, denied] = requireRole(request, ["ADMIN"]);
    if (denied) return denied;
    if (!seeded) resetMockAudit();
    const q = new URL(request.url).searchParams;
    const page = Number(q.get("page") ?? 1);
    const pageSize = Number(q.get("page_size") ?? 20);
    const userId = q.get("user_id");
    const action = q.get("action");
    const from = q.get("date_from");
    const to = q.get("date_to");
    const rows = mockAudit.filter(
      (r) =>
        (!userId || r.user?.id === userId) &&
        (!action || r.action === action) &&
        (!from || vnDayOf(r.at) >= from) &&
        (!to || vnDayOf(r.at) <= to),
    );
    const items = rows.slice((page - 1) * pageSize, page * pageSize).map(({ id, ...r }) => (void id, r));
    return HttpResponse.json({ items, page, page_size: pageSize, total: rows.length });
  }),
];
