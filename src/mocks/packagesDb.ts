import type { Clip, ClipStatus, PackageDetail, PackageListItem, PackageSession } from "@/lib/api/packages";
import type { SessionFlag } from "@/lib/api/station";
import { vnDay } from "@/shared/format";
import type { SessionStatus, WarehouseStatus } from "@/shared/labels";
import type { Inspection, Snapshot } from "@/shared/returns/types";

/**
 * Kiện, phiên, clip, bản xuất giả cho D2–D4 (02b-admin §12). Bám seed `aicam seed-demo --prefix TST`
 * (04-test-cases §1) cho `SPXTST0000001..30`, thêm lịch sử 7 ngày trước. Giờ tính theo ngày Việt Nam hiện tại.
 */
export type MockClip = Clip & { session_id: string };
export type MockSession = Omit<PackageSession, "clips"> & {
  station_id: string;
  package_id: string;
  clips: MockClip[];
  /** item 02 (02 §6.2 API-31 `sessions[]` mở rộng). Thiếu → PACK. */
  type?: "PACK" | "RETURN";
  operator_name?: string | null;
  return_case_id?: string | null;
  inspection?: Inspection | null;
  snapshots?: Snapshot[];
  /** Ảnh Cam 1 lúc đóng gói (J-17, L8) — phiên PACK. */
  pack_snapshot?: Snapshot | null;
};
export type MockPackage = Omit<PackageDetail, "sessions"> & {
  sessions: MockSession[];
  created_at: string;
  /** Kiện tạm của hàng hoàn chưa xác định (`TAM-…`, 02 §6.3 #2). */
  is_placeholder?: boolean;
};
export type MockExport = {
  id: string;
  session_id: string;
  layout: "CAM1" | "CAM2" | "SIDE_BY_SIDE";
  status: "QUEUED" | "RUNNING" | "READY" | "FAILED";
  progress: number;
  created_by: string;
  /** Mock: số lần poll trước khi xong; `fail` → FAILED. */
  ticks: number;
  fail: boolean;
};

export const STATIONS = { "st-1": "TST Station 01", "st-2": "TST Station 02" } as const;
type StationId = keyof typeof STATIONS;

const DAY = 86_400_000;
export const RETENTION_CLIP_DAYS = 90;

/** 00:00 hôm nay giờ Việt Nam (UTC+7, không có giờ mùa hè). */
export function startOfVnDay(daysAgo = 0): number {
  return Date.parse(`${vnDay()}T00:00:00+07:00`) - daysAgo * DAY;
}

const iso = (ms: number) => new Date(ms).toISOString();
const hex = (seed: number) => {
  let s = "";
  let x = seed * 2654435761;
  while (s.length < 64) {
    x = (x * 1103515245 + 12345) % 2 ** 31;
    s += x.toString(16).padStart(8, "0");
  }
  return s.slice(0, 64);
};

type SessionSeed = {
  station: StationId;
  status: SessionStatus;
  daysAgo: number;
  /** Phút kể từ 08:00 của ngày. */
  minute: number;
  durationS?: number;
  flags?: SessionFlag[];
  clips?: ClipStatus | null;
  held?: boolean;
};

type PackageSeed = {
  /** Phần sau `SPXTST` (vd. `0000043-1`); `tracking` ghi đè cả mã. */
  n: string;
  tracking?: string;
  /** Mã đơn sàn khi khác mặc định (đơn nhiều kiện). null → kiện không có đơn (kiện tạm). */
  orderSn?: string | null;
  placeholder?: boolean;
  status: WarehouseStatus;
  source?: "API" | "CSV";
  platform?: string | null;
  note?: string | null;
  items?: [string, string | null, number][];
  sessions?: SessionSeed[];
  unverified?: boolean;
};

const DEFAULT_ITEMS: [string, string | null, number][] = [["Áo thun basic", "Đen / L", 2]];

