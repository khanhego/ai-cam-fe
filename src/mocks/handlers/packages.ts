import { http } from "msw";

import { daysBetween, vnDay } from "@/shared/format";

import type { AdjustStatusResult, Clip, PackageDetail, PackageSession } from "@/lib/api/packages";
import type { WarehouseStatus } from "@/shared/labels";

import { API, apiError, json } from "../http";
import { mockPackages, toDetail, toListItem, type MockPackage, type MockSession } from "../packagesDb";
import {
  allowedTargets,
  caseOfPackage,
  findPackage,
  mockReconAlerts,
  mockReturnCases,
  packageReturnExtras,
  protectionOf,
  sessionExtras,
  toReconAlert,
} from "../returnsDb";
import { dashboardEvent } from "../ws";
import { DASHBOARD_ROLES, requireRole } from "./session";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Phiên nằm trong khoảng ngày (theo ngày Việt Nam của giờ mở hoặc giờ đóng). */
function inRange(s: MockSession, from: string | null, to: string | null) {
  const days = [vnDay(s.started_at), s.ended_at ? vnDay(s.ended_at) : null].filter(Boolean) as string[];
  return days.some((d) => (!from || d >= from) && (!to || d <= to));
}

/** API-30 theo 02 §6.2: `q` khớp chính xác mã vận đơn / mã đơn sàn (không phân biệt hoa thường). */
function search(params: URLSearchParams) {
  const q = params.get("q")?.trim().toUpperCase();
  const from = params.get("date_from");
  const to = params.get("date_to");
  const stationId = params.get("station_id");
  const warehouse = params.get("warehouse_status");
  const sessionStatus = params.get("session_status");
  const sessionFlag = params.get("session_flag");
  const sessionType = params.get("session_type");
  const source = params.get("source");
  const dated = Boolean(from || to);

  // item 02: `q` khớp thêm mã chiều về, mã hồ sơ HH- (02 §6.2 API-30 mở rộng).
  const byReturn = q
    ? new Set(
        mockReturnCases
          .filter((c) => c.return_tracking_number?.toUpperCase() === q || c.code.toUpperCase() === q)
          .flatMap((c) => c.package_ids),
      )
    : new Set<string>();
  const match = (p: MockPackage) => {
    if (
      q &&
      p.tracking_number.toUpperCase() !== q &&
      p.order?.platform_order_sn.toUpperCase() !== q &&
      !byReturn.has(p.id)
    )
      return false;
    if (warehouse && p.warehouse_status !== warehouse) return false;
    if (source && p.order?.source !== source) return false;
    const needSession = dated || stationId || sessionStatus || sessionFlag || sessionType;
    if (!needSession) return true;
    return p.sessions.some(
      (s) =>
        (!dated || inRange(s, from, to)) &&
        (!stationId || s.station_id === stationId) &&
        (!sessionStatus || s.status === sessionStatus) &&
        (!sessionType || (s.type ?? "PACK") === sessionType) &&
        (!sessionFlag || s.flags.includes(sessionFlag as MockSession["flags"][number])),
    );
  };
  const last = (p: MockPackage) => p.sessions[0]?.ended_at ?? p.sessions[0]?.started_at ?? "";
  return mockPackages
    .filter(match)
    .sort((a, b) => last(b).localeCompare(last(a)) || a.tracking_number.localeCompare(b.tracking_number));
}

