import { ACTIONS_BY_TYPE, type ApprovalAction, type ApprovalContext } from "@/lib/api/approvals";
import type {
  CancelReason,
  ClosedSession,
  OpenReturnSessionBody,
  RecentSession,
  ReturnLookup,
  ScanAlert,
  ScanResult,
  SessionFlag,
  StationKind,
  StationSession,
  StationState,
  WorkMode,
} from "@/lib/api/station";
import { CONCLUSION_LABEL, canBeOk, INSPECTION_LIMITS } from "@/shared/returns/inspection";
import type { Conclusion, InspectionInput, Snapshot } from "@/shared/returns/types";
import { WAREHOUSE_STATUS, type WarehouseStatus } from "@/shared/labels";

import { mockPackages, type MockPackage } from "./packagesDb";
import {
  blockedReason,
  closeReturn,
  codesOf,
  createAutoClaim,
  createUnidentified,
  createWarehouseCase,
  findCase,
  findPackage,
  initialInspection,
  isCaseOpen,
  itemsOf,
  mockReturnCases,
  mockSnapshot,
  packSessionOf,
  recomputeCase,
  recordReturnSession,
  resolveReturnCode,
  type MockReturnCase,
} from "./returnsDb";

/**
 * Mô phỏng state machine phiên của BE (02a §4.1) cho `pnpm dev:mock` và test.
 * Kịch bản theo seed TST (04 §1): …09 hủy, …10 đã đóng, …11 đã bàn giao, …12 ba sản phẩm, SPXTST999… không có trên sàn.
 *
 * Item 02 (T-131): chế độ bàn RETURN (02 §6.2 API-10/11 RETURN, API-100..105) trên dữ liệu `returnsDb` (04 §1 dải
 * `SPXTST00000[4-5]x`): `SPXRTTST000041` mở Khách trả hàng · `SPXTST0000042` Giao thất bại · `2410TST00043` đơn 2 kiện
 * → RETURN_MULTIPLE_PACKAGES · `SPXTST0000053` đã nhận · `SPXTST0000010` chưa gửi · `SPXVN0000000000` không tìm thấy.
 */
type Pkg = { code: string; status: string; verified: boolean };

/** Phiên trong sim: thêm phần nội bộ (khay Cam 2, kiện / hồ sơ hàng hoàn). */
type SimSession = StationSession & {
  cam2Seen: boolean;
  pkgId?: string;
  caseId?: string;
  before?: WarehouseStatus;
  /** Mã đã quét để mở phiên RETURN (`pack.open_code` của BE) — `tracking_number` trong `closed_session`, API-15, WS. */
  openCode?: string;
};

const SCAN_CODE = /^[A-Z0-9-]{8,40}$/;
/** Chế độ RETURN nhận thêm mã đơn sàn (02 §6.2 API-11 `INVALID_CODE`). */
const ORDER_SN = /^[A-Z0-9]{10,20}$/;
const RETURN_WARN_MIN = 20;
const RETURN_ABANDON_MIN = 45;
export const SNAPSHOT_MAX = 20;

/** Trường mặc định của phiên PACK (02 §6.2 API-10: phiên PACK có `return_case`, `inspection`… = null). */
const PACK_FIELDS = {
  type: "PACK",
  operator_name: null,
  return_case: null,
  inspection: null,
  snapshots: null,
  pack_reference: null,
} as const;

export type SimError = { status: number; code: string; message: string; details?: Record<string, unknown> };
const err = (status: number, code: string, message: string, details?: Record<string, unknown>): SimError => ({
  status,
  code,
  message,
  details,
});

const ITEMS_DEFAULT = [{ product_name: "Áo thun basic", variation: "Đen / L", quantity: 2, image_url: null }];
const ITEMS_12 = [
  ...ITEMS_DEFAULT,
  { product_name: "Tất cổ ngắn", variation: "Trắng", quantity: 1, image_url: null },
  { product_name: "Túi vải", variation: null, quantity: 1, image_url: null },
];

export class StationSim {
  stationName = "TST Station 01";
  /** 04 §1: TST Station 01 loại "Cả hai", mặc định chế độ đóng gói. */
  kind: StationKind = "BOTH";
  workMode: WorkMode = "PACK";
  operatorName: string | null = null;
  todayReturnCount = 0;
  todayReturnIssueCount = 0;
  packages = new Map<string, Pkg>();
  session: SimSession | null = null;
  tray: string[] | null = null;
  todayCount = 0;
  approval: StationState["approval_request"] = null;
  /** `context` của yêu cầu đang chờ (API-20): mã liên quan + `tray_match` lúc gửi. */
  approvalContext: ApprovalContext | null = null;
  private beforeApproval: "OPEN" | "MISMATCH" | null = null;
  recent: RecentSession[] = [];
  processed = new Map<string, Omit<ScanResult, "state">>();
  cameras: StationState["cameras"] = [
    { role: "CAM1", status: "ONLINE" },
    { role: "CAM2", status: "ONLINE" },
  ];

  private pkg(code: string): Pkg {
    let p = this.packages.get(code);
    if (!p) {
      const n = Number(code.replace(/\D/g, "").slice(-4));
      const known = /^SPXTST0000\d{3}$/.test(code) && n >= 1 && n <= 30;
      const status = n === 9 ? "CANCELLED" : n === 10 ? "PACKED" : n === 11 ? "HANDED_OVER" : "NEW";
      p = { code, status: known ? status : "NEW", verified: known };
      this.packages.set(code, p);
    }
    return p;
  }

