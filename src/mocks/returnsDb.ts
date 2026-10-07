import type {
  ClaimDetail,
  ClaimEvidence,
  ClaimListItem,
  ClaimStatus as ApiClaimStatus,
  ClaimType as ApiClaimType,
} from "@/lib/api/claims";
import type { PackageDetail, Protection } from "@/lib/api/packages";
import type { ReconAlert, ReconRule, ReconSeverity } from "@/lib/api/recon";
import type { ReturnDetail, ReturnListItem } from "@/lib/api/returns";
import type { ShareUnavailableReason } from "@/lib/api/shares";
import type { StationItem } from "@/lib/api/station";
import type { ReturnStatusGroup, SessionStatus, WarehouseStatus } from "@/shared/labels";
import type {
  Conclusion,
  Inspection,
  LinesMode,
  ReturnCaseStatus,
  ReturnKind,
  Snapshot,
} from "@/shared/returns/types";

import { daysBetween, fmtShort, vnDay } from "@/shared/format";

import {
  mockPackages,
  platformShopOf,
  RETENTION_CLIP_DAYS,
  startOfVnDay,
  type MockPackage,
  type MockSession,
} from "./packagesDb";

/**
 * Hồ sơ hàng hoàn + hồ sơ khiếu nại giả, dùng chung station (`StationSim` chế độ RETURN) và dashboard (D4, D14, D16,
 * D17) — 02b-station §12, 02b-admin §12. Kiện nằm trong `packagesDb` (`SPXTST00000[4-5]x`, `TAM-000001`); file này giữ
 * phần hàng hoàn và mô phỏng `returns.resolve_code` / đóng phiên (02 §6.2 API-11 RETURN, §6.3–§6.5).
 */

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

export type MockReturnCase = {
  id: string;
  code: string;
  kind: ReturnKind;
  status: ReturnCaseStatus;
  order: { id: string; platform_order_sn: string } | null;
  platform_return_sn: string | null;
  platform_status: string | null;
  needs_parcel: boolean;
  return_tracking_number: string | null;
  reason: string | null;
  reason_text: string | null;
  reason_label: string | null;
  requested_items: {
    order_item_id: string;
    product_name: string;
    variation: string | null;
    quantity: number;
  }[];
  seller_due_at: string | null;
  reported_at: string | null;
  expected_since: string | null;
  received_at: string | null;
  conclusion: Conclusion | null;
  package_ids: string[];
  source: "PLATFORM" | "WAREHOUSE";
  merged_into: { id: string; code: string } | null;
  created_at: string;
  /** Hồ sơ một phiên (02 §6.4 #1): `BUYER_RETURN` hoặc đơn 1 kiện. */
  single_session: boolean;
  /** `force_new` (02 §6.5 #1) — chỉ gắn qua API-112. */
  manual_link_only?: boolean;
  /** Mã đã quét của hồ sơ chưa xác định (02 §6.4 #3). */
  open_code?: string | null;
  /** Phiên đã tạo hồ sơ (hủy phiên → hồ sơ `CANCELLED` nếu không còn phiên khác — API-12). */
  created_by_session?: string | null;
  /** Trạng thái kiện trước khi vào hồ sơ (trả một phần: kiện không về được trả lại — DEC-271). */
  before: Record<string, WarehouseStatus>;
};

export type ClaimType = ApiClaimType;
export type ClaimStatus = ApiClaimStatus;

export type MockClaimNote = {
  id: string;
  kind: "NOTE" | "STATUS_CHANGE" | "SYSTEM";
  text: string;
  author: { id: string; display_name: string } | null;
  at: string;
};

export type MockClaim = {
  id: string;
  code: string;
  type: ClaimType;
  counterparty: "PLATFORM" | "CARRIER";
  status: ClaimStatus;
  source: "AUTO_RETURN" | "MANUAL" | "RECON" | "LEGACY_HOLD";
  version: number;
  package_id: string;
  return_case_id: string | null;
  owner: { id: string; display_name: string } | null;
  deadline_at: string | null;
  deadline_source: "PLATFORM" | "DEFAULT" | "MANUAL" | "DEFAULT_PLATFORM_PASSED";
  platform_claim_ref: string | null;
  recovered_amount: number | null;
  close_reason: string | null;
  created_at: string;
  closed_at: string | null;
  /** item 03 (BR-41): lúc chuyển "Đã gửi" / có kết quả — null khi chưa. */
  submitted_at?: string | null;
  result_at?: string | null;
  /** Bằng chứng: phiên / ảnh (auto = tự chọn). */
  evidence: MockEvidenceRef[];
  notes: MockClaimNote[];
  /** item 03 (BR-38): bằng chứng đã bỏ mềm (API-132 `removed_evidence`); thêm lại = khôi phục. */
  removed?: (MockEvidenceRef & {
    removed_at: string;
    removed_by: { id: string; display_name: string } | null;
    reason: string;
    keep_until: string;
  })[];
};
export type MockEvidenceRef = {
  id: string;
  kind: "SESSION" | "SNAPSHOT";
  ref_id: string;
  auto: boolean;
  added_at: string;
};

/** item 03: cài đặt mock dùng khi tính `response_due_at` (API-80 `refund_only_default_hours` — handler settings ghi). */
export const phase3Config = { refundOnlyDefaultHours: 48 };

export const mockReturnCases: MockReturnCase[] = [];
export const mockClaims: MockClaim[] = [];

