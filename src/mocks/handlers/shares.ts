import { http } from "msw";

import { SHARE_LIST_STATUSES, type ShareListStatus } from "@/lib/api/shares";

import { API, apiError, json } from "../http";
import { findPackage, findSessionAnywhere, mockClaims } from "../returnsDb";
import {
  canRevoke,
  createShare,
  inListStatus,
  mockCloud,
  mockShares,
  refreshShare,
  shareOptions,
  tickShare,
  toShare,
  type MockShare,
} from "../sharesDb";
import { dashboardEvent } from "../ws";
import { DASHBOARD_ROLES, requireRole } from "./session";

/** API-160..164 (02 §6.2) trên `sharesDb` — 02b-admin §12. */
const announce = (s: MockShare) =>
  dashboardEvent("share.updated", { share_id: s.id, status: s.status, progress: s.progress, step: s.step });

const invalid = (fields: Record<string, string>) =>
  apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", { fields });

export const sharesHandlers = [
  http.get(`${API}/shares/options`, ({ request }) => {
    const [, denied] = requireRole(request, DASHBOARD_ROLES);
    if (denied) return denied;
    const p = new URL(request.url).searchParams;
    const claimId = p.get("claim_id");
    const sessionId = p.get("session_id");
    if (Boolean(claimId) === Boolean(sessionId))
      return apiError(422, "VALIDATION_ERROR", "Cần đúng một trong claim_id, session_id.", {
        fields: { claim_id: "Cần đúng một nguồn" },
      });
    const opts = shareOptions({ claim_id: claimId, session_id: sessionId });
    return opts ? json(opts) : apiError(404, "NOT_FOUND", "Không tìm thấy hồ sơ / phiên.");
  }),

  http.post(`${API}/shares`, async ({ request }) => {
    const [user, denied] = requireRole(request, DASHBOARD_ROLES);
    if (denied) return denied;
    const body = (await request.json()) as {
      source_type?: "CLAIM" | "SESSION";
      claim_id?: string | null;
      session_id?: string | null;
      session_ids?: string[];
      layout?: "SIDE_BY_SIDE" | "CAM1";
      include_snapshots?: boolean;
      recipient?: string;
      expires_days?: number;
    };
    const isClaim = body.source_type === "CLAIM";
    const opts = shareOptions(isClaim ? { claim_id: body.claim_id } : { session_id: body.session_id });
    if (!opts) return apiError(404, "NOT_FOUND", "Không tìm thấy hồ sơ / phiên.");
    if (!mockCloud.configured)
      return apiError(503, "CLOUD_NOT_CONFIGURED", "Chưa cấu hình kho lưu cloud. Admin: Cài đặt → Sao lưu.");
    const ids = body.session_ids ?? [];
    const fields: Record<string, string> = {};
    const byId = new Map(opts.sessions.map((s) => [s.id, s]));
    if (ids.length < 1) fields.session_ids = "Chọn ít nhất 1 phiên.";
    else if (ids.length > opts.limits.max_sessions) fields.session_ids = "Chọn tối đa 4 phiên.";
    else if (ids.some((id) => !byId.has(id))) fields.session_ids = "Phiên không thuộc hồ sơ này.";
    else if (ids.reduce((n, id) => n + (byId.get(id)?.duration_s ?? 0), 0) > opts.limits.max_total_seconds)
      fields.session_ids = "Tổng thời lượng tối đa 30 phút.";
    const recipient = body.recipient?.trim() ?? "";
    if (recipient.length < 3 || recipient.length > 100) fields.recipient = "Ghi rõ gửi cho ai (3–100 ký tự).";
    if (![1, 3, 7].includes(body.expires_days ?? 0)) fields.expires_days = "Chỉ chọn 1, 3 hoặc 7 ngày.";
    if (body.layout !== "SIDE_BY_SIDE" && body.layout !== "CAM1") fields.layout = "Không hợp lệ";
    if (Object.keys(fields).length) return invalid(fields);
    const bad = ids.map((id) => byId.get(id)!).find((s) => !s.selectable);
    if (bad)
      return apiError(409, "SESSION_CLIP_UNAVAILABLE", "Phiên vừa mất clip — chọn lại phiên.", {
        session_id: bad.id,
        reason: bad.unavailable_reason,
      });
    const claim = isClaim ? (mockClaims.find((c) => c.id === body.claim_id) ?? null) : null;
    const pkg = findPackage(opts.source.package_id) ?? findSessionAnywhere(ids[0]!)?.pkg;
    if (!pkg) return apiError(404, "NOT_FOUND", "Không tìm thấy kiện.");
    const share = createShare(
      {
        claim_id: claim?.id ?? null,
        session_id: isClaim ? null : (body.session_id ?? null),
        session_ids: ids,
        layout: body.layout!,
        include_snapshots: Boolean(body.include_snapshots),
        recipient,
        expires_days: body.expires_days!,
      },
      user,
      pkg,
      claim,
    );
    announce(share);
    return json({ id: share.id, status: share.status }, { status: 202 });
  }),

  http.get(`${API}/shares`, ({ request }) => {
    const [user, denied] = requireRole(request, DASHBOARD_ROLES);
    if (denied) return denied;
    const p = new URL(request.url).searchParams;
    const statusRaw = p.get("status") ?? "ACTIVE";
    const status = (SHARE_LIST_STATUSES as readonly string[]).includes(statusRaw)
      ? (statusRaw as ShareListStatus)
      : "ACTIVE";
    const q = p.get("q")?.trim().toUpperCase();
    if ((q?.length ?? 0) > 64) return invalid({ q: "Tối đa 64 ký tự" });
    const createdBy = p.get("mine") === "true" ? user.id : p.get("created_by");
    const claimId = p.get("claim_id");
    const packageId = p.get("package_id");
    mockShares.forEach((s) => refreshShare(s));
    const base = mockShares.filter(
      (s) =>
        (!q ||
          s.source.tracking_number.toUpperCase().includes(q) ||
          (s.source.claim_code ?? "").toUpperCase().includes(q) ||
          s.recipient.toUpperCase().includes(q)) &&
        (!createdBy || s.created_by?.id === createdBy) &&
        (!claimId || s.source.claim_id === claimId) &&
        (!packageId || s.source.package_id === packageId),
    );
    const counts = Object.fromEntries(
      SHARE_LIST_STATUSES.map((st) => [st, base.filter((s) => inListStatus(s, st)).length]),
    ) as Record<ShareListStatus, number>;
    const all = base
      .filter((s) => inListStatus(s, status))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const page = Math.max(1, Number(p.get("page") ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(p.get("page_size") ?? 20) || 20));
    return json({
      items: all.slice((page - 1) * pageSize, page * pageSize).map((s) => toShare(s, user)),
      page,
      page_size: pageSize,
      total: all.length,
      counts,
    });
  }),

  http.get(`${API}/shares/:id`, ({ request, params }) => {
    const [user, denied] = requireRole(request, DASHBOARD_ROLES);
    if (denied) return denied;
    const share = mockShares.find((s) => s.id === params.id);
    if (!share) return apiError(404, "NOT_FOUND", "Không tìm thấy link.");
    // Mock: mỗi lần đọc một bước dựng; thu hồi xong trên cloud ở lần đọc sau.
    if (tickShare(share)) announce(share);
    else if (share.revoke_pending) share.revoke_pending = false;
    return json(toShare(share, user, true));
  }),

  http.post(`${API}/shares/:id/revoke`, ({ request, params }) => {
    const [user, denied] = requireRole(request, DASHBOARD_ROLES);
    if (denied) return denied;
    const share = mockShares.find((s) => s.id === params.id);
    if (!share) return apiError(404, "NOT_FOUND", "Không tìm thấy link.");
    refreshShare(share);
    if (share.status !== "ACTIVE" && share.status !== "CREATING")
      return apiError(409, "SHARE_NOT_ACTIVE", "Link đã thu hồi, hết hạn hoặc bị lỗi.");
    if (!canRevoke(share, user))
      return apiError(403, "FORBIDDEN", "Chỉ người tạo link hoặc Admin / Supervisor được thu hồi.");
    Object.assign(share, {
      status: "REVOKED",
      url: null,
      revoked_at: new Date().toISOString(),
      revoked_by: { id: user.id, display_name: user.display_name },
      revoke_pending: true,
      ticks: 0,
    });
    announce(share);
    return json(toShare(share, user, true));
  }),
];