  private match(): StationState["tray"]["match"] {
    if (this.tray === null) return "UNAVAILABLE";
    if (this.tray.length === 0) return "NOT_SEEN";
    if (this.tray.length > 1) return "MULTIPLE";
    return this.session && this.tray[0] === this.session.package.tracking_number ? "MATCH" : "DIFFERENT";
  }

  state(): StationState {
    const s = this.session;
    const open = s?.type === "RETURN" ? "INSPECTING" : "PACKING";
    return {
      station: {
        id: "st-1",
        name: this.stationName,
        kind: this.kind,
        work_mode: this.workMode,
        operator_name: this.operatorName,
      },
      state: this.approval ? "WAITING_APPROVAL" : s ? (s.status === "OPEN" ? open : s.status) : "READY",
      cameras: this.cameras,
      tray: {
        codes: this.tray ?? [],
        match: this.match(),
        updated_at: this.tray ? new Date().toISOString() : null,
      },
      session: s
        ? {
            id: s.id,
            type: s.type,
            status: s.status,
            started_at: s.started_at,
            flags: s.flags,
            operator_name: s.operator_name,
            package: s.package,
            return_case: s.return_case,
            inspection: s.inspection,
            snapshots: s.snapshots,
            pack_reference: s.pack_reference,
            mismatch: s.mismatch,
            warn_at: s.warn_at,
            abandon_at: s.abandon_at,
          }
        : null,
      approval_request: this.approval,
      today_count: this.todayCount,
      today_return_count: this.todayReturnCount,
      today_return_issue_count: this.todayReturnIssueCount,
      server_time: new Date().toISOString(),
    };
  }

  scan(rawCode: string, clientScanId: string): ScanResult {
    const prev = this.processed.get(clientScanId);
    if (prev) return { ...prev, state: this.state() };
    const code = rawCode.trim().toUpperCase();
    const result = this.workMode === "RETURN" ? this.handleReturn(code) : this.handle(code);
    this.processed.set(clientScanId, result);
    return { ...result, state: this.state() };
  }

  private alert(code: ScanAlert["code"], message: string, data: Record<string, unknown> = {}) {
    return { outcome: "ALERT" as const, alert: { code, message, data } };
  }

  private handle(code: string): Omit<ScanResult, "state"> {
    if (!SCAN_CODE.test(code)) {
      return this.alert("INVALID_CODE", "Mã vừa quét không phải mã vận đơn. Quét lại mã trên phiếu.");
    }
    const s = this.session;
    if (!s) {
      if (this.approval) return { outcome: "IGNORED", alert: null };
      // Kiện hàng hoàn quét ở bàn đóng gói (02 §6.2 API-11 v0.2, DEC-247).
      const rp = resolveReturnCode(code);
      if (rp.kind === "PACKAGE" && rp.pkg.warehouse_status.startsWith("RETURN_"))
        return this.alert(
          "ALREADY_HANDED_OVER",
          `${rp.pkg.tracking_number} là kiện hàng hoàn — nhận ở bàn nhận hoàn.`,
          { is_return: true },
        );
      const p = this.pkg(code);
      if (p.status === "CANCELLED")
        return this.alert("ORDER_CANCELLED", `${code} đã bị hủy trên Shopee. Không đóng gói.`);
      if (p.status === "PACKED")
        return this.alert("ALREADY_PACKED", `${code} đã đóng gói tại TST Station 02.`, {
          packed_at: new Date(Date.now() - 3_600_000).toISOString(),
          station_name: "TST Station 02",
          can_request_repack: true,
        });
      if (p.status === "HANDED_OVER")
        return this.alert(
          "ALREADY_HANDED_OVER",
          `${code} đã bàn giao cho đơn vị vận chuyển. Không đóng gói lại.`,
        );
      const now = Date.now();
      p.status = "PACKING";
      this.session = {
        id: `ses-${now}`,
        ...PACK_FIELDS,
        status: "OPEN",
        started_at: new Date(now).toISOString(),
        flags: p.verified ? [] : ["UNVERIFIED"],
        package: {
          id: `pkg-${code}`,
          tracking_number: code,
          order: p.verified
            ? {
                platform: "SHOPEE",
                platform_order_sn: code.replace("SPXTST", "2410TST"),
                buyer_note: code.endsWith("5") ? "Gói kỹ giúp em" : null,
              }
            : null,
          items: p.verified ? (code.endsWith("012") ? ITEMS_12 : ITEMS_DEFAULT) : [],
        },
        mismatch: null,
        warn_at: new Date(now + 15 * 60_000).toISOString(),
        abandon_at: new Date(now + 30 * 60_000).toISOString(),
        cam2Seen: this.match() === "MATCH",
      };
      return { outcome: "SESSION_OPENED", alert: null };
    }
    if (s.status === "WAITING_APPROVAL" || this.approval) return { outcome: "IGNORED", alert: null };
    const m = this.match();
    if (m === "MATCH") s.cam2Seen = true;
    const expected = s.package.tracking_number;
    if (m === "DIFFERENT" || m === "MULTIPLE") {
      s.status = "MISMATCH";
      s.mismatch = {
        source: "CAM2",
        expected,
        actual: (this.tray ?? []).filter((c) => c !== expected).join(", "),
      };
      return { outcome: "MISMATCH", alert: null };
    }
    if (code === expected) {
      const closed = this.complete(s);
      return { outcome: "SESSION_COMPLETED", alert: null, closed_session: closed };
    }
    s.status = "MISMATCH";
    s.mismatch = { source: "SCAN", expected, actual: code };
    if (!s.flags.includes("HAD_MISMATCH")) s.flags = [...s.flags, "HAD_MISMATCH"];
    return { outcome: "MISMATCH", alert: null };
  }