function seeds(): PackageSeed[] {
  const today = (minute: number, extra: Partial<SessionSeed> = {}): SessionSeed => ({
    station: "st-1",
    status: "COMPLETED",
    daysAgo: 0,
    minute,
    clips: "READY",
    ...extra,
  });
  const list: PackageSeed[] = [
    { n: "0000001", status: "PACKED", platform: "READY_TO_SHIP", sessions: [today(0)] },
    { n: "0000002", status: "PACKED", platform: "READY_TO_SHIP", sessions: [today(9)] },
    {
      n: "0000003",
      status: "PACKED",
      platform: "READY_TO_SHIP",
      sessions: [today(18, { flags: ["HAD_MISMATCH", "CLOSED_BY_SUPERVISOR"] })],
    },
    {
      n: "0000004",
      status: "PACKED",
      platform: "READY_TO_SHIP",
      sessions: [today(27, { clips: "PENDING" })],
    },
    { n: "0000005", status: "PACKED", platform: "READY_TO_SHIP", sessions: [today(36, { clips: "FAILED" })] },
    {
      n: "0000006",
      status: "PACKED",
      platform: "READY_TO_SHIP",
      sessions: [today(45, { flags: ["VIDEO_INCOMPLETE"], held: true })],
    },
    {
      n: "0000007",
      status: "CANCELLED_AFTER_PACK",
      platform: "CANCELLED",
      sessions: [{ station: "st-1", status: "COMPLETED", daysAgo: 1, minute: 120, clips: "READY" }],
    },
    {
      n: "0000008",
      status: "NEW",
      platform: "READY_TO_SHIP",
      sessions: [today(60, { status: "ABANDONED", durationS: 1800, clips: "READY" })],
    },
    { n: "0000009", status: "CANCELLED", platform: "CANCELLED" },
    {
      n: "0000010",
      status: "PACKED",
      platform: "READY_TO_SHIP",
      sessions: [
        { station: "st-1", status: "SUPERSEDED", daysAgo: 1, minute: 75, clips: "READY" },
        today(70, { station: "st-2", flags: ["CAM2_UNVERIFIED", "REPACK"] }),
      ],
    },
    {
      n: "0000011",
      status: "HANDED_OVER",
      platform: "SHIPPED",
      sessions: [{ station: "st-2", status: "COMPLETED", daysAgo: 2, minute: 30, clips: "READY" }],
    },
    {
      n: "0000012",
      status: "NEW",
      platform: "READY_TO_SHIP",
      note: null,
      items: [
        ["Áo thun basic", "Đen / L", 2],
        ["Tất cổ ngắn", "Trắng", 1],
        ["Túi vải", null, 1],
      ],
    },
    {
      n: "0000013",
      status: "NEW",
      platform: "READY_TO_SHIP",
      sessions: [today(80, { status: "CANCELLED", durationS: 40 })],
    },
    {
      n: "0000014",
      status: "DELIVERED",
      platform: "COMPLETED",
      sessions: [{ station: "st-1", status: "COMPLETED", daysAgo: 100, minute: 10, clips: "DELETED" }],
    },
    {
      n: "0000015",
      status: "PACKED",
      source: "CSV",
      platform: null,
      unverified: true,
      sessions: [today(90, { station: "st-2", flags: ["UNVERIFIED"] })],
    },
  ];
  for (let i = 16; i <= 30; i++)
    list.push({ n: String(i).padStart(7, "0"), status: "NEW", platform: "READY_TO_SHIP" });
  list.push(...returnSeeds());
  // Lịch sử: 6 kiện mỗi ngày trong 7 ngày trước, đã bàn giao / đã giao.
  for (let d = 1; d <= 7; d++) {
    for (let k = 0; k < 6; k++) {
      list.push({
        n: `1${String(d).padStart(2, "0")}${String(k).padStart(4, "0")}`,
        status: d > 3 ? "DELIVERED" : "HANDED_OVER",
        platform: d > 3 ? "COMPLETED" : "SHIPPED",
        sessions: [
          {
            station: k % 2 ? "st-2" : "st-1",
            status: "COMPLETED",
            daysAgo: d,
            minute: 20 * k,
            clips: "READY",
          },
        ],
      });
    }
  }
  return list;
}

