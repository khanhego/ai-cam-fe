import { http, HttpResponse } from "msw";

import type { ClaimPatch, ClaimStatus, ClaimType, CreateClaimBody } from "@/lib/api/claims";

import { mockUsers } from "../db";
import { API, apiError, json } from "../http";
import {
  CLAIM_TRANSITIONS,
  claimDue,
  claimIsOpen,
  findCase,
  findPackage,
  mockClaims,
  mockEvidencePacks,
  mockReconAlerts,
  packSessionOf,
  packStatus,
  toClaimDetail,
  toClaimItem,
  type MockClaim,
} from "../returnsDb";
import { dashboardEvent } from "../ws";
import { reconSummary } from "./packages";
import { DASHBOARD_ROLES, requireRole } from "./session";

const TYPES: ClaimType[] = [
  "DAMAGED",
  "MISSING_ITEM",
  "WRONG_ITEM",
  "EMPTY_BOX",
  "OTHER",
  "BUYER_CLAIM",
  "LOST_IN_TRANSIT",
];
const DAY = 86_400_000;
let claimNo = 200;
let packNo = 0;
const invalid = (fields: Record<string, string>) =>
  apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", { fields });

/** Mock: lần xuất gói đầu của hồ sơ trong tập này lỗi (thử "Thử lại"); test đổi được. */
export const mockPackRules = { failFirstFor: new Set<string>(["cl-000123"]) };
export function resetMockClaimsHandlers() {
  claimNo = 200;
  packNo = 0;
  mockPackRules.failFirstFor = new Set(["cl-000123"]);
}

const updated = (c: MockClaim) =>
  dashboardEvent("claim.updated", { claim_id: c.id, status: c.status, version: c.version });