  requestApproval(body: {
    type: "MISMATCH" | "ASSIST" | "REPACK";
    session_id?: string;
    tracking_number?: string;
  }) {
    if (this.approval) return "APPROVAL_ALREADY_PENDING";
    const s = this.session;
    // Phiên RETURN: chỉ ASSIST (02 §6.2 API-13 mở rộng).
    if (s?.type === "RETURN" && body.type !== "ASSIST") return "NOT_ELIGIBLE";
    if (body.type === "REPACK") {
      if (s || this.pkg(String(body.tracking_number)).status !== "PACKED") return "NOT_ELIGIBLE";
    } else if (
      !s ||
      s.id !== body.session_id ||
      s.status !== (body.type === "MISMATCH" ? "MISMATCH" : "OPEN")
    ) {
      return "NOT_ELIGIBLE";
    }
    this.approval = {
      id: `apr-${Date.now()}`,
      type: body.type,
      tracking_number: s ? s.package.tracking_number : String(body.tracking_number),
      created_at: new Date().toISOString(),
    };
    this.approvalContext = {
      expected: s?.mismatch?.expected ?? (s ? s.package.tracking_number : String(body.tracking_number)),
      actual: s?.mismatch?.actual ?? null,
      source: s?.mismatch?.source ?? null,
      tray_match: this.match(),
    };
    if (s) {
      this.beforeApproval = s.status as "OPEN" | "MISMATCH";
      s.status = "WAITING_APPROVAL";
    }
    return null;
  }

  withdraw(id: string): boolean {
    if (!this.approval || this.approval.id !== id) return false;
    this.approval = null;
    this.approvalContext = null;
    if (this.session && this.beforeApproval) this.session.status = this.beforeApproval;
    this.beforeApproval = null;
    return true;
  }

  /** API-12: lý do theo loại phiên (02 §5.2). Trả mã lỗi hoặc null. */
  cancel(sessionId: string, reason?: CancelReason): "SESSION_NOT_OPEN" | "VALIDATION_ERROR" | null {
    const s = this.session;
    if (!s || s.id !== sessionId || s.status === "WAITING_APPROVAL") return "SESSION_NOT_OPEN";
    if (reason) {
      const allowed: CancelReason[] =
        s.type === "RETURN"
          ? ["WRONG_SCAN", "NOT_A_RETURN", "OTHER"]
          : ["OUT_OF_STOCK", "WRONG_SCAN", "OTHER"];
      if (!allowed.includes(reason)) return "VALIDATION_ERROR";
    }
    this.dropSession("CANCELLED");
    return null;
  }

  /** Kết thúc phiên PACK `COMPLETED` (quét lại đúng mã hoặc quản lý đóng phiên có ghi chú). */
  private complete(s: SimSession, extraFlags: SessionFlag[] = []): ClosedSession {
    const code = s.package.tracking_number;
    this.pkg(code).status = "PACKED";
    const done = new Date().toISOString();
    const flags = [...s.flags, ...extraFlags];
    this.recent.unshift({
      id: s.id,
      type: "PACK",
      tracking_number: code,
      status: "COMPLETED",
      flags,
      conclusion: null,
      claim_code: null,
      started_at: s.started_at,
      ended_at: done,
      clips: [
        { id: `clip-${s.id}-1`, camera_role: "CAM1", status: "READY" },
        { id: `clip-${s.id}-2`, camera_role: "CAM2", status: "READY" },
      ],
    });
    this.recent = this.recent.slice(0, 5);
    this.session = null;
    this.todayCount += 1;
    // 02 §6.2 API-11: `closed_session` (FR-03.14); đơn hủy khi đang đóng → CANCELLED_AFTER_PACK (BR-21).
    return {
      id: s.id,
      type: "PACK",
      tracking_number: code,
      flags,
      conclusion: null,
      claim_code: null,
      package_status: flags.includes("ORDER_CANCELLED") ? "CANCELLED_AFTER_PACK" : "PACKED",
    };
  }

  /**
   * Hủy / bỏ dở phiên. PACK: kiện về `NEW`, riêng phiên đóng gói lại trả kiện về `PACKED` (BR-03).
   * RETURN: kiện về trạng thái trước; hồ sơ tạo bởi phiên này (chưa có phiên khác) → `CANCELLED` (02 §6.2 API-12).
   */
  private dropSession(status: "CANCELLED" | "ABANDONED" = "CANCELLED") {
    const s = this.session;
    if (!s) return;
    if (s.type === "RETURN") {
      const pkg = s.pkgId ? findPackage(s.pkgId) : undefined;
      const rc = s.caseId ? findCase(s.caseId) : undefined;
      if (pkg) {
        pkg.warehouse_status = s.before ?? "DELIVERED";
        recordReturnSession(pkg, this.toPackageSession(s, status));
      }
      if (rc) {
        if (rc.created_by_session === s.id) rc.status = "CANCELLED";
        else recomputeCase(rc);
      }
    } else {
      this.pkg(s.package.tracking_number).status = s.flags.includes("REPACK") ? "PACKED" : "NEW";
    }
    this.session = null;
  }