/**
 * Kiện của dữ liệu hàng hoàn (04-test-cases §1 "Dữ liệu test", dải `SPXTST00000[4-5]x`) — trạng thái **sau khi** J-13 /
 * J-06 đã đồng bộ (mock không chạy job). Hồ sơ hàng hoàn, cảnh báo, hồ sơ khiếu nại ở `returnsDb.ts`.
 */
function returnSeeds(): PackageSeed[] {
  const packed = (daysAgo: number, minute = 30): SessionSeed => ({
    station: "st-1",
    status: "COMPLETED",
    daysAgo,
    minute,
    clips: "READY",
  });
  const two: [string, string | null, number][] = [
    ["Áo thun basic", "Đen / L", 1],
    ["Tất cổ ngắn", "Trắng", 1],
  ];
  return [
    { n: "0000041", status: "RETURN_EXPECTED", platform: "TO_RETURN", sessions: [packed(5)] },
    { n: "0000042", status: "RETURN_EXPECTED", platform: "SHIPPED", sessions: [packed(3, 40)] },
    {
      n: "0000043-1",
      orderSn: "2410TST00043",
      status: "RETURN_EXPECTED",
      platform: "TO_RETURN",
      items: two,
      sessions: [packed(4, 10)],
    },
    {
      n: "0000043-2",
      orderSn: "2410TST00043",
      status: "RETURN_EXPECTED",
      platform: "TO_RETURN",
      items: two,
      sessions: [packed(4, 12)],
    },
    { n: "0000044", status: "DELIVERED", platform: "COMPLETED", sessions: [packed(6)] },
    { n: "0000045", status: "RETURN_EXPECTED", platform: "TO_RETURN", sessions: [packed(6, 50)] },
    { n: "0000046", status: "HANDED_OVER", platform: "SHIPPED", sessions: [packed(2, 70)] },
    {
      n: "0000047-1",
      orderSn: "2410TST00047",
      status: "RETURN_EXPECTED",
      platform: "TO_RETURN",
      items: two,
      sessions: [packed(5, 20)],
    },
    {
      n: "0000047-2",
      orderSn: "2410TST00047",
      status: "RETURN_EXPECTED",
      platform: "TO_RETURN",
      items: two,
      sessions: [packed(5, 22)],
    },
    {
      n: "0000048-1",
      orderSn: "2410TST00048",
      status: "RETURN_EXPECTED",
      platform: "TO_RETURN",
      items: two,
      sessions: [packed(5, 24)],
    },
    {
      n: "0000048-2",
      orderSn: "2410TST00048",
      status: "RETURN_EXPECTED",
      platform: "TO_RETURN",
      items: two,
      sessions: [packed(5, 26)],
    },
    { n: "0000049", status: "RETURN_MISSING", platform: "TO_RETURN", sessions: [packed(12)] },
    // Đơn trước khi dùng hệ thống: không có phiên đóng gói (EX-R3, cờ NO_PACK_CLIP).
    { n: "0000050", status: "RETURN_EXPECTED", platform: "TO_RETURN" },
    { n: "0000051", status: "RETURN_EXPECTED", platform: "TO_RETURN", sessions: [packed(9)] },
    { n: "0000052", status: "PACKED", platform: "READY_TO_SHIP", sessions: [packed(1, 0)] },
    { n: "0000053", status: "RETURN_RECEIVED_ISSUE", platform: "TO_RETURN", sessions: [packed(8)] },
    { n: "0000054", status: "RETURN_RECEIVED_OK", platform: "SHIPPED", sessions: [packed(4, 90)] },
    { n: "0000055", status: "RETURN_INSPECTING", platform: "TO_RETURN", sessions: [packed(7)] },
    // BR-10: sàn đã giao ĐVVC, kho vẫn NEW (phiên bỏ dở hôm qua).
    {
      n: "0000056",
      status: "NEW",
      platform: "SHIPPED",
      sessions: [
        { station: "st-2", status: "ABANDONED", daysAgo: 1, minute: 200, durationS: 1800, clips: "READY" },
      ],
    },
    { n: "", tracking: "TAM-000001", orderSn: null, placeholder: true, status: "RETURN_RECEIVED_ISSUE" },
  ];
}

