import { http } from "msw";

import { vnDay } from "@/shared/format";

import { API, apiError, json } from "../http";
import { mockReconAlerts, reconState, toReconAlert } from "../returnsDb";
import { dashboardEvent } from "../ws";
import { reconSummary } from "./packages";
import { DASHBOARD_ROLES, requireRole } from "./session";

const SEVERITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;

/** API-120, 121, 123 theo 02 §6.2 (BE T-113 chưa xong). API-122 ở `packages.ts`. */
export const reconHandlers = [
  http.get(`${API}/recon-alerts`, ({ request }) => {
    const [, denied] = requireRole(request, DASHBOARD_ROLES);
    if (denied) return denied;
    const p = new URL(request.url).searchParams;
    const status = p.get("status");
    const severity = p.get("severity");
    const rule = p.get("rule");
    const pkgId = p.get("package_id");
    const from = p.get("date_from");
    const to = p.get("date_to");
    const all = mockReconAlerts
      .filter(
        (a) =>
          (!status || a.status === status) &&
          (!severity || a.severity === severity) &&
          (!rule || a.rule === rule) &&
          (!pkgId || a.package_id === pkgId) &&
          (!from || vnDay(a.detected_at) >= from) &&
          (!to || vnDay(a.detected_at) <= to),
      )
      // Mức (HIGH trước) rồi detected_at cũ trước (02 §6.2 API-120).
      .sort(
        (a, b) =>
          SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
          a.detected_at.localeCompare(b.detected_at),
      );
    const page = Math.max(1, Number(p.get("page") ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(p.get("page_size") ?? 20) || 20));
    return json({
      items: all.slice((page - 1) * pageSize, page * pageSize).map(toReconAlert),
      page,
      page_size: pageSize,
      total: all.length,
      summary: reconSummary(),
    });
  }),

  http.post(`${API}/recon-alerts/:id/resolve`, async ({ request, params }) => {
    const [user, denied] = requireRole(request, ["ADMIN", "SUPERVISOR"]);
    if (denied) return denied;
    const alert = mockReconAlerts.find((a) => a.id === params.id);
    if (!alert) return apiError(404, "NOT_FOUND", "Không tìm thấy cảnh báo.");
    const body = (await request.json()) as { note?: string };
    const note = body.note?.trim() ?? "";
    if (note.length < 1 || note.length > 500)
      return apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", {
        fields: { note: "Ghi chú 1–500 ký tự." },
      });
    if (alert.status !== "OPEN")
      return apiError(409, "ALREADY_RESOLVED", "Cảnh báo này đã được xử lý.", {
        status: alert.status,
        closed_at: alert.closed_at,
        resolved_by: alert.resolution?.by ?? null,
      });
    const at = new Date().toISOString();
    alert.status = "RESOLVED";
    alert.closed_at = at;
    alert.resolution = { action: "RESOLVE", note, by: { id: user.id, display_name: user.display_name }, at };
    dashboardEvent("recon.updated", { summary: reconSummary() });
    return json(toReconAlert(alert));
  }),

  http.post(`${API}/recon/run`, ({ request }) => {
    const [, denied] = requireRole(request, ["ADMIN", "SUPERVISOR"]);
    if (denied) return denied;
    if (reconState.running) return apiError(409, "RECON_IN_PROGRESS", "Đối soát đang chạy.");
    reconState.running = true;
    // Mock J-14: xong sau 2 giây, phát `recon.updated`.
    setTimeout(() => {
      reconState.running = false;
      dashboardEvent("recon.updated", { summary: reconSummary() });
    }, 2000);
    return json({ queued: true }, { status: 202 });
  }),
];