  /**
   * API-21 trên station giả (02a API-21): trả mã lỗi hoặc null. CONTINUE đưa phiên về OPEN rồi đánh giá lại khay;
   * CLOSE_WITH_NOTE bị chặn khi khay còn phiếu sai; APPROVE_REPACK mở phiên mới cờ REPACK.
   */
  decide(id: string, action: ApprovalAction): "TRAY_STILL_DIFFERENT" | "INVALID_ACTION" | "NOT_FOUND" | null {
    const a = this.approval;
    if (!a || a.id !== id) return "NOT_FOUND";
    if (!ACTIONS_BY_TYPE[a.type].includes(action)) return "INVALID_ACTION";
    const s = this.session;
    const m = this.match();
    // Phiên hoàn đóng bằng quét + kết luận (02 §6.2 API-21 mở rộng).
    if (action === "CLOSE_WITH_NOTE" && s?.type === "RETURN") return "INVALID_ACTION";
    if (action === "CLOSE_WITH_NOTE" && s?.type !== "RETURN" && (m === "DIFFERENT" || m === "MULTIPLE"))
      return "TRAY_STILL_DIFFERENT";
    this.approval = null;
    this.approvalContext = null;
    this.beforeApproval = null;
    if (action === "CONTINUE" && s) {
      s.status = "OPEN";
      s.mismatch = null;
      if (s.type === "PACK" && (m === "DIFFERENT" || m === "MULTIPLE")) {
        const expected = s.package.tracking_number;
        s.status = "MISMATCH";
        s.mismatch = {
          source: "CAM2",
          expected,
          actual: (this.tray ?? []).filter((c) => c !== expected).join(", "),
        };
      }
    } else if (action === "CLOSE_WITH_NOTE" && s) {
      this.complete(s, ["CLOSED_BY_SUPERVISOR"]);
    } else if (action === "CANCEL_SESSION") {
      this.dropSession();
    } else if (action === "APPROVE_REPACK") {
      const now = Date.now();
      const p = this.pkg(a.tracking_number);
      p.status = "PACKING";
      this.session = {
        id: `ses-${now}`,
        ...PACK_FIELDS,
        status: "OPEN",
        started_at: new Date(now).toISOString(),
        flags: ["REPACK"],
        package: {
          id: `pkg-${a.tracking_number}`,
          tracking_number: a.tracking_number,
          order: {
            platform: "SHOPEE",
            platform_order_sn: a.tracking_number.replace("SPXTST", "2410TST"),
            buyer_note: null,
          },
          items: ITEMS_DEFAULT,
        },
        mismatch: null,
        warn_at: new Date(now + 15 * 60_000).toISOString(),
        abandon_at: new Date(now + 30 * 60_000).toISOString(),
        cam2Seen: false,
      };
    }
    return null;
  }

  // ───────────────────────── item 02: chế độ RETURN (T-131) ─────────────────────────

  private busy() {
    return this.session !== null || this.approval !== null;
  }

  /** API-100 (02 §6.2): chỉ station `BOTH`; đang có phiên / yêu cầu chờ → SESSION_ACTIVE. */
  setWorkMode(mode: WorkMode): SimError | null {
    if (mode !== "PACK" && mode !== "RETURN")
      return err(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", { fields: { work_mode: "Không hợp lệ" } });
    if (this.kind !== "BOTH")
      return err(409, "MODE_NOT_ALLOWED", "Station này không đổi được chế độ.", { kind: this.kind });
    if (this.busy()) return err(409, "SESSION_ACTIVE", "Đóng phiên trước khi đổi.");
    this.workMode = mode;
    return null;
  }

  /** API-101: tên người kiểm strip, 2–40 ký tự (BR-28). */
  setOperator(raw: unknown): SimError | null {
    // BE gộp khoảng trắng (`" ".join(name.split())`, station_config.py).
    const name = typeof raw === "string" ? raw.split(/\s+/).filter(Boolean).join(" ") : "";
    if (name.length < 2 || name.length > 40)
      return err(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", {
        // BE: cùng một chữ cho mọi trường hợp (station_config.py).
        fields: { name: "Nhập tên người kiểm 2–40 ký tự" },
      });
    if (this.busy()) return err(409, "SESSION_ACTIVE", "Đóng phiên trước khi đổi người kiểm.");
    this.operatorName = name;
    return null;
  }

  /** Station đăng xuất / bị thu hồi → server xóa tên người kiểm (BR-28, 02 §6.3 #17). */
  clearOperator() {
    this.operatorName = null;
  }

  private returnOpenable(pkg: MockPackage): Omit<ScanResult, "state"> | null {
    const reason = blockedReason(pkg);
    if (!reason) return null;
    const code = pkg.tracking_number;
    if (reason === "RETURN_ALREADY_RECEIVED") {
      const rc = mockReturnCases.find((c) => c.package_ids.includes(pkg.id) && c.received_at);
      const session = pkg.sessions.find((x) => x.type === "RETURN" && x.status === "COMPLETED");
      const conclusion = session?.inspection?.conclusion ?? rc?.conclusion ?? null;
      return this.alert(
        "RETURN_ALREADY_RECEIVED",
        `${code} đã nhận tại ${session?.station_name ?? this.stationName}${conclusion ? ` — ${CONCLUSION_LABEL[conclusion]}` : ""}.`,
        {
          received_at: rc?.received_at ?? session?.ended_at ?? null,
          station_name: session?.station_name ?? this.stationName,
          conclusion,
          can_record_other: true,
        },
      );
    }
    if (reason === "RETURN_IN_PROGRESS_ELSEWHERE")
      return this.alert("RETURN_IN_PROGRESS_ELSEWHERE", `${code} đang được kiểm tại TST Station 02.`, {
        station_name: "TST Station 02",
      });
    const label = WAREHOUSE_STATUS[pkg.warehouse_status]?.[0] ?? pkg.warehouse_status;
    return this.alert(
      "NOT_SHIPPED",
      `${code} đang ở trạng thái ${label} trong kho. Đây không phải hàng hoàn. Nếu kiện thực sự đã gửi đi, báo quản lý điều chỉnh trạng thái.`,
      {
        warehouse_status: pkg.warehouse_status,
      },
    );
  }