let clipSeq = 0;

function buildSession(pkgId: string, idx: number, s: SessionSeed): MockSession {
  const id = `ses-${pkgId.slice(4)}-${idx}`;
  const start = startOfVnDay(s.daysAgo) + (8 * 60 + s.minute) * 60_000;
  const duration = s.durationS ?? 120 + ((idx * 37 + s.minute) % 90);
  const ended = s.status === "OPEN" ? null : start + duration * 1000;
  const clips: MockClip[] = [];
  if (s.clips) {
    for (const role of ["CAM1", "CAM2"] as const) {
      clipSeq += 1;
      const retention = ended ? ended + RETENTION_CLIP_DAYS * DAY : null;
      clips.push({
        id: `clip-${id.slice(4)}-${role === "CAM1" ? 1 : 2}`,
        session_id: id,
        camera_role: role,
        status: s.clips,
        sha256: s.clips === "READY" || s.clips === "DELETED" ? hex(clipSeq) : null,
        duration_s: s.clips === "PENDING" || s.clips === "FAILED" ? null : duration + 10,
        held: Boolean(s.held),
        retention_until: s.held ? null : retention ? iso(retention) : null,
        deleted_at: s.clips === "DELETED" && retention ? iso(retention) : null,
        flags: [],
      });
    }
  }
  return {
    id,
    package_id: pkgId,
    station_id: s.station,
    station_name: STATIONS[s.station],
    status: s.status,
    started_at: iso(start),
    ended_at: ended ? iso(ended) : null,
    duration_s: ended ? duration : null,
    flags: s.flags ?? [],
    cancel_reason: s.status === "CANCELLED" ? "WRONG_SCAN" : null,
    note: null,
    clips,
  };
}