let caseSeq = 100;
let claimSeq = 125;
let placeholderSeq = 1;
let idSeq = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++idSeq}`;

export const caseCode = (n: number) => `HH-${String(n).padStart(6, "0")}`;
export const claimCode = (n: number) => `KN-${String(n).padStart(6, "0")}`;

export const findPackage = (id: string) => mockPackages.find((p) => p.id === id);
export const findPackageByCode = (code: string) =>
  mockPackages.find((p) => p.tracking_number.toUpperCase() === code.toUpperCase());
export const findCase = (id: string) => mockReturnCases.find((c) => c.id === id);

const OPEN_CASE: ReturnCaseStatus[] = ["EXPECTED", "INSPECTING", "PARTIALLY_RECEIVED", "MISSING"];
export const isCaseOpen = (c: MockReturnCase) => OPEN_CASE.includes(c.status);

/** Hồ sơ hàng hoàn của kiện: hồ sơ đang mở trước, rồi hồ sơ gần nhất chưa hủy. */
export function caseOfPackage(pkgId: string): MockReturnCase | undefined {
  const all = mockReturnCases.filter((c) => c.package_ids.includes(pkgId) && c.status !== "CANCELLED");
  return all.find(isCaseOpen) ?? all.at(-1);
}

/** Dòng sản phẩm của đơn có `order_item_id` ổn định (`oi-<mã đơn>-<thứ tự>`). */
export function itemsOf(pkg: MockPackage): StationItem[] {
  return (pkg.order?.items ?? []).map((it, i) => ({
    order_item_id: `oi-${pkg.order!.platform_order_sn}-${i + 1}`,
    product_name: it.product_name,
    variation: it.variation,
    quantity: it.quantity,
    image_url: it.image_url,
  }));
}

export const packagesOfOrder = (orderSn: string) =>
  mockPackages.filter((p) => p.order?.platform_order_sn.toUpperCase() === orderSn.toUpperCase());

const snapshotUrl = (id: string) => `/api/v1/media/snapshots/${id}?uid=mock&exp=1790000000&sig=mock`;
export const mockSnapshot = (id: string, kind: Snapshot["kind"], takenAt: string): Snapshot => ({
  id,
  kind,
  camera_role: "CAM1",
  taken_at: takenAt,
  sha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  status: "READY",
  url: snapshotUrl(id),
});

/** Phiên PACK hiệu lực gần nhất của kiện (cột "Lúc đóng gói" R2, bằng chứng hồ sơ). */
export function packSessionOf(pkg: MockPackage): MockSession | undefined {
  return pkg.sessions.find((s) => (s.type ?? "PACK") === "PACK" && s.status === "COMPLETED");
}

/** Ghi phiên RETURN vào kiện (D4 / bằng chứng thấy được). */
export function recordReturnSession(pkg: MockPackage, session: MockSession) {
  pkg.sessions.unshift(session);
}

function caseSeed(
  n: number,
  pkgs: string[],
  patch: Partial<MockReturnCase> & Pick<MockReturnCase, "kind" | "status">,
): MockReturnCase {
  const first = findPackage(pkgs[0]!);
  const order = first?.order
    ? { id: first.order.id, platform_order_sn: first.order.platform_order_sn }
    : null;
  const now = Date.now();
  const items = first ? itemsOf(first) : [];
  return {
    id: `rc-${String(n).padStart(6, "0")}`,
    code: caseCode(n),
    order,
    platform_return_sn: null,
    platform_status: null,
    needs_parcel: true,
    return_tracking_number: null,
    reason: null,
    reason_text: null,
    reason_label: null,
    requested_items:
      patch.kind === "BUYER_RETURN" || patch.kind === "REFUND_ONLY"
        ? items.map((it) => ({
            order_item_id: it.order_item_id!,
            product_name: it.product_name,
            variation: it.variation,
            quantity: it.quantity,
          }))
        : [],
    seller_due_at: null,
    reported_at: iso(now - 2 * DAY),
    expected_since: iso(now - 2 * DAY),
    received_at: null,
    conclusion: null,
    package_ids: pkgs,
    source: "PLATFORM",
    merged_into: null,
    created_at: iso(now - 2 * DAY),
    single_session: patch.kind === "BUYER_RETURN" || pkgs.length === 1,
    before: Object.fromEntries(pkgs.map((p) => [p, "DELIVERED" as WarehouseStatus])),
    ...patch,
  };
}

/** Phiên RETURN đã đóng của dữ liệu mẫu (D4 / D17 có gì để xem). */
function seedReturnSession(
  pkg: MockPackage,
  rc: MockReturnCase,
  conclusion: Conclusion,
  daysAgo: number,
  operator: string,
): MockSession {
  const start = startOfVnDay(daysAgo) + 9 * 3600_000;
  const id = `ses-rt-${pkg.tracking_number}`;
  const lines = itemsOf(pkg).map((it) => ({
    order_item_id: it.order_item_id!,
    product_name: it.product_name,
    variation: it.variation,
    image_url: it.image_url,
    quantity_sent: it.quantity,
    quantity_requested: it.quantity,
    quantity_received: conclusion === "OK" ? it.quantity : 0,
    condition: (conclusion === "OK" ? "OK" : "MISSING_ITEM") as Conclusion,
    note: null,
  }));
  return {
    id,
    package_id: pkg.id,
    station_id: "st-1",
    station_name: "TST Station 01",
    status: "COMPLETED",
    started_at: iso(start),
    ended_at: iso(start + 140_000),
    duration_s: 140,
    flags: rc.kind === "UNIDENTIFIED" ? ["UNIDENTIFIED"] : [],
    cancel_reason: null,
    note: null,
    type: "RETURN",
    operator_name: operator,
    return_case_id: rc.id,
    inspection: {
      conclusion,
      note: conclusion === "EMPTY_BOX" ? "Hộp còn nguyên băng keo, bên trong trống" : "",
      saved_at: iso(start + 120_000),
      lines_mode: "FULL",
      lines,
      corrections: [],
    },
    snapshots: [
      mockSnapshot(`snap-${id}-1`, "MANUAL", iso(start + 60_000)),
      mockSnapshot(`snap-${id}-2`, "MANUAL", iso(start + 90_000)),
    ],
    clips: (["CAM1", "CAM2"] as const).map((role, i) => ({
      id: `clip-rt-${pkg.tracking_number}-${i + 1}`,
      session_id: id,
      camera_role: role,
      status: "READY" as const,
      sha256: "2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae",
      duration_s: 150,
      held: false,
      retention_until: null,
      deleted_at: null,
      flags: [],
    })),
  };
}

export function resetMockReturns() {
  caseSeq = 100;
  claimSeq = 125;
  placeholderSeq = 2;
  idSeq = 0;
  const now = Date.now();
  const p = (n: string) => `pkg-${n}`;
  mockClaims.splice(0, mockClaims.length);
  mockReturnCases.splice(
    0,
    mockReturnCases.length,
    caseSeed(41, [p("0000041")], {
      kind: "BUYER_RETURN",
      status: "EXPECTED",
      platform_return_sn: "2410RTTST041",
      platform_status: "ACCEPTED",
      return_tracking_number: "SPXRTTST000041",
      reason: "DAMAGED",
      reason_text: "Áo bị rách ở tay",
      reason_label: "Hàng bị hư",
      seller_due_at: iso(now + 3 * DAY),
    }),
    caseSeed(42, [p("0000042")], {
      kind: "FAILED_DELIVERY",
      status: "EXPECTED",
      before: { [p("0000042")]: "HANDED_OVER" },
    }),
    caseSeed(43, [p("0000043-1"), p("0000043-2")], {
      kind: "FAILED_DELIVERY",
      status: "EXPECTED",
      before: { [p("0000043-1")]: "HANDED_OVER", [p("0000043-2")]: "HANDED_OVER" },
    }),
    caseSeed(44, [p("0000044")], {
      kind: "REFUND_ONLY",
      status: "NO_PARCEL",
      needs_parcel: false,
      platform_return_sn: "2410RTTST044",
      platform_status: "REFUND_PAID",
      reason: "MISSING_ITEM",
      reason_label: "Thiếu hàng",
      expected_since: null,
    }),
    caseSeed(45, [p("0000045")], {
      kind: "BUYER_RETURN",
      status: "EXPECTED",
      platform_return_sn: "2410RTTST045",
      platform_status: "ACCEPTED",
      return_tracking_number: "SPXRTTST000045",
      reason: "CHANGE_MIND",
      reason_label: "Đổi ý",
    }),
    caseSeed(47, [p("0000047-1"), p("0000047-2")], {
      kind: "BUYER_RETURN",
      status: "EXPECTED",
      platform_return_sn: "2410RTTST047",
      platform_status: "ACCEPTED",
      return_tracking_number: "SPXRTTST000047",
      reason: "WRONG_ITEM",
      reason_label: "Giao sai hàng",
    }),
    caseSeed(48, [p("0000048-1"), p("0000048-2")], {
      kind: "BUYER_RETURN",
      status: "EXPECTED",
      platform_return_sn: "2410RTTST048",
      platform_status: "ACCEPTED",
      return_tracking_number: "SPXRTTST000048",
      reason: "DAMAGED",
      reason_label: "Hàng bị hư",
      // Trả một phần: chỉ 1 áo (dòng 1).
      requested_items: [
        {
          order_item_id: "oi-2410TST00048-1",
          product_name: "Áo thun basic",
          variation: "Đen / L",
          quantity: 1,
        },
      ],
    }),
    caseSeed(49, [p("0000049")], {
      kind: "FAILED_DELIVERY",
      status: "MISSING",
      expected_since: iso(now - 8 * DAY),
      reported_at: iso(now - 8 * DAY),
      before: { [p("0000049")]: "HANDED_OVER" },
    }),
    caseSeed(50, [p("0000050")], {
      kind: "BUYER_RETURN",
      status: "EXPECTED",
      platform_return_sn: "2410RTTST050",
      platform_status: "ACCEPTED",
      return_tracking_number: "SPXRTTST000050",
      reason: "NOT_AS_DESCRIBED",
      reason_label: "Không đúng mô tả",
      before: { [p("0000050")]: "NEW" },
    }),
    caseSeed(51, [p("0000051")], {
      kind: "BUYER_RETURN",
      status: "EXPECTED",
      platform_return_sn: "2410RTTST051",
      platform_status: "REFUND_PAID",
      return_tracking_number: "SPXRTTST000051",
      reason: "DAMAGED",
      reason_label: "Hàng bị hư",
    }),
    caseSeed(53, [p("0000053")], {
      kind: "BUYER_RETURN",
      status: "RECEIVED_ISSUE",
      platform_return_sn: "2410RTTST053",
      platform_status: "ACCEPTED",
      return_tracking_number: "SPXRTTST000053",
      reason: "DAMAGED",
      reason_label: "Hàng bị hư",
      seller_due_at: iso(now + DAY),
      received_at: iso(startOfVnDay(1) + 9 * 3600_000 + 140_000),
      conclusion: "EMPTY_BOX",
    }),
    caseSeed(54, [p("0000054")], {
      kind: "UNANNOUNCED",
      source: "WAREHOUSE",
      status: "RECEIVED_OK",
      received_at: iso(startOfVnDay(1) + 9 * 3600_000 + 140_000),
      conclusion: "OK",
      before: { [p("0000054")]: "HANDED_OVER" },
    }),
    caseSeed(55, [p("0000055")], {
      kind: "BUYER_RETURN",
      status: "INSPECTING",
      platform_return_sn: "2410RTTST055",
      platform_status: "ACCEPTED",
      return_tracking_number: "SPXRTTST000055",
    }),
    caseSeed(56, [p("TAM-000001")], {
      kind: "UNIDENTIFIED",
      status: "RECEIVED_ISSUE",
      source: "WAREHOUSE",
      open_code: "SPXVN0000000001",
      reported_at: null,
      expected_since: null,
      received_at: iso(startOfVnDay(1) + 9 * 3600_000 + 140_000),
      conclusion: "DAMAGED",
      single_session: true,
    }),
    // item 03 (04 §1 TikTok `…061` REFUND_ONLY): Chỉ hoàn tiền chưa xử lý, hạn sàn còn 30 giờ (D2 / D14 — BR-40).
    caseSeed(61, [p("TTTST0000000016")], {
      kind: "REFUND_ONLY",
      status: "NO_PARCEL",
      needs_parcel: false,
      platform_return_sn: "TTRF000000061",
      platform_status: "RETURN_OR_REFUND_REQUEST_PENDING",
      reason: "MISSING_ITEM",
      reason_label: "Thiếu hàng",
      seller_due_at: iso(now + 30 * 3600_000),
      reported_at: iso(now - 18 * 3600_000),
      expected_since: null,
    }),
    // item 03 T-236 (02a §5.1 #15, BR-29 / EX-R20): mã chiều về `RTTST-DUP-1` có ở 2 hồ sơ mở của 2 shop (đơn
    // `2410DUP00001` Shopee "TST B" + TikTok "TST TikTok A") → bàn hoàn `RETURN_MULTIPLE_ORDERS`, R3 2 dòng.
    caseSeed(62, [p("SPXTSTB000000021")], {
      kind: "BUYER_RETURN",
      status: "EXPECTED",
      platform_return_sn: "2410RTDUP062",
      platform_status: "ACCEPTED",
      return_tracking_number: "RTTST-DUP-1",
      reason: "CHANGE_MIND",
      reason_label: "Đổi ý",
    }),
    caseSeed(63, [p("TTTST0000000021")], {
      kind: "BUYER_RETURN",
      status: "EXPECTED",
      platform_return_sn: "TTRT000000063",
      platform_status: "RETURN_OR_REFUND_REQUEST_PENDING",
      return_tracking_number: "RTTST-DUP-1",
      reason: "WRONG_ITEM",
      reason_label: "Giao sai hàng",
    }),
  );
  // Phiên RETURN đã đóng của hồ sơ đã nhận + hồ sơ khiếu nại tự tạo.
  const received: [string, string, number, string][] = [
    ["0000053", "rc-000053", 1, "Lan"],
    ["0000054", "rc-000054", 1, "Lan"],
    ["TAM-000001", "rc-000056", 1, "Minh"],
  ];
  for (const [n, caseId, daysAgo, operator] of received) {
    const pkg = findPackage(p(n))!;
    const rc = findCase(caseId)!;
    const session = seedReturnSession(pkg, rc, rc.conclusion!, daysAgo, operator);
    recordReturnSession(pkg, session);
    if (rc.conclusion !== "OK") createAutoClaim(rc, pkg, session, rc.conclusion!, 124 - mockClaims.length);
  }
  seedClaims(now);
  seedPhase3Claim();
  seedMissingClaim();
  seedRecon(now);
  mockEvidencePacks.clear();
  reconState.running = false;
}

/** BR-08: kết luận có vấn đề → hồ sơ khiếu nại tự động (nếu kiện chưa có hồ sơ cùng loại đang mở — BR-27). */
export function createAutoClaim(
  rc: MockReturnCase,
  pkg: MockPackage,
  session: MockSession,
  conclusion: Conclusion,
  number?: number,
): MockClaim | null {
  if (conclusion === "OK") return null;
  const dup = mockClaims.find(
    (c) => c.package_id === pkg.id && c.type === conclusion && c.status !== "CLOSED",
  );
  if (dup) return dup;
  const at = session.ended_at ?? new Date().toISOString();
  const n = number ?? claimSeq++;
  const pack = packSessionOf(pkg);
  const claim: MockClaim = {
    id: `cl-${String(n).padStart(6, "0")}`,
    code: claimCode(n),
    type: conclusion,
    counterparty: rc.kind === "FAILED_DELIVERY" ? "CARRIER" : "PLATFORM",
    status: "NEW",
    source: "AUTO_RETURN",
    version: 1,
    package_id: pkg.id,
    return_case_id: rc.id,
    owner: null,
    deadline_at: rc.seller_due_at ?? iso(Date.parse(at) + 7 * DAY),
    deadline_source: rc.seller_due_at ? "PLATFORM" : "DEFAULT",
    platform_claim_ref: null,
    recovered_amount: null,
    close_reason: null,
    created_at: at,
    closed_at: null,
    evidence: [
      ...(pack
        ? [{ id: nextId("ev"), kind: "SESSION" as const, ref_id: pack.id, auto: true, added_at: at }]
        : []),
      { id: nextId("ev"), kind: "SESSION", ref_id: session.id, auto: true, added_at: at },
      ...(session.snapshots ?? []).map((s) => ({
        id: nextId("ev"),
        kind: "SNAPSHOT" as const,
        ref_id: s.id,
        auto: true,
        added_at: at,
      })),
    ],
    notes: [
      {
        id: nextId("note"),
        kind: "SYSTEM",
        text: `Tạo tự động từ phiên mở hoàn (${CLAIM_SYSTEM_LABEL[conclusion]})`,
        author: null,
        at,
      },
    ],
  };
  mockClaims.push(claim);
  return claim;
}

const CLAIM_SYSTEM_LABEL: Record<Conclusion, string> = {
  OK: "Nguyên vẹn",
  DAMAGED: "Hư hỏng",
  MISSING_ITEM: "Thiếu hàng",
  WRONG_ITEM: "Sai hàng / bị tráo",
  EMPTY_BOX: "Hộp rỗng",
  OTHER: "Khác",
};

/** Kiện của đơn có trạng thái mở được phiên hoàn (02 §5.3). `NEW` chỉ khi đơn đã giao (DEC-254). */
const SHIPPED_PLATFORM = ["SHIPPED", "TO_CONFIRM_RECEIVE", "COMPLETED", "TO_RETURN"];
export function blockedReason(pkg: MockPackage): string | null {
  const s = pkg.warehouse_status;
  if (s === "RETURN_RECEIVED_OK" || s === "RETURN_RECEIVED_ISSUE") return "RETURN_ALREADY_RECEIVED";
  if (s === "RETURN_INSPECTING") return "RETURN_IN_PROGRESS_ELSEWHERE";
  if (["RETURN_EXPECTED", "RETURN_MISSING", "HANDED_OVER", "DELIVERED"].includes(s)) return null;
  if (s === "NEW" && SHIPPED_PLATFORM.includes(pkg.order?.platform_status ?? "")) return null;
  // BE (return_scan.py): kiện NEW có hồ sơ hàng hoàn đang mở cũng mở được.
  if (s === "NEW" && mockReturnCases.some((c) => c.package_ids.includes(pkg.id) && isCaseOpen(c)))
    return null;
  return "NOT_SHIPPED";
}

export type ResolveResult =
  | { kind: "PACKAGE"; pkg: MockPackage; rc: MockReturnCase | undefined }
  | { kind: "MULTIPLE"; orderSn: string; count: number }
  | { kind: "NOT_FOUND" };

/**
 * `returns.resolve_code` (02 §7 thứ tự tra): mã chiều về của hồ sơ → mã vận đơn của kiện → mã đơn sàn
 * (đơn nhiều kiện chỉ ra một kiện khi hồ sơ là một phiên; còn lại `MULTIPLE`). Không có → `NOT_FOUND`.
 */
export function resolveReturnCode(raw: string): ResolveResult {
  const code = raw.trim().toUpperCase();
  const byReturn = mockReturnCases.find(
    (c) => c.status !== "CANCELLED" && c.return_tracking_number?.toUpperCase() === code,
  );
  if (byReturn) {
    const pkgs = byReturn.package_ids.map(findPackage).filter(Boolean) as MockPackage[];
    const pkg = pkgs.find((p) => blockedReason(p) === null) ?? pkgs[0];
    if (pkg) return { kind: "PACKAGE", pkg, rc: byReturn };
  }
  const pkg = findPackageByCode(code);
  if (pkg) return { kind: "PACKAGE", pkg, rc: caseOfPackage(pkg.id) };
  const pkgs = packagesOfOrder(code);
  if (pkgs.length === 1) return { kind: "PACKAGE", pkg: pkgs[0]!, rc: caseOfPackage(pkgs[0]!.id) };
  if (pkgs.length > 1) {
    const rc = pkgs.map((p) => caseOfPackage(p.id)).find((c) => c && isCaseOpen(c) && c.single_session);
    if (rc) {
      const open = pkgs.find((p) => rc.package_ids.includes(p.id) && blockedReason(p) === null);
      if (open) return { kind: "PACKAGE", pkg: open, rc };
    }
    return { kind: "MULTIPLE", orderSn: pkgs[0]!.order!.platform_order_sn, count: pkgs.length };
  }
  return { kind: "NOT_FOUND" };
}

/** Mọi mã thuộc hồ sơ / kiện đang kiểm (BR-23): mã chiều về, mã vận đơn các kiện của hồ sơ, mã đơn. */
export function codesOf(rc: MockReturnCase, pkg: MockPackage, openCode?: string): string[] {
  // Như BE `returns/service.py` (case_codes): hồ sơ chưa xác định chỉ nhận lại đúng mã đã mở; còn lại = mã mở + mọi
  // kiện (không phải kiện tạm) của hồ sơ + mã chiều về + mã đơn.
  const open = (openCode ?? rc.open_code ?? pkg.tracking_number).toUpperCase();
  if (rc.kind === "UNIDENTIFIED") return [open];
  const codes = new Set<string>([open]);
  [pkg.id, ...rc.package_ids].forEach((id) => {
    const p = findPackage(id);
    if (p && !p.is_placeholder) codes.add(p.tracking_number);
  });
  if (rc.return_tracking_number) codes.add(rc.return_tracking_number);
  if (rc.order) codes.add(rc.order.platform_order_sn);
  return [...codes].map((c) => c.toUpperCase());
}

/** Tạo hồ sơ khi kiện chưa có hồ sơ mở (`attach_or_create` với tín hiệu kho — `UNANNOUNCED`). */
export function createWarehouseCase(pkg: MockPackage, sessionId: string): MockReturnCase {
  const n = caseSeq++;
  const now = new Date().toISOString();
  const order = pkg.order ? { id: pkg.order.id, platform_order_sn: pkg.order.platform_order_sn } : null;
  const siblings = order ? packagesOfOrder(order.platform_order_sn).length : 1;
  const rc: MockReturnCase = {
    id: `rc-${String(n).padStart(6, "0")}`,
    code: caseCode(n),
    kind: "UNANNOUNCED",
    status: "INSPECTING",
    order,
    platform_return_sn: null,
    platform_status: null,
    needs_parcel: true,
    return_tracking_number: null,
    reason: null,
    reason_text: null,
    reason_label: null,
    requested_items: [],
    seller_due_at: null,
    reported_at: null,
    expected_since: null,
    received_at: null,
    conclusion: null,
    package_ids: [pkg.id],
    source: "WAREHOUSE",
    merged_into: null,
    created_at: now,
    single_session: siblings === 1,
    created_by_session: sessionId,
    before: { [pkg.id]: pkg.warehouse_status },
  };
  mockReturnCases.push(rc);
  return rc;
}

/** Kiện tạm + hồ sơ `UNIDENTIFIED` (API-105 `unidentified_code`, `force_new` — 02 §6.4 #2, §6.5 #1, #9). */
export function createUnidentified(
  code: string,
  sessionId: string,
  forceNote?: string,
): { pkg: MockPackage; rc: MockReturnCase } {
  const tracking = `TAM-${String(placeholderSeq++).padStart(6, "0")}`;
  const now = new Date().toISOString();
  const pkg: MockPackage = {
    id: `pkg-${tracking}`,
    tracking_number: tracking,
    warehouse_status: "RETURN_INSPECTING",
    platform_logistics_status: null,
    verified: false,
    created_at: now,
    is_placeholder: true,
    order: null,
    sessions: [],
    timeline: [],
  };
  mockPackages.push(pkg);
  const n = caseSeq++;
  const rc: MockReturnCase = {
    id: `rc-${String(n).padStart(6, "0")}`,
    code: caseCode(n),
    kind: "UNIDENTIFIED",
    status: "INSPECTING",
    order: null,
    platform_return_sn: null,
    platform_status: null,
    needs_parcel: true,
    return_tracking_number: null,
    reason: null,
    reason_text: forceNote ?? null,
    reason_label: null,
    requested_items: [],
    seller_due_at: null,
    reported_at: null,
    expected_since: null,
    received_at: null,
    conclusion: null,
    package_ids: [pkg.id],
    source: "WAREHOUSE",
    merged_into: null,
    created_at: now,
    single_session: true,
    manual_link_only: Boolean(forceNote),
    open_code: code.toUpperCase(),
    created_by_session: sessionId,
    before: { [pkg.id]: "NEW" },
  };
  mockReturnCases.push(rc);
  return { pkg, rc };
}

/** Dòng kiểm khởi tạo khi mở phiên (02 §6.2 API-10 ghi chú `inspection.lines`). */
export function initialInspection(pkg: MockPackage, rc: MockReturnCase): Inspection {
  const items = itemsOf(pkg);
  const multi = rc.order ? packagesOfOrder(rc.order.platform_order_sn).length > 1 : false;
  const mode: LinesMode = rc.kind !== "BUYER_RETURN" && multi ? "REFERENCE" : "FULL";
  const requested = (orderItemId: string, sent: number) => {
    if (rc.kind !== "BUYER_RETURN" || rc.requested_items.length === 0) return sent;
    return rc.requested_items.find((r) => r.order_item_id === orderItemId)?.quantity ?? 0;
  };
  return {
    conclusion: null,
    note: "",
    saved_at: null,
    lines_mode: mode,
    lines: items.map((it) => {
      const q = requested(it.order_item_id!, it.quantity);
      return {
        order_item_id: it.order_item_id!,
        product_name: it.product_name,
        variation: it.variation,
        image_url: it.image_url,
        quantity_sent: it.quantity,
        quantity_requested: q,
        quantity_received: q,
        condition: "OK",
        note: null,
      };
    }),
  };
}

/** Yêu cầu trả bao trọn mọi dòng × số lượng của đơn (DEC-271). */
function coversWholeOrder(rc: MockReturnCase, pkg: MockPackage): boolean {
  if (rc.kind !== "BUYER_RETURN") return false;
  return itemsOf(pkg).every(
    (it) =>
      (rc.requested_items.find((r) => r.order_item_id === it.order_item_id)?.quantity ?? 0) >= it.quantity,
  );
}

/**
 * Đóng phiên hoàn (API-11 / J-07): kiện → `RETURN_RECEIVED_*`; hồ sơ một phiên trả trọn đơn → mọi kiện; trả một phần
 * → kiện khác rời hồ sơ, về trạng thái trước (DEC-271); hồ sơ tính lại (BR-24).
 */
export function closeReturn(rc: MockReturnCase, pkg: MockPackage, conclusion: Conclusion) {
  const to: WarehouseStatus = conclusion === "OK" ? "RETURN_RECEIVED_OK" : "RETURN_RECEIVED_ISSUE";
  pkg.warehouse_status = to;
  if (rc.single_session && rc.package_ids.length > 1) {
    const whole = coversWholeOrder(rc, pkg);
    for (const id of [...rc.package_ids]) {
      if (id === pkg.id) continue;
      const other = findPackage(id);
      if (!other) continue;
      if (whole) other.warehouse_status = to;
      else {
        other.warehouse_status = rc.before[id] ?? "DELIVERED";
        rc.package_ids = rc.package_ids.filter((x) => x !== id);
      }
    }
  }
  recomputeCase(rc, conclusion);
}

/** BR-24: tính trạng thái hồ sơ từ trạng thái các kiện. */
export function recomputeCase(rc: MockReturnCase, lastConclusion?: Conclusion) {
  const pkgs = rc.package_ids.map(findPackage).filter(Boolean) as MockPackage[];
  const received = pkgs.filter((p) => p.warehouse_status.startsWith("RETURN_RECEIVED"));
  const anyIssue = received.some((p) => p.warehouse_status === "RETURN_RECEIVED_ISSUE");
  if (received.length === pkgs.length && pkgs.length > 0) {
    rc.status = anyIssue ? "RECEIVED_ISSUE" : "RECEIVED_OK";
    rc.received_at = new Date().toISOString();
  } else if (pkgs.some((p) => p.warehouse_status === "RETURN_INSPECTING")) rc.status = "INSPECTING";
  else if (received.length > 0) rc.status = "PARTIALLY_RECEIVED";
  else if (pkgs.some((p) => p.warehouse_status === "RETURN_MISSING")) rc.status = "MISSING";
  else rc.status = "EXPECTED";
  // Kết luận tổng: lần đóng có vấn đề → kết luận đó; OK mà hồ sơ đã có kiện có vấn đề → giữ kết luận cũ.
  if (lastConclusion)
    rc.conclusion = lastConclusion !== "OK" ? lastConclusion : anyIssue ? rc.conclusion : "OK";
}

// ───────────────────────── T-151: hồ sơ khiếu nại, cảnh báo lệch, gói bằng chứng (02b-admin §12) ─────────────────────────

const USERS = {
  lan: { id: "u-cskh", display_name: "Lan" },
  sup: { id: "u-sup", display_name: "Nguyễn B" },
  admin: { id: "u-admin", display_name: "Quản trị" },
} as const;

/** Chuyển trạng thái hồ sơ khiếu nại (01 §7.3, BE `claims.service.TRANSITIONS`). Đã `CLOSED` không mở lại. */
export const CLAIM_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  NEW: ["SUBMITTED", "CLOSED"],
  SUBMITTED: ["WAITING", "WON", "LOST", "CLOSED"],
  WAITING: ["WON", "LOST", "CLOSED"],
  WON: ["CLOSED"],
  LOST: ["CLOSED"],
  CLOSED: [],
};

function manualClaim(
  n: number,
  pkgId: string,
  patch: Partial<MockClaim> & Pick<MockClaim, "type" | "status" | "source">,
): MockClaim {
  const created = patch.created_at ?? iso(Date.now() - 5 * DAY);
  const pkg = findPackage(pkgId);
  const pack = pkg ? packSessionOf(pkg) : undefined;
  return {
    id: `cl-${String(n).padStart(6, "0")}`,
    code: claimCode(n),
    counterparty: "PLATFORM",
    version: 1,
    package_id: pkgId,
    return_case_id: null,
    owner: null,
    deadline_at: iso(Date.parse(created) + 7 * DAY),
    deadline_source: "DEFAULT",
    platform_claim_ref: null,
    recovered_amount: null,
    close_reason: null,
    created_at: created,
    closed_at: null,
    evidence: pack
      ? [{ id: `ev-${n}-1`, kind: "SESSION", ref_id: pack.id, auto: true, added_at: created }]
      : [],
    notes: [],
    ...patch,
  };
}

/**
 * item 03 (T-260 / T-264, 04 TC-08.40 / 08.42 / 08.52 / 08.66): kiện `SPXTST0000060`, hôm qua — A bỏ dở 08:51 (phiên mở
 * hoàn trước, phiên chính), C hủy "Quét nhầm" 09:00 (bị loại), R quản lý hủy trước Phase 3 09:05 ("Cần soát"), M bỏ dở
 * 09:10 đã đánh dấu quét nhầm, B "Hộp rỗng" 10:15 → hồ sơ KN-000141 (hạn sàn đã qua lúc tạo — BR-42).
 */
export const P3_CLAIM_ID = "cl-000141";
/** item 03 T-265: hồ sơ KN-000142 của `SPXTST0000062` — 2 phiên đóng gói, clip "Thiếu tệp" (EX-K8 / K9). */
export const MISSING_CLAIM_ID = "cl-000142";
function seedMissingClaim() {
  const pkg = findPackage("pkg-0000062");
  if (!pkg) return;
  const created = iso(Date.now() - 2 * DAY);
  const [newer, older] = pkg.sessions;
  mockClaims.push(
    manualClaim(142, pkg.id, {
      type: "LOST_IN_TRANSIT",
      status: "NEW",
      source: "MANUAL",
      created_at: created,
      evidence: [newer, older]
        .filter((s): s is MockSession => Boolean(s))
        .map((s, i) => ({
          id: `ev-142-${i + 1}`,
          kind: "SESSION",
          ref_id: s.id,
          auto: i === 0,
          added_at: created,
        })),
    }),
  );
}
function seedPhase3Claim() {
  const pkg = findPackage("pkg-0000060");
  if (!pkg) return;
  const day = startOfVnDay(1);
  const rc = caseSeed(60, [pkg.id], {
    kind: "BUYER_RETURN",
    status: "RECEIVED_ISSUE",
    platform_return_sn: "2410RTTST060",
    platform_status: "ACCEPTED",
    return_tracking_number: "SPXRTTST000060",
    reason: "EMPTY_BOX",
    reason_label: "Hộp rỗng",
    conclusion: "EMPTY_BOX",
    received_at: iso(day + (10 * 60 + 18) * 60_000),
    seller_due_at: iso(day + (9 * 60 + 30) * 60_000),
  });
  mockReturnCases.push(rc);
  const mk = (
    key: string,
    minute: number,
    status: SessionStatus,
    extra: Partial<MockSession> = {},
  ): MockSession => {
    const start = day + minute * 60_000;
    const id = `ses-p3-${key}`;
    return {
      id,
      package_id: pkg.id,
      station_id: "st-1",
      station_name: "TST Station 01",
      status,
      started_at: iso(start),
      ended_at: iso(start + 95_000),
      duration_s: 95,
      flags: [],
      cancel_reason: null,
      note: null,
      type: "RETURN",
      operator_name: "Lan",
      return_case_id: rc.id,
      inspection: null,
      snapshots: [],
      clips: (["CAM1", "CAM2"] as const).map((role, i) => ({
        id: `clip-p3-${key}-${i + 1}`,
        session_id: id,
        camera_role: role,
        status: "READY" as const,
        sha256: "2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae",
        duration_s: 95,
        held: false,
        retention_until: null,
        deleted_at: null,
        flags: [],
      })),
      ...extra,
    };
  };
  const a = mk("a", 8 * 60 + 51, "ABANDONED");
  const c = mk("c", 9 * 60, "CANCELLED", { cancel_reason: "WRONG_SCAN", duration_s: 25 });
  const r = mk("r", 9 * 60 + 5, "CANCELLED", {
    cancel_reason: "SUPERVISOR",
    review: { review_needed: true },
  });
  const m = mk("m", 9 * 60 + 10, "ABANDONED", {
    review: {
      wrong_scan: {
        at: iso(day + 11 * 3600_000),
        by: USERS.sup,
        code: "WRONG_SCAN",
        note: "Video là kiện bên cạnh",
      },
    },
  });
  const b = mk("b", 10 * 60 + 15, "COMPLETED", {
    inspection: {
      conclusion: "EMPTY_BOX",
      note: "Hộp còn nguyên băng keo, bên trong trống",
      saved_at: iso(day + (10 * 60 + 17) * 60_000),
      lines_mode: "FULL",
      lines: [],
      corrections: [],
    },
    snapshots: [
      mockSnapshot("snap-p3-b-1", "MANUAL", iso(day + (10 * 60 + 16) * 60_000)),
      mockSnapshot("snap-p3-b-2", "MANUAL", iso(day + (10 * 60 + 17) * 60_000)),
    ],
  });
  for (const x of [a, c, r, m, b]) recordReturnSession(pkg, x);
  const at = b.ended_at!;
  const ref = (kind: "SESSION" | "SNAPSHOT", id: string): MockEvidenceRef => ({
    id: `ev-p3-${id}`,
    kind,
    ref_id: id,
    auto: true,
    added_at: at,
  });
  const pack = packSessionOf(pkg);
  mockClaims.push({
    id: P3_CLAIM_ID,
    code: claimCode(141),
    type: "EMPTY_BOX",
    counterparty: "PLATFORM",
    status: "NEW",
    source: "AUTO_RETURN",
    version: 1,
    package_id: pkg.id,
    return_case_id: rc.id,
    owner: null,
    deadline_at: iso(Date.parse(at) + 7 * DAY),
    deadline_source: "DEFAULT_PLATFORM_PASSED",
    platform_claim_ref: null,
    recovered_amount: null,
    close_reason: null,
    created_at: at,
    closed_at: null,
    evidence: [
      ...(pack ? [ref("SESSION", pack.id)] : []),
      ref("SESSION", a.id),
      ref("SESSION", r.id),
      ref("SESSION", b.id),
      ...(b.snapshots ?? []).map((x) => ref("SNAPSHOT", x.id)),
    ],
    notes: [
      { id: "n-141-0", kind: "SYSTEM", text: "Tạo tự động từ phiên mở hoàn (Hộp rỗng)", author: null, at },
      {
        id: "n-141-1",
        kind: "SYSTEM",
        text: `Hạn sàn (${fmtShort(rc.seller_due_at)}) đã qua khi tạo hồ sơ — dùng hạn mặc định. Kiểm hạn thật trên sàn.`,
        author: null,
        at,
      },
    ],
    removed: [],
  });
}

/** 02b-admin §12: đủ trạng thái, 1 `LEGACY_HOLD`, 1 sắp hết hạn (KN-000124 từ phiên hoàn), 1 quá hạn. */
function seedClaims(now: number) {
  mockClaims.push(
    manualClaim(120, "pkg-0000011", {
      type: "BUYER_CLAIM",
      status: "WON",
      source: "MANUAL",
      owner: USERS.lan,
      platform_claim_ref: "SPE-112233",
      recovered_amount: 150_000,
      notes: [
        {
          id: "n-120-1",
          kind: "STATUS_CHANGE",
          text: "Mới → Đã gửi",
          author: USERS.lan,
          at: iso(now - 4 * DAY),
        },
      ],
    }),
    manualClaim(121, "pkg-0000049", {
      type: "LOST_IN_TRANSIT",
      counterparty: "CARRIER",
      status: "SUBMITTED",
      source: "RECON",
      owner: USERS.sup,
      platform_claim_ref: "SPE-998877",
      return_case_id: "rc-000049",
      deadline_at: iso(now - 5 * 3600_000),
    }),
    manualClaim(122, "pkg-0000006", {
      type: "OTHER",
      status: "NEW",
      source: "LEGACY_HOLD",
      deadline_at: iso(now + 30 * DAY),
      notes: [
        {
          id: "n-122-1",
          kind: "SYSTEM",
          text: "Chuyển từ cờ giữ clip (nâng cấp Phase 2)",
          author: null,
          at: iso(now - DAY),
        },
      ],
    }),
    manualClaim(119, "pkg-0000003", {
      type: "WRONG_ITEM",
      status: "LOST",
      source: "MANUAL",
      owner: USERS.sup,
      platform_claim_ref: "SPE-445566",
    }),
    manualClaim(118, "pkg-0000002", {
      type: "BUYER_CLAIM",
      status: "WAITING",
      source: "MANUAL",
      owner: USERS.lan,
      platform_claim_ref: "SPE-778899",
      deadline_at: iso(now + 4 * DAY),
    }),
    manualClaim(117, "pkg-0000001", {
      type: "DAMAGED",
      status: "CLOSED",
      source: "MANUAL",
      close_reason: "Khách rút khiếu nại",
      closed_at: iso(now - 2 * DAY),
    }),
  );
}

export type MockReconAlert = Omit<ReconAlert, "package" | "allowed_status_targets" | "platform" | "shop"> & {
  package_id: string;
};
export const mockReconAlerts: MockReconAlert[] = [];
/** Khóa `recon:run` của J-14 (API-123 → 409 RECON_IN_PROGRESS khi đang giữ). */
export const reconState = { running: false };

const RULE_META: Record<ReconRule, [string, ReconSeverity]> = {
  SHIPPED_NOT_PACKED: ["BR-10", "HIGH"],
  CANCELLED_AFTER_PACK: ["BR-11", "MEDIUM"],
  RETURN_OVERDUE: ["BR-12", "HIGH"],
  RETURN_UNANNOUNCED: ["BR-13", "LOW"],
  PACKED_NOT_HANDED_OVER: ["BR-14", "MEDIUM"],
  RETURN_DONE_NOT_RECEIVED: ["BR-19", "HIGH"],
  UNVERIFIED_STALE: ["BR-20", "LOW"],
};

function alertSeed(
  id: string,
  rule: ReconRule,
  pkg: string,
  detectedAgoH: number,
  context: MockReconAlert["context"],
  patch: Partial<MockReconAlert> = {},
): MockReconAlert {
  const [br, severity] = RULE_META[rule];
  return {
    id,
    rule,
    br,
    severity,
    status: "OPEN",
    package_id: `pkg-${pkg}`,
    context,
    detected_at: iso(Date.now() - detectedAgoH * 3600_000),
    closed_at: null,
    resolution: null,
    ...patch,
  };
}

/** 7 cảnh báo mở (mỗi quy tắc một) + 1 đã xử lý + 1 tự hết (02b-admin §12). */
function seedRecon(now: number) {
  mockReconAlerts.splice(
    0,
    mockReconAlerts.length,
    // `context` như BE `reconciliation/rules.py` (warehouse_status, platform_status, since, days / hours, return_case).
    alertSeed("ra-01", "SHIPPED_NOT_PACKED", "0000056", 20, {
      warehouse_status: "NEW",
      platform_status: "SHIPPED",
      since: iso(now - DAY),
    }),
    alertSeed("ra-02", "CANCELLED_AFTER_PACK", "0000007", 30, {
      warehouse_status: "CANCELLED_AFTER_PACK",
      platform_status: "CANCELLED",
      since: iso(now - 30 * 3600_000),
    }),
    alertSeed("ra-03", "RETURN_OVERDUE", "0000049", 24, {
      warehouse_status: "RETURN_MISSING",
      platform_status: "TO_RETURN",
      since: iso(now - 8 * DAY),
      days: 8,
    }),
    alertSeed("ra-04", "RETURN_UNANNOUNCED", "0000054", 2, {
      warehouse_status: "RETURN_RECEIVED_OK",
      return_case: "HH-000054",
      since: iso(now - DAY),
      hours: 24,
    }),
    alertSeed("ra-05", "PACKED_NOT_HANDED_OVER", "0000052", 1, {
      warehouse_status: "PACKED",
      platform_status: "READY_TO_SHIP",
      since: iso(now - 25 * 3600_000),
      hours: 25,
    }),
    alertSeed("ra-06", "RETURN_DONE_NOT_RECEIVED", "0000051", 6, {
      warehouse_status: "RETURN_EXPECTED",
      platform_status: "TO_RETURN",
      return_case: "HH-000051",
      since: iso(now - 6 * 3600_000),
    }),
    alertSeed("ra-07", "UNVERIFIED_STALE", "0000015", 3, {
      warehouse_status: "NEW",
      since: iso(now - 27 * 3600_000),
      hours: 27,
    }),
    alertSeed(
      "ra-08",
      "PACKED_NOT_HANDED_OVER",
      "0000011",
      72,
      { hours: 26 },
      {
        status: "RESOLVED",
        closed_at: iso(now - 48 * 3600_000),
        resolution: {
          action: "RESOLVE",
          note: "ĐVVC đã lấy hàng chiều qua",
          by: USERS.sup,
          at: iso(now - 48 * 3600_000),
          to_status: null,
          claim_id: null,
        },
      },
    ),
    alertSeed(
      "ra-09",
      "RETURN_DONE_NOT_RECEIVED",
      "0000053",
      40,
      {},
      {
        status: "AUTO_RESOLVED",
        closed_at: iso(now - 24 * 3600_000),
      },
    ),
  );
}

/** Điều chỉnh tay hợp lệ (02 §5.3 "Điều chỉnh tay", DEC-258). */
export const MANUAL_TRANSITIONS: Partial<Record<WarehouseStatus, WarehouseStatus[]>> = {
  NEW: ["HANDED_OVER"],
  PACKED: ["HANDED_OVER"],
  CANCELLED_AFTER_PACK: ["HANDED_OVER"],
  HANDED_OVER: ["DELIVERED"],
  RETURN_MISSING: ["RETURN_EXPECTED", "DELIVERED"],
  RETURN_EXPECTED: ["DELIVERED"],
};
export const allowedTargets = (pkg: MockPackage) =>
  pkg.is_placeholder ? [] : (MANUAL_TRANSITIONS[pkg.warehouse_status] ?? []);

export type MockEvidencePack = {
  id: string;
  claim_id: string;
  created_by: string;
  started: number;
  /** Mock: gói chạy 0 → 100 trong 4 giây (02b-admin §12); `fail` → FAILED ở 60 %. */
  fail: boolean;
};
export const mockEvidencePacks = new Map<string, MockEvidencePack>();
export const EVIDENCE_PACK_MS = 4000;

export function packStatus(p: MockEvidencePack, now = Date.now()) {
  const progress = Math.min(100, Math.floor(((now - p.started) / EVIDENCE_PACK_MS) * 100));
  if (p.fail && progress >= 60) return { status: "FAILED" as const, progress: 60 };
  if (progress >= 100) return { status: "READY" as const, progress: 100 };
  return { status: progress === 0 ? ("QUEUED" as const) : ("RUNNING" as const), progress };
}

// ───────────────────────── Dạng API (đúng 02 §6.2) ─────────────────────────

const CLAIM_BRIEF = (c: MockClaim) => ({ id: c.id, code: c.code, status: c.status, type: c.type });
/** API-110 / 111 `claims[]` (BE `ClaimBrief`: id, code, status — không có `type`). */
const CASE_CLAIM_BRIEF = (c: MockClaim) => ({ id: c.id, code: c.code, status: c.status });

/** BE `returns.views.waiting_days`: số ngày lịch (giờ VN) từ lúc vào "Đang về" tới hôm nay; đã nhận → null. */
export function waitingDays(rc: Pick<MockReturnCase, "expected_since" | "received_at">, now = Date.now()) {
  if (!rc.expected_since || rc.received_at) return null;
  return daysBetween(vnDay(rc.expected_since), vnDay(new Date(now)));
}

/** Nhóm yêu cầu trả từ chữ sàn (02 §5.3 — mock thay `platforms/<sàn>/mapping.py`). */
const RETURN_GROUP: Record<string, ReturnStatusGroup> = {
  REQUESTED: "REQUESTED",
  JUDGING: "REQUESTED",
  SELLER_DISPUTE: "REQUESTED",
  PROCESSING: "ACCEPTED",
  ACCEPTED: "ACCEPTED",
  CANCELLED: "CANCELLED",
  REFUND_PAID: "DONE",
  CLOSED: "CLOSED",
  // TikTok (02 §5.3 — giả định, Q19)
  RETURN_OR_REFUND_REQUEST_PENDING: "REQUESTED",
  AWAITING_BUYER_SHIP: "ACCEPTED",
  BUYER_SHIPPED_ITEM: "ACCEPTED",
  RECEIVE_REJECTED: "ACCEPTED",
  REQUEST_REJECTED: "CANCELLED",
  RETURN_OR_REFUND_REQUEST_CANCEL: "CANCELLED",
  RETURN_OR_REFUND_REQUEST_COMPLETE: "DONE",
};

/** item 03 (02 §6.2 API-110): hạn phản hồi chỉ với `REFUND_ONLY` (DEC-451 — tính lúc đọc). */
export function responseDue(
  rc: MockReturnCase,
): Pick<ReturnListItem, "response_due_at" | "response_due_source"> {
  if (rc.kind !== "REFUND_ONLY") return { response_due_at: null, response_due_source: null };
  if (rc.seller_due_at) return { response_due_at: rc.seller_due_at, response_due_source: "PLATFORM" };
  if (!rc.reported_at) return { response_due_at: null, response_due_source: null };
  return {
    response_due_at: iso(Date.parse(rc.reported_at) + phase3Config.refundOnlyDefaultHours * 3600_000),
    response_due_source: "DEFAULT",
  };
}

export function toReturnItem(rc: MockReturnCase, now = Date.now()): ReturnListItem {
  const firstPkg = rc.package_ids.map(findPackage).find(Boolean);
  const openClaim = mockClaims
    .filter((c) => claimIsOpen(c) && (c.return_case_id === rc.id || rc.package_ids.includes(c.package_id)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return {
    ...platformShopOf(firstPkg),
    platform_status_group: rc.platform_status ? (RETURN_GROUP[rc.platform_status] ?? null) : null,
    ...responseDue(rc),
    claim: openClaim ? { id: openClaim.id, code: openClaim.code } : null,
    id: rc.id,
    code: rc.code,
    kind: rc.kind,
    status: rc.status,
    order: rc.order,
    packages: rc.package_ids
      .map(findPackage)
      .filter((p): p is MockPackage => Boolean(p))
      .map((p) => ({ id: p.id, tracking_number: p.tracking_number, warehouse_status: p.warehouse_status })),
    return_tracking_number: rc.return_tracking_number,
    reason_label: rc.reason_label,
    reported_at: rc.reported_at,
    expected_since: rc.expected_since,
    waiting_days: waitingDays(rc, now),
    received_at: rc.received_at,
    conclusion: rc.conclusion,
    claims: mockClaims.filter((c) => c.return_case_id === rc.id).map(CASE_CLAIM_BRIEF),
    merged_into: rc.merged_into,
  };
}

export function toReturnDetail(rc: MockReturnCase): ReturnDetail {
  const sessions = rc.package_ids
    .flatMap((id) => findPackage(id)?.sessions ?? [])
    .filter((s) => s.type === "RETURN" && s.return_case_id === rc.id)
    .map((s) => ({
      id: s.id,
      package_id: s.package_id,
      status: s.status,
      station_name: s.station_name,
      operator_name: s.operator_name ?? null,
      started_at: s.started_at,
      ended_at: s.ended_at,
      conclusion: s.inspection?.conclusion ?? null,
    }));
  return {
    ...toReturnItem(rc),
    platform_return_sn: rc.platform_return_sn,
    platform_status: rc.platform_status,
    needs_parcel: rc.needs_parcel,
    reason: rc.reason,
    reason_text: rc.reason_text,
    seller_due_at: rc.seller_due_at,
    source: rc.source,
    requested_items: rc.requested_items,
    sessions,
  };
}

export function toReconAlert(a: MockReconAlert): ReconAlert {
  const pkg = findPackage(a.package_id);
  const { package_id, ...rest } = a;
  return {
    ...rest,
    ...platformShopOf(pkg),
    package: {
      id: package_id,
      tracking_number: pkg?.tracking_number ?? "—",
      warehouse_status: pkg?.warehouse_status ?? "NEW",
      platform_status: pkg?.order?.platform_status ?? null,
    },
    // BE `alert_out`: đích theo trạng thái kho hiện tại (không phụ thuộc trạng thái cảnh báo).
    allowed_status_targets: pkg ? (MANUAL_TRANSITIONS[pkg.warehouse_status] ?? []) : [],
  };
}

export const claimIsOpen = (c: MockClaim) => c.status !== "CLOSED";
const ACTIVE: ApiClaimStatus[] = ["NEW", "SUBMITTED", "WAITING"];

export function claimDue(c: MockClaim, now = Date.now(), dueSoonHours = 48) {
  if (!c.deadline_at || !ACTIVE.includes(c.status)) return { due_soon: false, overdue: false };
  const left = Date.parse(c.deadline_at) - now;
  return { due_soon: left >= 0 && left <= dueSoonHours * 3600_000, overdue: left < 0 };
}

export function toClaimItem(c: MockClaim, now = Date.now(), dueSoonHours = 48): ClaimListItem {
  const pkg = findPackage(c.package_id);
  return {
    id: c.id,
    code: c.code,
    type: c.type,
    counterparty: c.counterparty,
    status: c.status,
    source: c.source,
    package: { id: c.package_id, tracking_number: pkg?.tracking_number ?? "—" },
    order: pkg?.order ? { platform_order_sn: pkg.order.platform_order_sn } : null,
    owner: c.owner,
    deadline_at: c.deadline_at,
    ...claimDue(c, now, dueSoonHours),
    created_at: c.created_at,
    ...platformShopOf(pkg),
  };
}

export function findSessionAnywhere(id: string) {
  for (const p of mockPackages) {
    const s = p.sessions.find((x) => x.id === id);
    if (s) return { pkg: p, session: s };
  }
  return null;
}

export function findSnapshotAnywhere(id: string) {
  for (const p of mockPackages)
    for (const s of p.sessions) {
      const shot = s.snapshots?.find((x) => x.id === id);
      if (shot) return shot;
    }
  return null;
}

/** `removal_keep_until` (02 §6.2 API-132): max(cuối clip / ảnh, bây giờ) + thời gian giữ clip. */
const keepUntil = (endMs: number) => iso(Math.max(endMs, Date.now()) + RETENTION_CLIP_DAYS * DAY);
/** Ngày giữ của một bằng chứng khi bị bỏ (BR-38 — như `removal_keep_until` của API-132). */
export function removalKeepUntil(e: MockEvidenceRef): string {
  if (e.kind === "SNAPSHOT")
    return keepUntil(Date.parse(findSnapshotAnywhere(e.ref_id)?.taken_at ?? "") || 0);
  const s = findSessionAnywhere(e.ref_id)?.session;
  return keepUntil(Date.parse(s?.ended_at ?? s?.started_at ?? "") || 0);
}

const EXCLUDING = ["WRONG_SCAN", "NOT_A_RETURN"];

const CLIP_UNAVAILABLE: Record<string, ShareUnavailableReason> = {
  PENDING: "CLIP_PENDING",
  FAILED: "CLIP_FAILED",
  DELETED: "CLIP_DELETED",
  MISSING: "CLIP_MISSING",
};
/** Lý do Cam 1 của phiên chưa dùng được (như `unavailable_reason` API-164); `READY` → `null`. */
export function cam1Unavailable(s: MockSession): ShareUnavailableReason | null {
  const cam1 = s.clips.find((c) => c.camera_role === "CAM1");
  if (cam1?.status === "READY") return null;
  return CLIP_UNAVAILABLE[cam1?.status ?? "PENDING"] ?? "CLIP_PENDING";
}

/** item 03 (BR-39 v0.4, 02 §5.1 SESSION v0.3): trường chỉ đọc của phiên trong bằng chứng — mock chưa có API-189 (T-264). */
export function sessionReview(s: MockSession) {
  const review = s.review ?? {};
  const cancelCause = review.cancel_cause ?? null;
  const effective = cancelCause ?? s.cancel_reason;
  const confirmed = review.return_confirmed ?? null;
  const wrongScan = review.wrong_scan ?? null;
  const exclusion =
    s.type === "RETURN"
      ? wrongScan
        ? ("MARKED" as const)
        : effective && EXCLUDING.includes(effective) && !confirmed
          ? cancelCause
            ? ("SUPERVISOR_CANCEL" as const)
            : ("STATION_CANCEL" as const)
          : null
      : null;
  return {
    cancel_reason: s.cancel_reason,
    cancel_cause: cancelCause,
    wrong_scan: wrongScan,
    review_needed: Boolean(review.review_needed),
    evidence_exclusion: exclusion,
    return_confirmed: confirmed,
  };
}

/** Phiên chính (DEC-448): phiên RETURN có clip sớm nhất không bị loại, không "Cần soát"; không có → phiên PACK. */
function primarySessionId(sessions: MockSession[]): string | null {
  const candidates = sessions
    .filter((s) => s.type === "RETURN" && s.clips.some((cl) => cl.status !== "DELETED"))
    .filter((s) => !sessionReview(s).evidence_exclusion && !sessionReview(s).review_needed)
    .sort((a, b) => a.started_at.localeCompare(b.started_at));
  return candidates[0]?.id ?? sessions.find((s) => (s.type ?? "PACK") === "PACK")?.id ?? null;
}

let primaryCache: string | null = null;
/** Phiên mở hoàn trước (BR-39): RETURN hủy / bỏ dở, không bị loại, không "Cần soát". */
const isPriorReturn = (s: MockSession) =>
  s.type === "RETURN" &&
  (s.status === "CANCELLED" || s.status === "ABANDONED") &&
  !sessionReview(s).evidence_exclusion &&
  !sessionReview(s).review_needed;
function evidenceExtras(s: MockSession) {
  return {
    prior_return: isPriorReturn(s),
    primary: s.id === primaryCache,
    removal_keep_until: keepUntil(Date.parse(s.ended_at ?? s.started_at) || Date.now()),
  };
}

export function toClaimDetail(c: MockClaim): ClaimDetail {
  const pkg = findPackage(c.package_id);
  const rc = c.return_case_id ? findCase(c.return_case_id) : undefined;
  primaryCache = primarySessionId(
    c.evidence
      .filter((e) => e.kind === "SESSION")
      .map((e) => findSessionAnywhere(e.ref_id)?.session)
      .filter((x): x is MockSession => Boolean(x)),
  );
  const toEvidence = (e: MockEvidenceRef): ClaimEvidence[] => {
    if (e.kind === "SNAPSHOT") {
      const shot = findSnapshotAnywhere(e.ref_id);
      if (!shot) return [];
      // BE DEC-312 e: ảnh đã xóa / thiếu tệp (item 03) → `url = null`.
      const snapshot = {
        ...shot,
        url: shot.status === "DELETED" || shot.status === "MISSING" ? null : shot.url,
      };
      return [
        {
          id: e.id,
          kind: "SNAPSHOT",
          auto: e.auto,
          prior_return: false,
          primary: false,
          removal_keep_until: keepUntil(Date.parse(shot.taken_at) || Date.now()),
          snapshot,
        },
      ];
    }
    const found = findSessionAnywhere(e.ref_id);
    if (!found) return [];
    const s = found.session;
    return [
      {
        id: e.id,
        kind: "SESSION",
        auto: e.auto,
        ...evidenceExtras(s),
        session: {
          ...sessionReview(s),
          id: s.id,
          type: s.type ?? "PACK",
          status: s.status,
          station_name: s.station_name,
          operator_name: s.operator_name ?? null,
          started_at: s.started_at,
          ended_at: s.ended_at,
          flags: s.flags,
          clips: s.clips.map((cl) => ({
            id: cl.id,
            camera_role: cl.camera_role,
            status: cl.status,
            sha256: cl.sha256,
            deleted_at: cl.deleted_at,
          })),
        },
      },
    ];
  };
  const evidence = c.evidence.flatMap(toEvidence);
  const removedEvidence: ClaimDetail["removed_evidence"] = (c.removed ?? []).flatMap((r) =>
    toEvidence(r).map((ev) => ({
      ...ev,
      removed: { at: r.removed_at, by: r.removed_by, reason: r.reason, keep_until: r.keep_until },
    })),
  );
  const used = new Set(c.evidence.map((e) => e.ref_id));
  const caseSessions = rc
    ? rc.package_ids.flatMap((id) => findPackage(id)?.sessions ?? [])
    : (pkg?.sessions ?? []);
  const pack = pkg ? packSessionOf(pkg) : undefined;
  const missing: ClaimDetail["missing"] = [];
  if (!pack) missing.push("NO_PACK_CLIP");
  else if (pack.clips.some((cl) => cl.status === "DELETED")) missing.push("PACK_CLIP_DELETED");
  if (caseSessions.some((s) => s.type === "RETURN" && s.clips.some((cl) => cl.status === "PENDING")))
    missing.push("RETURN_CLIP_PENDING");
  return {
    id: c.id,
    code: c.code,
    type: c.type,
    counterparty: c.counterparty,
    status: c.status,
    source: c.source,
    version: c.version,
    package: {
      id: c.package_id,
      tracking_number: pkg?.tracking_number ?? "—",
      warehouse_status: pkg?.warehouse_status ?? "NEW",
    },
    order: pkg?.order ? { id: pkg.order.id, platform_order_sn: pkg.order.platform_order_sn } : null,
    return_case: rc
      ? { id: rc.id, code: rc.code, kind: rc.kind, return_tracking_number: rc.return_tracking_number }
      : null,
    owner: c.owner,
    deadline_at: c.deadline_at,
    deadline_source: c.deadline_source,
    platform_claim_ref: c.platform_claim_ref,
    recovered_amount: c.recovered_amount,
    close_reason: c.close_reason,
    created_at: c.created_at,
    closed_at: c.closed_at,
    evidence,
    other_sessions: caseSessions
      .filter((s) => !used.has(s.id))
      .map((s) => ({ id: s.id, type: s.type ?? "PACK", status: s.status, started_at: s.started_at })),
    missing,
    notes: [...c.notes].sort((a, b) => a.at.localeCompare(b.at)),
    allowed_transitions: CLAIM_TRANSITIONS[c.status],
    // item 03 (02 §6.2 API-132) — BR-38 / BR-39 (T-260: phiên trước, bỏ mềm; T-264: API-189).
    submitted_at: c.submitted_at ?? null,
    result_at: c.result_at ?? null,
    prior_return_sessions: c.evidence.flatMap((e) => {
      const found = e.kind === "SESSION" ? findSessionAnywhere(e.ref_id) : undefined;
      return found && isPriorReturn(found.session)
        ? [
            {
              session_id: found.session.id,
              status: found.session.status,
              started_at: found.session.started_at,
            },
          ]
        : [];
    }),
    excluded_return_sessions: caseSessions
      .filter((s) => s.type === "RETURN" && s.clips.some((cl) => cl.status !== "DELETED"))
      .flatMap((s) => {
        const r = sessionReview(s);
        if (!r.evidence_exclusion) return [];
        return [
          {
            session_id: s.id,
            status: s.status,
            cancel_reason: s.cancel_reason,
            cancel_cause: r.cancel_cause,
            evidence_exclusion: r.evidence_exclusion,
            wrong_scan: r.wrong_scan,
            started_at: s.started_at,
            has_clip: true,
            in_evidence: used.has(s.id),
          },
        ];
      }),
    review_sessions: caseSessions
      .filter((s) => s.type === "RETURN" && sessionReview(s).review_needed)
      .map((s) => ({
        session_id: s.id,
        status: s.status,
        started_at: s.started_at,
        in_evidence: used.has(s.id),
      })),
    removed_evidence: removedEvidence,
    // `shares[]` theo người xem — handler claims ghép (`sharesOfClaim`).
    shares: [],
    shares_active_count: 0,
    // G3-EV-4 (02 §6.2 API-132 bổ sung): Cam 1 phiên chính không READY.
    ...primaryAvailability(primaryCache),
  };
}

function primaryAvailability(primaryId: string | null) {
  const s = primaryId ? findSessionAnywhere(primaryId)?.session : undefined;
  const reason = s ? cam1Unavailable(s) : null;
  return { primary_unavailable: Boolean(reason), primary_unavailable_reason: reason };
}

/** Phần item 02 của API-31 (02 §6.2 "API-31 thêm"). */
export function packageReturnExtras(
  pkg: MockPackage,
): Pick<
  PackageDetail,
  "is_placeholder" | "return_cases" | "recon_alerts" | "claims" | "allowed_status_targets"
> {
  return {
    is_placeholder: Boolean(pkg.is_placeholder),
    // BE `orders/packages.detail`: mọi hồ sơ chứa kiện (kể cả đã gộp / hủy), mới tạo trước.
    return_cases: mockReturnCases
      .filter((c) => c.package_ids.includes(pkg.id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
      .map((c) => toReturnItem(c)),
    recon_alerts: mockReconAlerts
      .filter((a) => a.package_id === pkg.id)
      .sort((a, b) => b.detected_at.localeCompare(a.detected_at))
      .map(({ id, rule, br, severity, status, detected_at, closed_at }) => ({
        id,
        rule,
        br,
        severity,
        status,
        detected_at,
        closed_at,
      })),
    claims: mockClaims
      .filter((c) => c.package_id === pkg.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(CLAIM_BRIEF),
    // BE: theo trạng thái kho, không theo vai (FE ẩn nút theo quyền `warehouse_status.adjust`).
    allowed_status_targets: MANUAL_TRANSITIONS[pkg.warehouse_status] ?? [],
  };
}

/** Bảo vệ clip / ảnh của phiên (ADR-009, BR-09, 02 §6.2 API-31 v0.2): hồ sơ khiếu nại mở, hồ sơ hàng hoàn, cờ giữ cũ. */
export function protectionOf(s: MockSession, held = false): Protection | null {
  const claims: string[] = mockClaims
    .filter((c) => claimIsOpen(c) && c.evidence.some((e) => e.ref_id === s.id))
    .map((c) => c.code);
  const now = Date.now();
  const cases: string[] = [];
  let until: string | null = null;
  for (const rc of mockReturnCases) {
    if (!rc.package_ids.includes(s.package_id) || rc.status === "CANCELLED") continue;
    if (isCaseOpen(rc)) {
      cases.push(rc.code);
      continue;
    }
    const start = rc.status === "NO_PARCEL" ? rc.reported_at : rc.received_at;
    const days = rc.status === "NO_PARCEL" ? 30 : 7;
    if (!start) continue;
    const end = Date.parse(start) + days * DAY;
    if (end > now) {
      cases.push(rc.code);
      until = iso(end);
    }
  }
  const reasons: Protection["reasons"] = [];
  if (claims.length) reasons.push("CLAIM");
  if (cases.length) reasons.push("RETURN_CASE");
  if (held) reasons.push("HELD");
  if (!reasons.length) return null;
  return { reasons, claims, return_cases: cases, until: claims.length ? null : until };
}

/** Phần item 02 của một phiên trong API-31 (`sessions[]` mở rộng). */
export function sessionExtras(s: MockSession, role: string) {
  const type = s.type ?? "PACK";
  const ended = s.ended_at ? Date.parse(s.ended_at) : 0;
  return {
    type,
    operator_name: s.operator_name ?? null,
    return_case_id: s.return_case_id ?? null,
    inspection: s.inspection ?? null,
    can_correct:
      type === "RETURN" &&
      s.status === "COMPLETED" &&
      (role === "ADMIN" || role === "SUPERVISOR") &&
      Date.now() - ended <= 7 * DAY,
    // BE: ảnh đã xóa → `url = null`, không có `protection`.
    snapshots: (s.snapshots ?? []).map((x) => ({
      ...x,
      url: x.status === "DELETED" || x.status === "MISSING" ? null : x.url,
      protection: x.status === "DELETED" ? null : protectionOf(s),
    })),
    // item 03: clip Cam 1 thiếu tệp → ảnh lúc đóng gói cũng thiếu tệp (`url = null` — DEC-524).
    pack_snapshot:
      type === "PACK" && s.status === "COMPLETED" && s.clips.length
        ? s.clips.find((c) => c.camera_role === "CAM1")?.status === "MISSING"
          ? { id: `snap-pack-${s.id}`, url: null, status: "MISSING" as const }
          : {
              id: `snap-pack-${s.id}`,
              url: mockSnapshot(`snap-pack-${s.id}`, "PACK_CLOSE", "").url,
              status: "READY" as const,
            }
        : null,
    protected_by_claims: mockClaims
      .filter((c) => claimIsOpen(c) && c.evidence.some((e) => e.ref_id === s.id))
      .map((c) => ({ id: c.id, code: c.code })),
  };
}

resetMockReturns();