  /** Mở phiên RETURN trên kiện (đã qua kiểm `returnOpenable`). Hồ sơ chưa có → `UNANNOUNCED` (attach_or_create). */
  private openReturn(
    pkg: MockPackage,
    rc: MockReturnCase | undefined,
    extraFlags: SessionFlag[] = [],
    openCode = pkg.tracking_number,
  ) {
    const now = Date.now();
    const id = `ses-${now}-rt`;
    const before = pkg.warehouse_status;
    const caseRef = rc && isCaseOpen(rc) ? rc : createWarehouseCase(pkg, id);
    if (!caseRef.before[pkg.id]) caseRef.before[pkg.id] = before;
    pkg.warehouse_status = "RETURN_INSPECTING";
    caseRef.status = "INSPECTING";
    const pack = packSessionOf(pkg);
    const flags: SessionFlag[] = [...extraFlags];
    if (!pack) flags.push("NO_PACK_CLIP");
    if (caseRef.kind === "UNANNOUNCED") flags.push("UNANNOUNCED");
    if (caseRef.kind === "UNIDENTIFIED" && !flags.includes("UNIDENTIFIED")) flags.push("UNIDENTIFIED");
    const received = caseRef.package_ids.filter((x) =>
      findPackage(x)?.warehouse_status.startsWith("RETURN_RECEIVED"),
    ).length;
    this.session = {
      id,
      type: "RETURN",
      status: "OPEN",
      started_at: new Date(now).toISOString(),
      flags,
      operator_name: this.operatorName,
      package: {
        id: pkg.id,
        tracking_number: pkg.tracking_number,
        order: pkg.order
          ? {
              platform: "SHOPEE",
              platform_order_sn: pkg.order.platform_order_sn,
              buyer_note: pkg.order.buyer_note,
            }
          : null,
        items: itemsOf(pkg),
      },
      return_case: {
        id: caseRef.id,
        code: caseRef.code,
        kind: caseRef.kind,
        status: caseRef.status,
        platform_return_sn: caseRef.platform_return_sn,
        return_tracking_number: caseRef.return_tracking_number,
        reason: caseRef.reason,
        reason_text: caseRef.reason_text,
        reason_label: caseRef.reason_label,
        package_count: caseRef.package_ids.length,
        received_count: received,
      },
      inspection: initialInspection(pkg, caseRef),
      snapshots: [],
      pack_reference: pack
        ? {
            session_id: pack.id,
            ended_at: pack.ended_at ?? pack.started_at,
            station_name: pack.station_name,
            clips: pack.clips.map((c) => ({ id: c.id, camera_role: c.camera_role, status: c.status })),
            snapshot: {
              id: `snap-pack-${pack.id}`,
              url: mockSnapshot(`snap-pack-${pack.id}`, "PACK_CLOSE", "").url,
            },
          }
        : null,
      mismatch: null,
      warn_at: new Date(now + RETURN_WARN_MIN * 60_000).toISOString(),
      abandon_at: new Date(now + RETURN_ABANDON_MIN * 60_000).toISOString(),
      cam2Seen: false,
      pkgId: pkg.id,
      caseId: caseRef.id,
      before,
      openCode: openCode.toUpperCase(),
    };
    return { outcome: "SESSION_OPENED" as const, alert: null };
  }

  /** API-11 nhánh `work_mode = RETURN` (02 §6.2). `MISMATCH` không bao giờ trả ở chế độ này. */
  private handleReturn(code: string): Omit<ScanResult, "state"> {
    // Thứ tự như BE (sessions/service.py, return_scan.py): yêu cầu chờ → IGNORED; đang kiểm → mọi mã ngoài hồ sơ là
    // RETURN_CODE_DIFFERENT (không INVALID_CODE); rảnh → kiểm định dạng (nhận cả mã đơn sàn).
    if (this.approval) return { outcome: "IGNORED", alert: null };
    const s = this.session;
    if (s) {
      if (s.status === "WAITING_APPROVAL") return { outcome: "IGNORED", alert: null };
      const rc = findCase(s.caseId!)!;
      const pkg = findPackage(s.pkgId!)!;
      const expected = codesOf(rc, pkg, s.openCode);
      if (!expected.includes(code))
        return this.alert(
          "RETURN_CODE_DIFFERENT",
          `Mã ${code} không thuộc kiện đang kiểm. Quét lại mã trên kiện này để hoàn tất.`,
          { code, expected_codes: expected },
        );
      if (!s.inspection?.conclusion)
        return this.alert("INSPECTION_REQUIRED", "Chọn kết luận trước khi quét đóng.");
      return { outcome: "SESSION_COMPLETED", alert: null, closed_session: this.completeReturn(s) };
    }
    if (!SCAN_CODE.test(code) && !ORDER_SN.test(code))
      return this.alert("INVALID_CODE", "Mã vừa quét không phải mã vận đơn / mã đơn. Quét lại mã trên kiện.");
    if (!this.operatorName)
      return this.alert("OPERATOR_REQUIRED", "Nhập tên người kiểm trước khi nhận hàng hoàn.");
    const found = resolveReturnCode(code);
    if (found.kind === "NOT_FOUND")
      return this.alert("RETURN_NOT_FOUND", `Không có đơn nào khớp mã ${code}, sàn không trả lời.`, {
        code,
        can_open_unidentified: true,
      });
    if (found.kind === "MULTIPLE")
      return this.alert(
        "RETURN_MULTIPLE_PACKAGES",
        `Đơn ${found.orderSn} có ${found.count} kiện. Chọn đúng kiện đang cầm.`,
        { platform_order_sn: found.orderSn },
      );
    return this.returnOpenable(found.pkg) ?? this.openReturn(found.pkg, found.rc, [], code);
  }

