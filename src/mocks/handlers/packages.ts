import { http, HttpResponse } from "msw";

import { daysBetween, vnDay } from "@/shared/format";

import { API, apiError } from "../http";
import { mockPackages, toDetail, toListItem, type MockPackage, type MockSession } from "../packagesDb";
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
  const source = params.get("source");
  const dated = Boolean(from || to);

  const match = (p: MockPackage) => {
    if (q && p.tracking_number.toUpperCase() !== q && p.order?.platform_order_sn.toUpperCase() !== q)
      return false;
    if (warehouse && p.warehouse_status !== warehouse) return false;
    if (source && p.order?.source !== source) return false;
    const needSession = dated || stationId || sessionStatus || sessionFlag;
    if (!needSession) return true;
    return p.sessions.some(
      (s) =>
        (!dated || inRange(s, from, to)) &&
        (!stationId || s.station_id === stationId) &&
        (!sessionStatus || s.status === sessionStatus) &&
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
    const items = all.slice((page - 1) * pageSize, page * pageSize).map(toListItem);
    return HttpResponse.json({ items, page, page_size: pageSize, total: all.length });
  }),

  http.get(`${API}/packages/:id`, ({ request, params }) => {
    const [, denied] = requireRole(request, DASHBOARD_ROLES);
    if (denied) return denied;
    const pkg = mockPackages.find((p) => p.id === params.id);
    return pkg ? HttpResponse.json(toDetail(pkg)) : apiError(404, "NOT_FOUND", "Không tìm thấy kiện.");
  }),
];