export const packagesHandlers = [
  http.get(`${API}/packages`, ({ request }) => {
    const [, denied] = requireRole(request, DASHBOARD_ROLES);
    if (denied) return denied;
    const params = new URL(request.url).searchParams;
    const fields: Record<string, string> = {};
    const from = params.get("date_from");
    const to = params.get("date_to");
    if ((params.get("q") ?? "").length > 64) fields.q = "Tối đa 64 ký tự";
    if (from && !DATE.test(from)) fields.date_from = "Sai định dạng ngày";
    if (to && !DATE.test(to)) fields.date_to = "Sai định dạng ngày";
    if (from && to && DATE.test(from) && DATE.test(to)) {
      if (from > to) fields.date_to = "Ngày đến phải sau ngày từ";
      else if (daysBetween(from, to) > 92) fields.date_to = "Khoảng ngày tối đa 92 ngày";
    }
    if (Object.keys(fields).length)
      return apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", { fields });

    const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.get("page_size") ?? 20) || 20));
    const all = search(params);
    const items = all.slice((page - 1) * pageSize, page * pageSize).map((p) => {
      const rc = caseOfPackage(p.id);
      return {
        ...toListItem(p),
        return_case: rc ? { id: rc.id, code: rc.code, kind: rc.kind, status: rc.status } : null,
        is_placeholder: Boolean(p.is_placeholder),
      };
    });
    return json({ items, page, page_size: pageSize, total: all.length });
  }),

  http.get(`${API}/packages/:id`, ({ request, params }) => {
    const [user, denied] = requireRole(request, DASHBOARD_ROLES);
    if (denied) return denied;
    const pkg = mockPackages.find((p) => p.id === params.id);
    if (!pkg) return apiError(404, "NOT_FOUND", "Không tìm thấy kiện.");
    const detail = toDetail(pkg);
    const body: PackageDetail = {
      ...detail,
      ...packageReturnExtras(pkg),
      // Chỉ ADMIN / SUPERVISOR có quyền điều chỉnh → vai khác nhận danh sách rỗng (ẩn menu).
      allowed_status_targets: user.role === "CSKH" ? [] : allowedTargets(pkg),
      sessions: detail.sessions.map((s, i): PackageSession => {
        const ms = pkg.sessions[i]!;
        const protection = protectionOf(ms);
        return {
          ...s,
          ...sessionExtras(ms, user.role),
          clips: s.clips.map((c): Clip => {
            const p = protectionOf(ms, c.held);
            return { ...c, protected_by_claim: Boolean(protection?.claims.length), protection: p };
          }),
        };
      }),
    };
    return json(body);
  }),

  // API-122 (02 §6.2): điều chỉnh tay trạng thái kho (L6, FR-06.05).
  http.post(`${API}/packages/:id/warehouse-status`, async ({ request, params }) => {
    const [user, denied] = requireRole(request, ["ADMIN", "SUPERVISOR"]);
    if (denied) return denied;
    const pkg = findPackage(String(params.id));
    if (!pkg) return apiError(404, "NOT_FOUND", "Không tìm thấy kiện.");
    const body = (await request.json()) as {
      to_status?: WarehouseStatus;
      reason?: string;
      recon_alert_id?: string;
    };
    const reason = body.reason?.trim() ?? "";
    if (reason.length < 5 || reason.length > 500)
      return apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", {
        fields: { reason: "Lý do 5–500 ký tự." },
      });
    if (pkg.warehouse_status === "PACKING" || pkg.warehouse_status === "RETURN_INSPECTING")
      return apiError(409, "SESSION_ACTIVE", "Kiện đang có phiên mở ở station.");
    const allowed = allowedTargets(pkg);
    if (!body.to_status || !allowed.includes(body.to_status))
      return apiError(409, "TRANSITION_NOT_ALLOWED", "Không được chuyển trạng thái kho này bằng tay.", {
        from: pkg.warehouse_status,
        allowed,
      });
    const from = pkg.warehouse_status;
    pkg.warehouse_status = body.to_status;
    const at = new Date().toISOString();
    pkg.timeline.unshift({
      at,
      source: "MANUAL",
      from_status: from,
      to_status: body.to_status,
      actor: user.display_name,
    });
    const alert = body.recon_alert_id ? mockReconAlerts.find((a) => a.id === body.recon_alert_id) : undefined;
    if (alert && alert.status === "OPEN") {
      alert.status = "RESOLVED";
      alert.closed_at = at;
      alert.resolution = {
        action: "ADJUST_STATUS",
        note: reason,
        by: { id: user.id, display_name: user.display_name },
        at,
        to_status: body.to_status,
      };
      dashboardEvent("recon.updated", { summary: reconSummary() });
    }
    const result: AdjustStatusResult = {
      package: { id: pkg.id, tracking_number: pkg.tracking_number, warehouse_status: pkg.warehouse_status },
      recon_alert: alert ? toReconAlert(alert) : null,
    };
    return json(result);
  }),
];

export function reconSummary() {
  const open = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const a of mockReconAlerts) if (a.status === "OPEN") open[a.severity] += 1;
  return { open };
}
