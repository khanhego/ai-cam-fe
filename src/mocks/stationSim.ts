import type { ScanAlert, ScanResult, StationSession, StationState } from "@/lib/api/station";

/**
 * Mô phỏng state machine phiên của BE (02a §4.1) cho `pnpm dev:mock` và test.
 * Kịch bản theo seed TST (04 §1): …09 hủy, …10 đã đóng, …11 đã bàn giao, …12 ba sản phẩm, SPXTST999… không có trên sàn.
 */
type Pkg = { code: string; status: string; verified: boolean };

const ITEMS_DEFAULT = [{ product_name: "Áo thun basic", variation: "Đen / L", quantity: 2, image_url: null }];
const ITEMS_12 = [
  ...ITEMS_DEFAULT,
  { product_name: "Tất cổ ngắn", variation: "Trắng", quantity: 1, image_url: null },
  { product_name: "Túi vải", variation: null, quantity: 1, image_url: null },
];

export class StationSim {
  stationName = "TST Station 01";
  packages = new Map<string, Pkg>();
  session: (StationSession & { cam2Seen: boolean }) | null = null;
  tray: string[] | null = null;
  todayCount = 0;
  approval: StationState["approval_request"] = null;
  private beforeApproval: "OPEN" | "MISMATCH" | null = null;
  recent: {
    id: string;
    tracking_number: string;
    status: string;
    flags: string[];
    started_at: string;
    ended_at: string | null;
    clips: { id: string; camera_role: "CAM1" | "CAM2"; status: string }[];
  }[] = [];
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
    return {
      station: { id: "st-1", name: this.stationName },
      state: this.approval ? "WAITING_APPROVAL" : s ? (s.status === "OPEN" ? "PACKING" : s.status) : "READY",
      cameras: this.cameras,
      tray: {
        codes: this.tray ?? [],
        match: this.match(),
        updated_at: this.tray ? new Date().toISOString() : null,
      },
      session: s
        ? {
            id: s.id,
            status: s.status,
            started_at: s.started_at,
            flags: s.flags,
            package: s.package,
            mismatch: s.mismatch,
            warn_at: s.warn_at,
            abandon_at: s.abandon_at,
          }
        : null,
      approval_request: this.approval,
      today_count: this.todayCount,
      server_time: new Date().toISOString(),
    };
  }

  scan(rawCode: string, clientScanId: string): ScanResult {
    const prev = this.processed.get(clientScanId);
    if (prev) return { ...prev, state: this.state() };
    const code = rawCode.trim().toUpperCase();
    const result = this.handle(code);
    this.processed.set(clientScanId, result);
    return { ...result, state: this.state() };
  }

  private alert(code: ScanAlert["code"], message: string, data: Record<string, unknown> = {}) {
    return { outcome: "ALERT" as const, alert: { code, message, data } };
  }

  private handle(code: string): Omit<ScanResult, "state"> {
    if (!/^[A-Z0-9-]{8,40}$/.test(code)) {
      return this.alert("INVALID_CODE", "Mã vừa quét không phải mã vận đơn. Quét lại mã trên phiếu.");
    }
    const s = this.session;
    if (!s) {
      if (this.approval) return { outcome: "IGNORED", alert: null };
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
      this.pkg(code).status = "PACKED";
      const done = new Date().toISOString();
      this.recent.unshift({
        id: s.id,
        tracking_number: code,
        status: "COMPLETED",
        flags: s.flags,
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
      return { outcome: "SESSION_COMPLETED", alert: null };
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
    if (s) {
      this.beforeApproval = s.status as "OPEN" | "MISMATCH";
      s.status = "WAITING_APPROVAL";
    }
    return null;
  }

  withdraw(id: string): boolean {
    if (!this.approval || this.approval.id !== id) return false;
    this.approval = null;
    if (this.session && this.beforeApproval) this.session.status = this.beforeApproval;
    this.beforeApproval = null;
    return true;
  }

  cancel(sessionId: string): boolean {
    if (!this.session || this.session.id !== sessionId || this.session.status === "WAITING_APPROVAL")
      return false;
    this.pkg(this.session.package.tracking_number).status = "NEW";
    this.session = null;
    return true;
  }
}

export let stationSim = new StationSim();
export const resetStationSim = () => {
  stationSim = new StationSim();
};
