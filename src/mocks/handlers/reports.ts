import { http, HttpResponse } from "msw";

import type { AttentionItem, DailyReport, ReturnAttentionItem } from "@/lib/api/reports";
import { vnDay } from "@/shared/format";

import { API, apiError } from "../http";
import { allSessions, mockPackages, STATIONS } from "../packagesDb";
import { claimDue, mockClaims, mockReconAlerts, mockReturnCases } from "../returnsDb";
import { stationSim } from "../stationSim";
import { pendingApprovals } from "./approvals";
import { DASHBOARD_ROLES, requireRole } from "./session";
import { mockStations } from "./stations";

/** Mục "Cần xử lý" không suy ra được từ dữ liệu mock (ổ đĩa, đồng bộ) — test đổi được. */
export const mockAttentionExtra: AttentionItem[] = [];
export function resetMockReports() {
  mockAttentionExtra.splice(0, mockAttentionExtra.length, { kind: "DISK_USAGE", percent: 83 });
}
resetMockReports();

/** API-32 theo định nghĩa đếm trong 02 §6.2 (phiên theo ngày Việt Nam). */
export function dailyReport(date: string): DailyReport {
  // Số Phase 1 chỉ đếm phiên đóng gói (phiên RETURN của item 02 có số riêng — 02 §6.2 API-32 mở rộng).
  const sessions = allSessions().filter((s) => (s.type ?? "PACK") === "PACK");
  const endedOn = (status: string) =>
    sessions.filter((s) => s.status === status && s.ended_at && vnDay(s.ended_at) === date).length;
  const pkgCount = (status: string) => mockPackages.filter((p) => p.warehouse_status === status).length;

  const stations = Object.entries(STATIONS).map(([id, name]) => {
    const st = mockStations.find((s) => s.id === id);
    const last = sessions
      .filter((s) => s.station_id === id)
      .map((s) => s.ended_at ?? s.started_at)
      .sort()
      .at(-1);
    return {
      id,
      name: st?.name ?? name,
      state: "READY" as DailyReport["stations"][number]["state"],
      // item 02 (02 §6.2 API-32 `stations[]` thêm). TST Station 01 lấy từ station giả.
      work_mode: id === "st-1" ? stationSim.workMode : ("PACK" as const),
      operator_name: id === "st-1" ? stationSim.operatorName : null,
      cameras: (st?.cameras ?? []).map((c) => ({ role: c.role, status: c.status })),
      last_scan_at: last ?? null,
    };
  });

  const attention: (AttentionItem | ReturnAttentionItem)[] = [];
  const cap = pkgCount("CANCELLED_AFTER_PACK");
  if (cap > 0) attention.push({ kind: "CANCELLED_AFTER_PACK", count: cap });
  for (const st of mockStations)
    for (const c of st.cameras) {
      if (c.status === "OFFLINE")
        attention.push({ kind: "CAMERA_OFFLINE", camera_id: c.id, station_name: st.name, role: c.role });
      if (c.clock_offset_ms !== null && Math.abs(c.clock_offset_ms) > 1000)
        attention.push({ kind: "CLOCK_DRIFT", camera_id: c.id, offset_ms: c.clock_offset_ms });
    }
  const approvals = pendingApprovals().length;
  if (approvals > 0) attention.push({ kind: "APPROVAL_PENDING", count: approvals });
  attention.push(...mockAttentionExtra);
  // item 02: mục mới (02 §6.2 API-32, §6.3 #13, §6.5 #1).
  const missing = mockReturnCases.filter((c) => c.status === "MISSING").length;
  const reconHigh = mockReconAlerts.filter((a) => a.status === "OPEN" && a.severity === "HIGH").length;
  const dueSoon = mockClaims.filter((c) => claimDue(c).due_soon).length;
  const unidentified = mockReturnCases.filter(
    (c) => c.kind === "UNIDENTIFIED" && !c.order && c.status !== "CANCELLED",
  ).length;
  if (missing) attention.push({ kind: "RETURN_MISSING", count: missing });
  if (reconHigh) attention.push({ kind: "RECON_HIGH", count: reconHigh });
  if (dueSoon) attention.push({ kind: "CLAIM_DUE_SOON", count: dueSoon });
  if (unidentified) attention.push({ kind: "RETURN_UNIDENTIFIED", count: unidentified });

  const returnSessions = allSessions().filter(
    (s) => s.type === "RETURN" && s.status === "COMPLETED" && s.ended_at && vnDay(s.ended_at) === date,
  );
  const received = returnSessions.filter(
    (s) => !mockPackages.find((p) => p.id === s.package_id)?.is_placeholder,
  );
  const packEnded = sessions.filter(
    (s) => s.status === "COMPLETED" && s.ended_at && vnDay(s.ended_at) === date,
  );
  const open = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const a of mockReconAlerts) if (a.status === "OPEN") open[a.severity] += 1;

  return {
    date,
    counts: {
      packed: endedOn("COMPLETED"),
      had_mismatch: sessions.filter((s) => s.flags.includes("HAD_MISMATCH") && vnDay(s.started_at) === date)
        .length,
      abandoned: endedOn("ABANDONED"),
      cancelled: endedOn("CANCELLED"),
      packed_not_handed_over: pkgCount("PACKED"),
      cancelled_after_pack: cap,
      returns_received: received.length,
      returns_received_issue: received.filter(
        (s) => s.inspection?.conclusion && s.inspection.conclusion !== "OK",
      ).length,
      returns_unidentified: returnSessions.length - received.length,
      returns_expected: mockReturnCases.filter((c) => ["EXPECTED", "PARTIALLY_RECEIVED"].includes(c.status))
        .length,
      returns_missing: missing,
      recon_open: open,
      claims_open: mockClaims.filter((c) => c.status !== "CLOSED").length,
      claims_due_soon: dueSoon,
      label_on_tray: packEnded.filter((s) => s.flags.includes("LABEL_ON_TRAY")).length,
      cam2_unverified: packEnded.filter((s) => s.flags.includes("CAM2_UNVERIFIED")).length,
    },
    stations,
    attention,
  };
}

export const reportsHandlers = [
  http.get(`${API}/reports/daily`, ({ request }) => {
    const [, denied] = requireRole(request, DASHBOARD_ROLES);
    if (denied) return denied;
    const date = new URL(request.url).searchParams.get("date") ?? vnDay();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      return apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", {
        fields: { date: "Sai định dạng" },
      });
    return HttpResponse.json(dailyReport(date));
  }),
];