  /** Đóng phiên RETURN (quét cùng hồ sơ + đã có kết luận, hoặc J-07 tự hoàn tất). */
  private completeReturn(s: SimSession, extraFlags: SessionFlag[] = []): ClosedSession {
    const pkg = findPackage(s.pkgId!)!;
    const rc = findCase(s.caseId!)!;
    const conclusion = s.inspection!.conclusion!;
    const flags = [...s.flags, ...extraFlags];
    closeReturn(rc, pkg, conclusion);
    const recorded = this.toPackageSession({ ...s, flags }, "COMPLETED");
    recordReturnSession(pkg, recorded);
    const claim = createAutoClaim(rc, pkg, recorded, conclusion);
    this.todayReturnCount += 1;
    if (conclusion !== "OK") this.todayReturnIssueCount += 1;
    this.recent.unshift({
      id: s.id,
      type: "RETURN",
      tracking_number: s.openCode ?? s.package.tracking_number,
      status: "COMPLETED",
      flags,
      conclusion,
      claim_code: claim?.code ?? null,
      started_at: s.started_at,
      ended_at: recorded.ended_at,
      clips: recorded.clips.map((c) => ({ id: c.id, camera_role: c.camera_role, status: "PENDING" })),
    });
    this.recent = this.recent.slice(0, 5);
    this.session = null;
    return {
      id: s.id,
      type: "RETURN",
      tracking_number: s.openCode ?? s.package.tracking_number,
      flags,
      conclusion,
      claim_code: claim?.code ?? null,
      package_status: pkg.warehouse_status,
      return_case_status: rc.status,
    };
  }

  /** Phiên của sim → phiên trong `packagesDb` (D4 / bằng chứng hồ sơ thấy được). */
  private toPackageSession(s: SimSession, status: "COMPLETED" | "CANCELLED" | "ABANDONED") {
    const end = new Date();
    return {
      id: s.id,
      package_id: s.pkgId ?? s.package.id,
      station_id: "st-1",
      station_name: this.stationName,
      status,
      started_at: s.started_at,
      ended_at: end.toISOString(),
      duration_s: Math.max(1, Math.round((end.getTime() - Date.parse(s.started_at)) / 1000)),
      flags: s.flags,
      cancel_reason: null,
      note: null,
      type: "RETURN" as const,
      operator_name: s.operator_name,
      return_case_id: s.caseId ?? null,
      inspection: s.inspection,
      snapshots: s.snapshots ?? [],
      clips: (["CAM1", "CAM2"] as const).map((role, i) => ({
        id: `clip-${s.id}-${i + 1}`,
        session_id: s.id,
        camera_role: role,
        status: "PENDING" as const,
        sha256: null,
        duration_s: null,
        held: false,
        retention_until: null,
        deleted_at: null,
        flags: [],
      })),
    };
  }

  private openReturnSession(sessionId: string): SimSession | SimError {
    const s = this.session;
    if (!s || s.id !== sessionId || s.status !== "OPEN")
      return err(409, "SESSION_NOT_OPEN", "Phiên không còn mở.");
    if (s.type !== "RETURN") return err(409, "NOT_RETURN_SESSION", "Phiên không phải phiên mở hoàn.");
    return s;
  }

