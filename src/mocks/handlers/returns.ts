import { http } from "msw";

import type { InspectionInput } from "@/shared/returns/types";
import { canBeOk, INSPECTION_LIMITS } from "@/shared/returns/inspection";
import { daysBetween, vnDay } from "@/shared/format";

import { API, apiError, json } from "../http";
import { mockPackages } from "../packagesDb";
import {
  blockedReason,
  claimIsOpen,
  createAutoClaim,
  findCase,
  findPackage,
  findSessionAnywhere,
  isCaseOpen,
  mockClaims,
  mockReturnCases,
  recomputeCase,
  sessionExtras,
  toReturnDetail,
  toReturnItem,
  type MockReturnCase,
} from "../returnsDb";
import { dashboardEvent } from "../ws";
import { DASHBOARD_ROLES, requireRole } from "./session";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86_400_000;

const TAB_STATUS: Record<string, MockReturnCase["status"][]> = {
  EXPECTED: ["EXPECTED", "INSPECTING", "PARTIALLY_RECEIVED"],
  MISSING: ["MISSING"],
  RECEIVED: ["RECEIVED_OK", "RECEIVED_ISSUE"],
  NO_PARCEL: ["NO_PARCEL"],
};

const inTab = (c: MockReturnCase, tab: string) => {
  if (tab === "ALL") return c.status !== "CANCELLED";
  if (tab === "UNIDENTIFIED") return c.kind === "UNIDENTIFIED" && c.status !== "CANCELLED" && !c.order;
  return (TAB_STATUS[tab] ?? []).includes(c.status);
};

/** Ngày lọc theo `reported_at` (UNANNOUNCED / UNIDENTIFIED: lúc tạo) — 02 §6.2 API-110. */
const filterDay = (c: MockReturnCase) => vnDay(c.reported_at ?? c.created_at);

function matchQ(c: MockReturnCase, q: string) {
  const codes = [
    c.code,
    c.return_tracking_number,
    c.platform_return_sn,
    c.order?.platform_order_sn,
    ...c.package_ids.map((id) => findPackage(id)?.tracking_number),
  ];
  return codes.some((x) => x?.toUpperCase() === q);
}