function buildPackage(seed: PackageSeed): MockPackage {
  const id = seed.tracking ? `pkg-${seed.tracking}` : `pkg-${seed.n}`;
  const sessions = (seed.sessions ?? []).map((s, i) => buildSession(id, i + 1, s));
  sessions.sort((a, b) => b.started_at.localeCompare(a.started_at));
  const first = sessions.at(-1);
  const created = first ? Date.parse(first.started_at) - 3 * 3600_000 : startOfVnDay(0) + 7 * 3600_000;
  const timeline: MockPackage["timeline"] = [];
  if (seed.platform)
    timeline.push({
      at: iso(created),
      source: "PLATFORM",
      from_status: null,
      to_status: "READY_TO_SHIP",
      actor: null,
    });
  for (const s of [...sessions].reverse()) {
    timeline.push({
      at: s.started_at,
      source: "WAREHOUSE",
      from_status: "NEW",
      to_status: "PACKING",
      actor: s.station_name,
    });
    if (s.ended_at && (s.status === "COMPLETED" || s.status === "SUPERSEDED"))
      timeline.push({
        at: s.ended_at,
        source: "WAREHOUSE",
        from_status: "PACKING",
        to_status: "PACKED",
        actor: s.station_name,
      });
    if (s.ended_at && (s.status === "CANCELLED" || s.status === "ABANDONED"))
      timeline.push({
        at: s.ended_at,
        source: "WAREHOUSE",
        from_status: "PACKING",
        to_status: "NEW",
        actor: s.station_name,
      });
  }
  const last = sessions[0]?.ended_at ? Date.parse(sessions[0].ended_at) : created;
  if (["HANDED_OVER", "DELIVERED", "CANCELLED_AFTER_PACK"].includes(seed.status)) {
    timeline.push({
      at: iso(last + 2 * 3600_000),
      source: "PLATFORM",
      from_status: null,
      to_status: seed.platform ?? "",
      actor: null,
    });
    timeline.push({
      at: iso(last + 2 * 3600_000 + 60_000),
      source: "WAREHOUSE",
      from_status: "PACKED",
      to_status: seed.status,
      actor: null,
    });
  }
  if (seed.status === "CANCELLED")
    timeline.push({
      at: iso(created + 3600_000),
      source: "PLATFORM",
      from_status: null,
      to_status: "CANCELLED",
      actor: null,
    });
  timeline.sort((a, b) => b.at.localeCompare(a.at));
  const nn = Number(seed.n) % 100000;
  const orderSn = seed.orderSn === undefined ? `2410TST${String(nn).padStart(5, "0")}` : seed.orderSn;
  return {
    id,
    tracking_number: seed.tracking ?? `SPXTST${seed.n}`,
    warehouse_status: seed.status,
    platform_logistics_status: null,
    verified: !seed.unverified,
    created_at: iso(created),
    ...(seed.placeholder ? { is_placeholder: true } : {}),
    order:
      orderSn === null
        ? null
        : {
            id: `ord-${orderSn}`,
            platform: "SHOPEE",
            platform_order_sn: orderSn,
            platform_status: seed.platform ?? null,
            buyer_note: seed.note !== undefined ? seed.note : nn % 5 === 0 ? "Gói kỹ giúp em" : null,
            source: seed.source ?? "API",
            items: (seed.items ?? DEFAULT_ITEMS).map(([product_name, variation, quantity]) => ({
              product_name,
              variation,
              quantity,
              image_url: null,
            })),
          },
    sessions,
    timeline,
  };
}

export const mockPackages: MockPackage[] = [];
export const mockExports = new Map<string, MockExport>();

export function resetMockPackages() {
  clipSeq = 0;
  mockPackages.splice(0, mockPackages.length, ...seeds().map(buildPackage));
  mockExports.clear();
}
resetMockPackages();

export const allSessions = () => mockPackages.flatMap((p) => p.sessions);
export const findClip = (clipId: string) =>
  allSessions()
    .flatMap((s) => s.clips)
    .find((c) => c.id === clipId) as MockClip | undefined;
export const findSession = (sessionId: string) => allSessions().find((s) => s.id === sessionId);

/** Hàng API-30 từ kiện mock. */
export function toListItem(p: MockPackage): PackageListItem {
  const last = p.sessions.find((s) => s.status === "COMPLETED") ?? p.sessions[0];
  return {
    id: p.id,
    tracking_number: p.tracking_number,
    platform_order_sn: p.order?.platform_order_sn ?? null,
    warehouse_status: p.warehouse_status,
    platform_status: p.order?.platform_status ?? null,
    source: p.order?.source ?? "API",
    last_session: last ? { station_name: last.station_name, ended_at: last.ended_at } : null,
    has_clip: p.sessions.some((s) => s.clips.some((c) => c.status === "READY")),
  };
}

/** Bỏ trường nội bộ trước khi trả API-31. */
export function toDetail(p: MockPackage): PackageDetail {
  const { created_at, ...rest } = p;
  void created_at;
  return {
    ...rest,
    sessions: p.sessions.map((s) => ({
      id: s.id,
      status: s.status,
      station_name: s.station_name,
      started_at: s.started_at,
      ended_at: s.ended_at,
      duration_s: s.duration_s,
      flags: s.flags,
      cancel_reason: s.cancel_reason,
      note: s.note,
      clips: s.clips.map((c) => ({
        id: c.id,
        camera_role: c.camera_role,
        status: c.status,
        sha256: c.sha256,
        duration_s: c.duration_s,
        held: c.held,
        retention_until: c.retention_until,
        deleted_at: c.deleted_at,
        flags: c.flags,
      })),
    })),
  };
}