  /**
   * API-102: ghi đè kết luận + dòng + ghi chú (như BE `sessions/inspection.py`): dòng lặp / dòng `OTHER` thiếu ghi chú /
   * ghi chú dòng > 500 → `lines.{i}.*`; `FULL` thiếu dòng → `fields.lines`, `order_item_id` lạ → `lines.{i}.order_item_id`;
   * BR-22 chỉ ở `FULL`; `REFERENCE` vẫn ghi dòng đã gửi (02 §6.3 #8).
   */
  saveInspection(sessionId: string, body: Partial<InspectionInput>) {
    const s = this.openReturnSession(sessionId);
    if ("code" in s) return s;
    const insp = s.inspection!;
    const full = insp.lines_mode === "FULL";
    const fields: Record<string, string> = {};
    const note = typeof body.note === "string" ? body.note : "";
    const conclusion = (body.conclusion ?? null) as Conclusion | null;
    if (note.length > INSPECTION_LIMITS.noteMax) fields.note = "Tối đa 500 ký tự";
    if (conclusion === "OTHER" && !note.trim()) fields.note = "Nhập ghi chú khi chọn Khác.";
    const input = body.lines ?? [];
    const seen = new Set<string>();
    input.forEach((l, i) => {
      const q = l.quantity_received;
      if (!Number.isInteger(q) || q < INSPECTION_LIMITS.quantityMin || q > INSPECTION_LIMITS.quantityMax)
        fields[`lines.${i}.quantity_received`] = "Số nhận 0–999";
      if (seen.has(l.order_item_id)) fields[`lines.${i}.order_item_id`] = "Dòng bị lặp";
      seen.add(l.order_item_id);
      if (full && !insp.lines.some((x) => x.order_item_id === l.order_item_id))
        fields[`lines.${i}.order_item_id`] = "Không thuộc đơn";
      if (l.condition === "OTHER" && !l.note?.trim())
        fields[`lines.${i}.note`] = "Nhập ghi chú khi chọn Khác.";
      if ((l.note ?? "").length > INSPECTION_LIMITS.noteMax) fields[`lines.${i}.note`] = "Tối đa 500 ký tự";
    });
    if (full && insp.lines.some((x) => !seen.has(x.order_item_id))) fields.lines = "Thiếu dòng của phiên";
    if (Object.keys(fields).length) return err(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", { fields });
    const byId = new Map(input.map((l) => [l.order_item_id, l]));
    const lines = insp.lines.map((line) => {
      const next = byId.get(line.order_item_id);
      return next
        ? {
            ...line,
            quantity_received: next.quantity_received,
            condition: next.condition,
            note: next.note ?? null,
          }
        : line;
    });
    if (conclusion === "OK" && !canBeOk(lines, insp.lines_mode))
      return err(422, "CONCLUSION_INCONSISTENT", "Có dòng thiếu / hỏng — không chọn Nguyên vẹn được.");
    s.inspection = { ...insp, conclusion, note, lines, saved_at: new Date().toISOString() };
    return { inspection: s.inspection };
  }

  /** API-103: ảnh Cam 1; tối đa 20; Cam 1 offline → CAMERA_UNREACHABLE. */
  takeSnapshot(sessionId: string): { snapshot: Snapshot } | SimError {
    const s = this.openReturnSession(sessionId);
    if ("code" in s) return s;
    const shots = s.snapshots ?? [];
    if (shots.length >= SNAPSHOT_MAX)
      return err(409, "SNAPSHOT_LIMIT", "Đã đủ 20 ảnh.", { max: SNAPSHOT_MAX });
    if (this.cameras.find((c) => c.role === "CAM1")?.status !== "ONLINE")
      return err(422, "CAMERA_UNREACHABLE", "Không chụp được ảnh từ Cam 1. Thử lại.");
    const shot = mockSnapshot(`snap-${s.id}-${shots.length + 1}`, "MANUAL", new Date().toISOString());
    s.snapshots = [...shots, shot];
    return { snapshot: shot };
  }

  /** API-104: khớp chính xác hoặc tiền tố ≥ 6 ký tự; tối đa 10, mới nhất trước. */
  returnLookup(raw: string): ReturnLookup | SimError {
    if (this.workMode !== "RETURN") return err(409, "WRONG_WORK_MODE", "Station không ở chế độ nhận hoàn.");
    const q = raw.trim().toUpperCase();
    if (q.length < 4 || q.length > 40)
      return err(422, "VALIDATION_ERROR", "Nhập ít nhất 4 ký tự.", {
        fields: { q: "Nhập ít nhất 4 ký tự." },
      });
    const hit = (v: string | null | undefined) => {
      const x = v?.toUpperCase();
      return Boolean(x && (x === q || (q.length >= 6 && x.startsWith(q))));
    };
    const pkgs = new Map<string, MockPackage>();
    for (const rc of mockReturnCases) {
      if (rc.status === "CANCELLED") continue;
      if (hit(rc.return_tracking_number) || hit(rc.code) || hit(rc.platform_return_sn))
        rc.package_ids.forEach((id) => {
          const p = findPackage(id);
          if (p) pkgs.set(p.id, p);
        });
    }
    for (const p of packagesOfAll())
      if (hit(p.tracking_number) || hit(p.order?.platform_order_sn)) pkgs.set(p.id, p);
    const items = [...pkgs.values()]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 10)
      .map((p) => {
        const rc = mockReturnCases.find((c) => c.package_ids.includes(p.id) && c.status !== "CANCELLED");
        const blocked = blockedReason(p) as ScanAlert["code"] | null;
        return {
          package_id: p.id,
          tracking_number: p.tracking_number,
          platform_order_sn: p.order?.platform_order_sn ?? null,
          warehouse_status: p.warehouse_status,
          return_case: rc
            ? {
                id: rc.id,
                code: rc.code,
                kind: rc.kind,
                status: rc.status,
                return_tracking_number: rc.return_tracking_number,
              }
            : null,
          can_open: blocked === null,
          blocked_reason: blocked,
        };
      });
    return { items, platform_checked: items.length === 0 };
  }