/** API-130..138 theo 02 §6.2 (BE T-110, T-112 chưa xong). */
export const claimsHandlers = [
  http.get(`${API}/claims`, ({ request }) => {
    const [user, denied] = requireRole(request, DASHBOARD_ROLES);
    if (denied) return denied;
    const p = new URL(request.url).searchParams;
    const q = p.get("q")?.trim().toUpperCase();
    const owner = p.get("owner");
    const due = p.get("due");
    const base = mockClaims.filter((c) => {
      const pkg = findPackage(c.package_id);
      const d = claimDue(c);
      return (
        (!p.get("type") || c.type === p.get("type")) &&
        (!p.get("counterparty") || c.counterparty === p.get("counterparty")) &&
        (!owner || c.owner?.id === (owner === "me" ? user.id : owner)) &&
        (!due || (due === "soon" ? d.due_soon : d.overdue)) &&
        (!q ||
          [c.code, pkg?.tracking_number, pkg?.order?.platform_order_sn].some((x) => x?.toUpperCase() === q))
      );
    });
    const status = p.get("status");
    const all = base
      .filter((c) => !status || c.status === status)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const page = Math.max(1, Number(p.get("page") ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(p.get("page_size") ?? 20) || 20));
    const counts = Object.fromEntries(
      (Object.keys(CLAIM_TRANSITIONS) as ClaimStatus[]).map((s) => [
        s,
        base.filter((c) => c.status === s).length,
      ]),
    );
    return json({
      items: all.slice((page - 1) * pageSize, page * pageSize).map((c) => toClaimItem(c)),
      page,
      page_size: pageSize,
      total: all.length,
      status_counts: counts,
    });
  }),

  http.post(`${API}/claims`, async ({ request }) => {
    const [user, denied] = requireRole(request, DASHBOARD_ROLES);
    if (denied) return denied;
    const body = (await request.json()) as Partial<CreateClaimBody>;
    const pkg = body.package_id ? findPackage(body.package_id) : undefined;
    if (!pkg) return apiError(404, "NOT_FOUND", "Không tìm thấy kiện.");
    const fields: Record<string, string> = {};
    if (!body.type || !TYPES.includes(body.type)) fields.type = "Bắt buộc";
    if (body.counterparty !== "PLATFORM" && body.counterparty !== "CARRIER") fields.counterparty = "Bắt buộc";
    if ((body.note ?? "").length > 1000) fields.note = "Tối đa 1000 ký tự";
    if (Object.keys(fields).length) return invalid(fields);
    // BR-27: một hồ sơ chưa Đóng mỗi loại / kiện (trừ LEGACY_HOLD).
    const dup = mockClaims.find(
      (c) => c.package_id === pkg.id && c.type === body.type && claimIsOpen(c) && c.source !== "LEGACY_HOLD",
    );
    if (dup)
      return apiError(409, "CLAIM_EXISTS", `Kiện này đã có hồ sơ đang mở: ${dup.code}.`, {
        claim_id: dup.id,
        code: dup.code,
      });
    const rc = body.return_case_id ? findCase(body.return_case_id) : undefined;
    const now = new Date().toISOString();
    const n = claimNo++;
    const pack = packSessionOf(pkg);
    const actor = { id: user.id, display_name: user.display_name };
    const claim: MockClaim = {
      id: `cl-${String(n).padStart(6, "0")}`,
      code: `KN-${String(n).padStart(6, "0")}`,
      type: body.type!,
      counterparty: body.counterparty!,
      status: "NEW",
      source: body.recon_alert_id ? "RECON" : "MANUAL",
      version: 1,
      package_id: pkg.id,
      return_case_id: rc?.id ?? null,
      owner: null,
      deadline_at: rc?.seller_due_at ?? new Date(Date.now() + 7 * DAY).toISOString(),
      deadline_source: rc?.seller_due_at ? "PLATFORM" : "DEFAULT",
      platform_claim_ref: null,
      recovered_amount: null,
      close_reason: null,
      created_at: now,
      closed_at: null,
      // FR-08.06: bằng chứng tự chọn — phiên đóng gói hiệu lực + phiên hoàn của kiện.
      evidence: [
        ...(pack ? [pack] : []),
        ...pkg.sessions.filter((s) => s.type === "RETURN" && s.status === "COMPLETED"),
      ].map((s, i) => ({
        id: `ev-${n}-${i}`,
        kind: "SESSION" as const,
        ref_id: s.id,
        auto: true,
        added_at: now,
      })),
      notes: body.note?.trim()
        ? [{ id: `n-${n}-0`, kind: "NOTE", text: body.note.trim(), author: actor, at: now }]
        : [],
    };
    mockClaims.push(claim);
    const alert = body.recon_alert_id ? mockReconAlerts.find((a) => a.id === body.recon_alert_id) : undefined;
    if (alert?.status === "OPEN") {
      alert.status = "RESOLVED";
      alert.closed_at = now;
      alert.resolution = { action: "OPEN_CLAIM", note: null, by: actor, at: now, claim_id: claim.id };
      dashboardEvent("recon.updated", { summary: reconSummary() });
    }
    updated(claim);
    return json(toClaimDetail(claim), { status: 201 });
  }),

  http.get(`${API}/claims/:id`, ({ request, params }) => {
    const [, denied] = requireRole(request, DASHBOARD_ROLES);
    if (denied) return denied;
    const c = mockClaims.find((x) => x.id === params.id);
    return c ? json(toClaimDetail(c)) : apiError(404, "NOT_FOUND", "Không tìm thấy hồ sơ.");
  }),

  http.patch(`${API}/claims/:id`, async ({ request, params }) => {
    const [user, denied] = requireRole(request, DASHBOARD_ROLES);
    if (denied) return denied;
    const c = mockClaims.find((x) => x.id === params.id);
    if (!c) return apiError(404, "NOT_FOUND", "Không tìm thấy hồ sơ.");
    const body = (await request.json()) as Partial<ClaimPatch>;
    if (body.version !== c.version)
      return apiError(409, "VERSION_CONFLICT", "Hồ sơ vừa được người khác cập nhật.", {
        current: toClaimDetail(c),
        updated_by: c.notes.at(-1)?.author ?? null,
      });
    if (c.status === "CLOSED") return apiError(409, "CLAIM_CLOSED", "Hồ sơ đã đóng.");
    const fields: Record<string, string> = {};
    const to = body.status;
    if (to && to !== c.status) {
      const allowed = CLAIM_TRANSITIONS[c.status];
      if (!allowed.includes(to))
        return apiError(409, "INVALID_TRANSITION", "Không chuyển được sang trạng thái này.", { allowed });
      const reason = body.reason?.trim() ?? "";
      if (to === "WON" && (!Number.isInteger(body.recovered_amount) || (body.recovered_amount ?? -1) < 0))
        fields.recovered_amount = "Nhập số tiền thu hồi (≥ 0).";
      if (
        to === "CLOSED" &&
        ["NEW", "SUBMITTED", "WAITING"].includes(c.status) &&
        (reason.length < 5 || reason.length > 500)
      )
        fields.reason = "Lý do 5–500 ký tự.";
      const ref = body.platform_claim_ref?.trim() ?? "";
      if (to === "SUBMITTED" && !ref && !reason)
        fields.platform_claim_ref = "Nhập mã tham chiếu sàn hoặc ghi chú.";
      if (ref.length > 64) fields.platform_claim_ref = "Tối đa 64 ký tự.";
    }
    if (body.owner_user_id) {
      const u = mockUsers.find((x) => x.id === body.owner_user_id);
      if (!u || u.role === "STATION" || u.disabled) fields.owner_user_id = "Người phụ trách không hợp lệ.";
    }
    if (Object.keys(fields).length) return invalid(fields);
    const at = new Date().toISOString();
    const actor = { id: user.id, display_name: user.display_name };
    const changes: string[] = [];
    if (to && to !== c.status) {
      changes.push(`Trạng thái ${c.status} → ${to}`);
      c.status = to;
      if (to === "CLOSED") {
        c.closed_at = at;
        c.close_reason = body.reason?.trim() || null;
      }
    }
    if (body.platform_claim_ref !== undefined && body.platform_claim_ref !== null)
      c.platform_claim_ref = body.platform_claim_ref.trim() || null;
    if (body.recovered_amount !== undefined && body.recovered_amount !== null)
      c.recovered_amount = body.recovered_amount;
    if (body.owner_user_id !== undefined && body.owner_user_id !== null) {
      const u = mockUsers.find((x) => x.id === body.owner_user_id)!;
      c.owner = { id: u.id, display_name: u.display_name };
      changes.push(`Phụ trách: ${u.display_name}`);
    }
    if (body.deadline_at) {
      c.deadline_at = body.deadline_at;
      c.deadline_source = "MANUAL";
      changes.push("Đổi hạn");
    }
    if (changes.length)
      c.notes.push({
        id: `n-${c.id}-${c.notes.length}`,
        kind: "STATUS_CHANGE",
        text: changes.join(" · "),
        author: actor,
        at,
      });
    c.version += 1;
    updated(c);
    return json(toClaimDetail(c));
  }),

  http.put(`${API}/claims/:id/evidence`, async ({ request, params }) => {
    const [user, denied] = requireRole(request, DASHBOARD_ROLES);
    if (denied) return denied;
    const c = mockClaims.find((x) => x.id === params.id);
    if (!c) return apiError(404, "NOT_FOUND", "Không tìm thấy hồ sơ.");
    const body = (await request.json()) as {
      version?: number;
      session_ids?: string[];
      snapshot_ids?: string[];
      note?: string | null;
    };
    if (body.version !== c.version)
      return apiError(409, "VERSION_CONFLICT", "Hồ sơ vừa được người khác cập nhật.", {
        current: toClaimDetail(c),
      });
    if (c.status === "CLOSED") return apiError(409, "CLAIM_CLOSED", "Hồ sơ đã đóng.");
    const rc = c.return_case_id ? findCase(c.return_case_id) : undefined;
    const pkgIds = new Set([c.package_id, ...(rc?.package_ids ?? [])]);
    const sessions = [...pkgIds].flatMap((id) => findPackage(id)?.sessions ?? []);
    const sessionIds = body.session_ids ?? [];
    const snapshotIds = body.snapshot_ids ?? [];
    const fields: Record<string, string> = {};
    if (sessionIds.some((id) => !sessions.some((s) => s.id === id)))
      fields.session_ids = "Phiên không thuộc kiện.";
    if (snapshotIds.some((id) => !sessions.some((s) => s.snapshots?.some((x) => x.id === id))))
      fields.snapshot_ids = "Ảnh không thuộc kiện.";
    const keep = new Set([...sessionIds, ...snapshotIds]);
    const removedAuto = c.evidence.filter((e) => e.auto && !keep.has(e.ref_id));
    const note = body.note?.trim() ?? "";
    if (removedAuto.length && (note.length < 5 || note.length > 500))
      fields.note = "Nhập lý do bỏ bằng chứng (5–500 ký tự).";
    if (Object.keys(fields).length) return invalid(fields);
    const at = new Date().toISOString();
    const kept = c.evidence.filter((e) => keep.has(e.ref_id));
    const added = [...keep]
      .filter((id) => !kept.some((e) => e.ref_id === id))
      .map((id, i) => ({
        id: `ev-${c.id}-${Date.now()}-${i}`,
        kind: sessionIds.includes(id) ? ("SESSION" as const) : ("SNAPSHOT" as const),
        ref_id: id,
        auto: false,
        added_at: at,
      }));
    c.evidence = [...kept, ...added];
    if (removedAuto.length)
      c.notes.push({
        id: `n-${c.id}-${c.notes.length}`,
        kind: "NOTE",
        text: `Bỏ bằng chứng: ${note}`,
        author: { id: user.id, display_name: user.display_name },
        at,
      });
    c.version += 1;
    updated(c);
    return json(toClaimDetail(c));
  }),

  http.post(`${API}/claims/:id/notes`, async ({ request, params }) => {
    const [user, denied] = requireRole(request, DASHBOARD_ROLES);
    if (denied) return denied;
    const c = mockClaims.find((x) => x.id === params.id);
    if (!c) return apiError(404, "NOT_FOUND", "Không tìm thấy hồ sơ.");
    const text = ((await request.json()) as { text?: string }).text?.trim() ?? "";
    if (text.length < 1 || text.length > 1000) return invalid({ text: "Ghi chú 1–1000 ký tự." });
    const note = {
      id: `n-${c.id}-${c.notes.length}`,
      kind: "NOTE" as const,
      text,
      author: { id: user.id, display_name: user.display_name },
      at: new Date().toISOString(),
    };
    c.notes.push(note);
    c.version += 1;
    updated(c);
    return json(note, { status: 201 });
  }),

  http.post(`${API}/claims/:id/evidence-packs`, ({ request, params }) => {
    const [user, denied] = requireRole(request, DASHBOARD_ROLES);
    if (denied) return denied;
    const c = mockClaims.find((x) => x.id === params.id);
    if (!c) return apiError(404, "NOT_FOUND", "Không tìm thấy hồ sơ.");
    if (c.evidence.length === 0) return apiError(409, "NO_EVIDENCE", "Hồ sơ chưa có bằng chứng.");
    const running = [...mockEvidencePacks.values()].find(
      (p) => p.claim_id === c.id && ["QUEUED", "RUNNING"].includes(packStatus(p).status),
    );
    if (running)
      return apiError(409, "PACK_IN_PROGRESS", "Gói bằng chứng đang được tạo.", { pack_id: running.id });
    const pack = {
      id: `pack-${++packNo}`,
      claim_id: c.id,
      created_by: user.id,
      started: Date.now(),
      fail: mockPackRules.failFirstFor.delete(c.id),
    };
    mockEvidencePacks.set(pack.id, pack);
    dashboardEvent("evidence_pack.updated", { id: pack.id, claim_id: c.id, status: "QUEUED", progress: 0 });
    return json({ id: pack.id, status: "QUEUED", progress: 0 }, { status: 202 });
  }),

  http.get(`${API}/evidence-packs/:id`, ({ request, params }) => {
    const [user, denied] = requireRole(request, DASHBOARD_ROLES);
    if (denied) return denied;
    const p = mockEvidencePacks.get(String(params.id));
    if (!p || (p.created_by !== user.id && user.role !== "ADMIN"))
      return apiError(404, "NOT_FOUND", "Không tìm thấy gói bằng chứng.");
    const st = packStatus(p);
    const ready = st.status === "READY";
    if (st.status === "READY" || st.status === "FAILED")
      dashboardEvent("evidence_pack.updated", { id: p.id, claim_id: p.claim_id, ...st });
    return json({
      id: p.id,
      claim_id: p.claim_id,
      ...st,
      sha256: ready ? "5994471abb01112afcc18159f6cc74b4f511b99806da59b3caf5a9c173cacfc5" : null,
      size_bytes: ready ? 464 : null,
      missing: [],
      files: ready
        ? { zip: `${API}/media/evidence-packs/${p.id}/pack.zip?uid=${user.id}&exp=1790000000&sig=mock` }
        : null,
      expires_at: ready ? new Date(p.started + 24 * 3600_000).toISOString() : null,
    });
  }),

  // API-138: mock chuyển tới zip mẫu tĩnh (bị xóa khỏi `dist`).
  http.get(
    `${API}/media/evidence-packs/:id/pack.zip`,
    () => new HttpResponse(null, { status: 302, headers: { Location: "/mock/KN-000124.zip" } }),
  ),
];