/** API-110..113 theo 02 §6.2 (BE T-104, T-115, T-119 chưa xong). */
export const returnsHandlers = [
  http.get(`${API}/returns`, ({ request }) => {
    const [, denied] = requireRole(request, DASHBOARD_ROLES);
    if (denied) return denied;
    const params = new URL(request.url).searchParams;
    const tab = params.get("tab") ?? "EXPECTED";
    const kind = params.get("kind");
    const q = params.get("q")?.trim().toUpperCase();
    const from = params.get("date_from");
    const to = params.get("date_to");
    const fields: Record<string, string> = {};
    if (!["EXPECTED", "MISSING", "RECEIVED", "NO_PARCEL", "UNIDENTIFIED", "ALL"].includes(tab))
      fields.tab = "Không hợp lệ";
    if (from && !DATE.test(from)) fields.date_from = "Sai định dạng ngày";
    if (to && !DATE.test(to)) fields.date_to = "Sai định dạng ngày";
    if (from && to && DATE.test(from) && DATE.test(to) && (from > to || daysBetween(from, to) > 92))
      fields.date_to = "Khoảng ngày tối đa 92 ngày";
    if (Object.keys(fields).length)
      return apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", { fields });

    const base = mockReturnCases.filter(
      (c) =>
        (!kind || c.kind === kind) &&
        (!q || matchQ(c, q)) &&
        (!from || filterDay(c) >= from) &&
        (!to || filterDay(c) <= to),
    );
    const all = base
      .filter((c) => inTab(c, tab))
      .sort((a, b) => (b.reported_at ?? b.created_at).localeCompare(a.reported_at ?? a.created_at));
    const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.get("page_size") ?? 20) || 20));
    const count = (t: string) => base.filter((c) => inTab(c, t)).length;
    return json({
      items: all.slice((page - 1) * pageSize, page * pageSize).map((c) => toReturnItem(c)),
      page,
      page_size: pageSize,
      total: all.length,
      tab_counts: {
        EXPECTED: count("EXPECTED"),
        MISSING: count("MISSING"),
        RECEIVED: count("RECEIVED"),
        NO_PARCEL: count("NO_PARCEL"),
        UNIDENTIFIED: count("UNIDENTIFIED"),
      },
    });
  }),

  http.get(`${API}/returns/:id`, ({ request, params }) => {
    const [, denied] = requireRole(request, DASHBOARD_ROLES);
    if (denied) return denied;
    const rc = findCase(String(params.id));
    return rc ? json(toReturnDetail(rc)) : apiError(404, "NOT_FOUND", "Không tìm thấy hồ sơ hàng hoàn.");
  }),

  // API-112 (02 §6.2, DEC-248, 260, 269): gắn đơn cho hồ sơ chưa xác định — gộp nếu đơn đã có hồ sơ mở.
  http.post(`${API}/returns/:id/link-order`, async ({ request, params }) => {
    const [, denied] = requireRole(request, ["ADMIN", "SUPERVISOR"]);
    if (denied) return denied;
    const rc = findCase(String(params.id));
    if (!rc) return apiError(404, "NOT_FOUND", "Không tìm thấy hồ sơ hàng hoàn.");
    if (rc.kind !== "UNIDENTIFIED" || rc.order || rc.status === "CANCELLED")
      return apiError(409, "NOT_UNIDENTIFIED", "Hồ sơ này không còn ở trạng thái chưa xác định.");
    const body = (await request.json()) as { package_id?: string };
    const target = body.package_id ? findPackage(body.package_id) : undefined;
    if (!target || target.is_placeholder) return apiError(404, "NOT_FOUND", "Không tìm thấy kiện.");
    if (target.sessions.some((s) => s.type === "RETURN" && s.status === "COMPLETED"))
      return apiError(409, "PACKAGE_ALREADY_RETURNED", "Đơn này đã có kiện hoàn được nhận.");
    const reason = blockedReason(target);
    if (reason === "NOT_SHIPPED")
      return apiError(409, "NOT_ELIGIBLE", "Kiện này chưa rời kho, không phải hàng hoàn.");

    // Phiên chuyển từ kiện tạm sang kiện đích; kiện tạm xóa khi không còn phiên.
    const placeholders = rc.package_ids.map(findPackage).filter((p) => p?.is_placeholder);
    let conclusion = rc.conclusion;
    for (const ph of placeholders) {
      if (!ph) continue;
      for (const s of ph.sessions) {
        s.package_id = target.id;
        target.sessions.unshift(s);
        conclusion = s.inspection?.conclusion ?? conclusion;
      }
      ph.sessions = [];
      mockPackages.splice(mockPackages.indexOf(ph), 1);
    }
    if (conclusion)
      target.warehouse_status = conclusion === "OK" ? "RETURN_RECEIVED_OK" : "RETURN_RECEIVED_ISSUE";
    const orderSn = target.order?.platform_order_sn;
    const open = mockReturnCases.find(
      (c) => c !== rc && isCaseOpen(c) && c.order?.platform_order_sn === orderSn,
    );
    let dest = rc;
    let mergedInto: { id: string; code: string } | null = null;
    if (open) {
      rc.status = "CANCELLED";
      rc.merged_into = { id: open.id, code: open.code };
      if (!open.package_ids.includes(target.id)) open.package_ids.push(target.id);
      for (const s of target.sessions) if (s.return_case_id === rc.id) s.return_case_id = open.id;
      recomputeCase(open, conclusion ?? undefined);
      dest = open;
      mergedInto = { id: open.id, code: open.code };
    } else {
      rc.order = target.order
        ? { id: target.order.id, platform_order_sn: target.order.platform_order_sn }
        : null;
      rc.kind = "UNANNOUNCED";
      rc.package_ids = [target.id];
    }
    // Hồ sơ khiếu nại chuyển sang kiện đích; trùng BR-27 → gộp vào hồ sơ đang mở.
    const mergedClaims: { from: string; into: string }[] = [];
    for (const c of mockClaims.filter((x) => x.return_case_id === rc.id)) {
      c.package_id = target.id;
      c.return_case_id = dest.id;
      const dup = mockClaims.find(
        (x) =>
          x !== c &&
          x.package_id === target.id &&
          x.type === c.type &&
          claimIsOpen(x) &&
          x.source !== "LEGACY_HOLD",
      );
      if (dup && claimIsOpen(c)) {
        dup.evidence.push(...c.evidence.filter((e) => !dup.evidence.some((d) => d.ref_id === e.ref_id)));
        dup.notes.push(...c.notes);
        dup.version += 1;
        c.status = "CLOSED";
        c.close_reason = `Gộp vào ${dup.code}`;
        c.closed_at = new Date().toISOString();
        c.version += 1;
        mergedClaims.push({ from: c.code, into: dup.code });
      }
    }
    dashboardEvent("return.updated", { return_case_id: dest.id, status: dest.status });
    return json({ ...toReturnDetail(dest), merged_into: mergedInto, merged_claims: mergedClaims });
  }),

  // API-113 (02 §6.2, DEC-261): sửa kết luận phiên hoàn đã đóng ≤ 7 ngày.
  http.put(`${API}/sessions/:id/inspection`, async ({ request, params }) => {
    const [user, denied] = requireRole(request, ["ADMIN", "SUPERVISOR"]);
    if (denied) return denied;
    const found = findSessionAnywhere(String(params.id));
    if (!found) return apiError(404, "NOT_FOUND", "Không tìm thấy phiên.");
    const { pkg, session: s } = found;
    if (s.type !== "RETURN" || s.status !== "COMPLETED" || !s.inspection)
      return apiError(409, "NOT_RETURN_SESSION", "Phiên không phải phiên mở hoàn đã hoàn tất.");
    if (!s.ended_at || Date.now() - Date.parse(s.ended_at) > 7 * DAY)
      return apiError(409, "CORRECTION_WINDOW_EXPIRED", "Đã quá 7 ngày, không sửa được.");
    const body = (await request.json()) as Partial<InspectionInput> & { reason?: string };
    const fields: Record<string, string> = {};
    const reason = body.reason?.trim() ?? "";
    if (reason.length < 5 || reason.length > 500) fields.reason = "Lý do 5–500 ký tự.";
    const note = body.note ?? "";
    if (note.length > INSPECTION_LIMITS.noteMax) fields.note = "Tối đa 500 ký tự";
    if (body.conclusion === "OTHER" && !note.trim()) fields.note = "Nhập ghi chú khi chọn Khác.";
    if (!body.conclusion) fields.conclusion = "Bắt buộc";
    const insp = s.inspection;
    const lines = insp.lines.map((line, i) => {
      const next = body.lines?.find((l) => l.order_item_id === line.order_item_id);
      if (!next) return line;
      const q = next.quantity_received;
      if (!Number.isInteger(q) || q < 0 || q > INSPECTION_LIMITS.quantityMax)
        fields[`lines.${i}.quantity_received`] = "Số nhận 0–999";
      return { ...line, quantity_received: q, condition: next.condition, note: next.note ?? null };
    });
    if (Object.keys(fields).length)
      return apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", { fields });
    const effective = insp.lines_mode === "REFERENCE" ? insp.lines : lines;
    if (body.conclusion === "OK" && !canBeOk(effective, insp.lines_mode))
      return apiError(422, "CONCLUSION_INCONSISTENT", "Có dòng thiếu / hỏng — không chọn Nguyên vẹn được.");
    const before = { conclusion: insp.conclusion, note: insp.note, lines: insp.lines };
    const conclusion = body.conclusion!;
    const at = new Date().toISOString();
    s.inspection = {
      ...insp,
      conclusion,
      note,
      lines: effective,
      corrections: [
        ...(insp.corrections ?? []),
        { at, by: { id: user.id, display_name: user.display_name }, reason, before },
      ],
    };
    if (!s.flags.includes("INSPECTION_CORRECTED")) s.flags = [...s.flags, "INSPECTION_CORRECTED"];
    pkg.warehouse_status = conclusion === "OK" ? "RETURN_RECEIVED_OK" : "RETURN_RECEIVED_ISSUE";
    const rc = s.return_case_id ? findCase(s.return_case_id) : undefined;
    if (rc) {
      recomputeCase(rc, conclusion);
      if (conclusion !== "OK") createAutoClaim(rc, pkg, s, conclusion);
      else
        for (const c of mockClaims)
          if (c.return_case_id === rc.id && c.source === "AUTO_RETURN" && c.status === "NEW") {
            c.status = "CLOSED";
            c.close_reason = "Kết luận đã sửa thành Nguyên vẹn";
            c.closed_at = at;
            c.version += 1;
          }
      dashboardEvent("return.updated", { return_case_id: rc.id, status: rc.status });
    }
    const { package_id, station_id, ...rest } = s;
    void package_id;
    void station_id;
    return json({ ...rest, ...sessionExtras(s, user.role) });
  }),
];