  /**
   * API-105 (02 §6.2, §6.3 #9, §6.4 #2, §6.5 #1): mở từ kết quả tìm, hoặc phiên chưa xác định; `force_new` chỉ khi mã
   * là kiện đã nhận. Kiện bị chặn → `200 ALERT` như API-11. Idempotent theo `client_scan_id`.
   */
  openFromLookup(body: Partial<OpenReturnSessionBody> & { force_new?: boolean; note?: string }) {
    if (this.workMode !== "RETURN") return err(409, "WRONG_WORK_MODE", "Station không ở chế độ nhận hoàn.");
    const scanId = body.client_scan_id;
    const pkgId = "package_id" in body ? body.package_id : undefined;
    const unidentified =
      "unidentified_code" in body ? body.unidentified_code?.trim().toUpperCase() : undefined;
    if (!scanId || (!pkgId && !unidentified))
      return err(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", {
        fields: { package_id: "Cần package_id hoặc unidentified_code" },
      });
    const prev = this.processed.get(scanId);
    if (prev) return { ...prev, state: this.state() };
    if (this.busy()) return err(409, "SESSION_ACTIVE", "Station đang có phiên. Đóng phiên trước.");
    let result: Omit<ScanResult, "state">;
    if (!this.operatorName) {
      result = this.alert("OPERATOR_REQUIRED", "Nhập tên người kiểm trước khi nhận hàng hoàn.");
    } else if (pkgId) {
      const pkg = findPackage(pkgId);
      if (!pkg) return err(404, "NOT_FOUND", "Không tìm thấy kiện.");
      const rc = mockReturnCases.find((c) => c.package_ids.includes(pkg.id) && isCaseOpen(c));
      result = this.returnOpenable(pkg) ?? this.openReturn(pkg, rc);
    } else {
      const code = unidentified!;
      if (!SCAN_CODE.test(code))
        return err(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", {
          fields: { unidentified_code: "Mã không hợp lệ" },
        });
      const found = resolveReturnCode(code);
      if (body.force_new) {
        const note = body.note?.trim() ?? "";
        if (note.length < 5 || note.length > 200)
          return err(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", {
            fields: { note: "Ghi chú 5–200 ký tự." },
          });
        const reason =
          found.kind === "PACKAGE"
            ? (blockedReason(found.pkg) ?? "SESSION_OPENED")
            : found.kind === "MULTIPLE"
              ? "RETURN_MULTIPLE_PACKAGES"
              : "RETURN_NOT_FOUND";
        if (reason !== "RETURN_ALREADY_RECEIVED")
          return err(409, "FORCE_NEW_NOT_ALLOWED", "Mã này không thuộc kiện đã nhận — quét lại.", { reason });
        const id = `ses-${Date.now()}-rt`;
        const { pkg, rc } = createUnidentified(code, id, note);
        result = this.openReturn(pkg, rc, ["UNIDENTIFIED"], code);
      } else if (found.kind === "PACKAGE") {
        result = this.returnOpenable(found.pkg) ?? this.openReturn(found.pkg, found.rc, [], code);
      } else if (found.kind === "MULTIPLE") {
        result = this.alert(
          "RETURN_MULTIPLE_PACKAGES",
          `Đơn ${found.orderSn} có ${found.count} kiện. Chọn đúng kiện đang cầm.`,
          { platform_order_sn: found.orderSn },
        );
      } else {
        const id = `ses-${Date.now()}-rt`;
        const { pkg, rc } = createUnidentified(code, id);
        result = this.openReturn(pkg, rc, ["UNIDENTIFIED"], code);
      }
    }
    this.processed.set(scanId, result);
    return { ...result, state: this.state() };
  }

  /**
   * J-07 cho phiên RETURN quá `return_abandon_minutes` (test / dev hook): đã lưu kết luận → tự hoàn tất cờ `AUTO_CLOSED`
   * (WS `alert SESSION_AUTO_CLOSED`); chưa có → bỏ dở (WS `SESSION_ABANDONED`) — DEC-253, 272.
   */
  expireReturnSession():
    | {
        code: "SESSION_AUTO_CLOSED";
        session_id: string;
        tracking_number: string;
        closed_session: ClosedSession;
      }
    | { code: "SESSION_ABANDONED"; session_id: string; tracking_number: string }
    | null {
    const s = this.session;
    if (!s || s.type !== "RETURN" || s.status !== "OPEN") return null;
    const base = { session_id: s.id, tracking_number: s.openCode ?? s.package.tracking_number };
    if (s.inspection?.saved_at && s.inspection.conclusion)
      return {
        code: "SESSION_AUTO_CLOSED",
        ...base,
        closed_session: this.completeReturn(s, ["AUTO_CLOSED"]),
      };
    this.dropSession("ABANDONED");
    return { code: "SESSION_ABANDONED", ...base };
  }

  /** J-04 / J-06 thấy đơn hủy khi kiện đang `PACKING` (BR-21, FR-03.15) — hook cho test / dev. */
  flagOrderCancelled(): {
    code: "ORDER_CANCELLED_DURING_SESSION";
    session_id: string;
    tracking_number: string;
  } | null {
    const s = this.session;
    if (!s || s.type !== "PACK") return null;
    if (!s.flags.includes("ORDER_CANCELLED")) s.flags = [...s.flags, "ORDER_CANCELLED"];
    return {
      code: "ORDER_CANCELLED_DURING_SESSION",
      session_id: s.id,
      tracking_number: s.package.tracking_number,
    };
  }

  /** Clip PACK của kiện đang có phiên RETURN hoạt động ở station này (API-40 luật STATION — 02 §6.1). */
  canViewPackClip(clipId: string): boolean {
    const s = this.session;
    if (!s || s.type !== "RETURN" || (s.status !== "OPEN" && s.status !== "WAITING_APPROVAL")) return false;
    return Boolean(s.pack_reference?.clips.some((c) => c.id === clipId));
  }
}

const packagesOfAll = () => mockPackages;

export let stationSim = new StationSim();
export const resetStationSim = () => {
  stationSim = new StationSim();
};
