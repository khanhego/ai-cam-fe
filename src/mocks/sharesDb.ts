import type { AffectedShare, ClaimEvidence } from "@/lib/api/claims";
import type { Role } from "@/lib/api/session";
import type { Share, ShareBrief, ShareListStatus, ShareOptionSession, ShareOptions } from "@/lib/api/shares";

import {
  findPackage,
  findSessionAnywhere,
  mockClaims,
  P3_CLAIM_ID,
  sessionReview,
  toClaimDetail,
  type MockClaim,
} from "./returnsDb";
import type { MockPackage, MockSession } from "./packagesDb";
import { mockFlag, mockParam } from "./shopsDb";
import { shopOfPackage } from "./packagesDb";

/**
 * Link chia sẻ giả (02b-admin §12, 02 §6.2 API-160..164): `CREATING` → `ACTIVE` sau 3 lần đọc API-162 (handler phát WS
 * `share.updated` mỗi bước); `?fail=upload` ở trang → `FAILED UPLOAD_FAILED`; `?cloud=0` → kho lưu chưa cấu hình.
 * T-257: thu hồi → `revoke_pending` tới khi "xóa xong trên cloud" (≥ 2 giây sau, lúc đọc); `?cloudOffline=1` → giữ
 * `revoke_pending` (EX-S7 — "Đang thu hồi — chờ Internet"); link `share-4` của Supervisor (CSKH không thu hồi được).
 */
export type MockShare = Omit<Share, "can_revoke" | "items"> & {
  session_ids: string[];
  /** Số lần đọc còn lại trước khi xong. */
  ticks: number;
  fail: boolean;
};

export const SHARE_TICKS = 3;
export const mockShares: MockShare[] = [];
export const mockCloud = { configured: true, failUpload: false, offline: false };
/** Thu hồi xong trên cloud sau bao lâu (mock J-25). */
export const REVOKE_SETTLE_MS = 2000;

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
let shareSeq = 0;

const signedUrl = (id: string, expires: string) =>
  `https://s3.example.vn/aicam-share/share/${id}/index.html?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${Math.round(
    (Date.parse(expires) - Date.now()) / 1000,
  )}&X-Amz-Signature=mock${id}`;

const hex = (seed: string) => {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h.toString(16).padStart(8, "0").repeat(8).slice(0, 64);
};

function sourceOf(claim: MockClaim | null, pkg: MockPackage) {
  return {
    type: claim ? ("CLAIM" as const) : ("SESSION" as const),
    claim_id: claim?.id ?? null,
    claim_code: claim?.code ?? null,
    package_id: pkg.id,
    tracking_number: pkg.tracking_number,
  };
}

export function resetMockShares() {
  shareSeq = 0;
  Object.assign(mockCloud, {
    configured: mockParam("cloud") !== "0",
    failUpload: mockParam("fail") === "upload",
    offline: mockParam("cloudOffline") === "1",
  });
  mockShares.splice(0, mockShares.length);
  const claim = mockClaims.find((c) => c.status !== "CLOSED" && c.evidence.some((e) => e.kind === "SESSION"));
  const pkg = claim ? findPackage(claim.package_id) : undefined;
  if (!claim || !pkg) return;
  const sessions = claim.evidence.filter((e) => e.kind === "SESSION").map((e) => e.ref_id);
  const now = Date.now();
  const base = {
    source: sourceOf(claim, pkg),
    session_ids: sessions,
    session_count: sessions.length,
    layout: "SIDE_BY_SIDE" as const,
    include_snapshots: true,
    progress: 100,
    step: null,
    step_index: null,
    step_total: null,
    revoked_at: null,
    revoked_by: null,
    revoke_pending: false,
    error: null,
    ticks: 0,
    fail: false,
  };
  const active = iso(now + 5 * DAY);
  /** Còn < 24 giờ → cột hết hạn đỏ ở D21. */
  const soon = iso(now + 20 * 3_600_000);
  mockShares.push(
    {
      ...base,
      id: "share-1",
      status: "ACTIVE",
      url: signedUrl("share-1", active),
      recipient: "CSKH Shopee – phiếu 98765",
      expires_at: active,
      created_at: iso(now - 2 * DAY),
      created_by: { id: "u-cskh", display_name: "Lan" },
    },
    {
      ...base,
      id: "share-4",
      status: "ACTIVE",
      url: signedUrl("share-4", soon),
      recipient: "Bưu cục Thủ Đức – khiếu nại 5521",
      session_count: 1,
      session_ids: sessions.slice(0, 1),
      expires_at: soon,
      created_at: iso(now - 6 * DAY + 3_600_000),
      created_by: { id: "u-sup", display_name: "Nguyễn B" },
    },
    {
      ...base,
      id: "share-2",
      status: "REVOKED",
      url: null,
      recipient: "Bưu cục Quận 7",
      expires_at: iso(now + 2 * DAY),
      created_at: iso(now - 5 * DAY),
      created_by: { id: "u-sup", display_name: "Nguyễn B" },
      revoked_at: iso(now - 4 * DAY),
      revoked_by: { id: "u-sup", display_name: "Nguyễn B" },
    },
    {
      ...base,
      id: "share-3",
      status: "EXPIRED",
      url: null,
      recipient: "CSKH Shopee – phiếu 11223",
      expires_at: iso(now - DAY),
      created_at: iso(now - 8 * DAY),
      created_by: { id: "u-cskh", display_name: "Lan" },
    },
  );
  seedP3Shares(now);
}

/**
 * T-266 (DEC-722): 2 link đang hoạt động của KN-000141 chứa phiên A (bỏ dở 08:51 — "Đánh dấu quét nhầm" được) → API-189
 * trả `affected_shares` (1 link CSKH Lan tạo, 1 link Supervisor tạo — CSKH không thu hồi được).
 */
function seedP3Shares(now: number) {
  const claim = mockClaims.find((c) => c.id === P3_CLAIM_ID);
  const pkg = claim ? findPackage(claim.package_id) : undefined;
  if (!claim || !pkg) return;
  const sessions = claim.evidence.filter((e) => e.kind === "SESSION").map((e) => e.ref_id);
  const prior = sessions.find((id) => findSessionAnywhere(id)?.session.status === "ABANDONED");
  if (!prior) return;
  const expires = iso(now + 6 * DAY);
  const share = (
    id: string,
    recipient: string,
    ids: string[],
    by: { id: string; display_name: string },
    ago: number,
  ): MockShare => ({
    id,
    status: "ACTIVE",
    progress: 100,
    step: null,
    step_index: null,
    step_total: null,
    url: signedUrl(id, expires),
    recipient,
    source: sourceOf(claim, pkg),
    session_ids: ids,
    session_count: ids.length,
    layout: "SIDE_BY_SIDE",
    include_snapshots: true,
    expires_at: expires,
    created_at: iso(now - ago),
    created_by: by,
    revoked_at: null,
    revoked_by: null,
    revoke_pending: false,
    error: null,
    ticks: 0,
    fail: false,
  });
  mockShares.push(
    share(
      "share-p3-1",
      "CSKH Shopee – phiếu 55001",
      sessions.slice(0, 4),
      { id: "u-cskh", display_name: "Lan" },
      3_600_000,
    ),
    share(
      "share-p3-2",
      "ĐVVC SPX – khiếu nại 7788",
      [prior],
      { id: "u-sup", display_name: "Nguyễn B" },
      7_200_000,
    ),
  );
}

/** Hết hạn tính lúc đọc (J-25 của BE). */
export function refreshShare(s: MockShare, now = Date.now()) {
  if ((s.status === "ACTIVE" || s.status === "CREATING") && Date.parse(s.expires_at) <= now) {
    s.status = "EXPIRED";
    s.url = null;
  }
  if (
    s.revoke_pending &&
    !mockCloud.offline &&
    s.revoked_at &&
    now - Date.parse(s.revoked_at) >= REVOKE_SETTLE_MS
  )
    s.revoke_pending = false;
  return s;
}

/** Một bước dựng mỗi lần đọc API-162: `RENDERING` từng phiên → `UPLOADING` → `ACTIVE` (hoặc `FAILED` khi tải lên lỗi). */
export function tickShare(s: MockShare) {
  if (s.status !== "CREATING") return false;
  s.ticks -= 1;
  const total = s.session_ids.length;
  if (s.ticks <= 0) {
    if (s.fail) {
      Object.assign(s, {
        status: "FAILED",
        step: null,
        step_index: null,
        step_total: null,
        error: {
          code: "UPLOAD_FAILED",
          message: "Không tải được lên kho lưu cloud. Kiểm tra Internet rồi bấm Thử lại.",
        },
      });
    } else {
      Object.assign(s, {
        status: "ACTIVE",
        progress: 100,
        step: null,
        step_index: null,
        step_total: null,
        url: signedUrl(s.id, s.expires_at),
      });
    }
    return true;
  }
  const done = SHARE_TICKS - s.ticks;
  s.progress = Math.round((done / SHARE_TICKS) * 100);
  s.step = s.ticks === 1 ? "UPLOADING" : "RENDERING";
  s.step_index = s.step === "RENDERING" ? Math.min(total, done + 1) : null;
  s.step_total = s.step === "RENDERING" ? total : null;
  return true;
}

export function canRevoke(s: MockShare, user: { id: string; role: Role }) {
  return (
    (s.status === "CREATING" || s.status === "ACTIVE") &&
    (user.role === "ADMIN" || user.role === "SUPERVISOR" || s.created_by?.id === user.id)
  );
}

export function toShare(s: MockShare, user: { id: string; role: Role }, withItems = false): Share {
  refreshShare(s);
  const { session_ids, ticks, fail, ...rest } = s;
  void ticks;
  void fail;
  const share: Share = { ...rest, url: s.status === "ACTIVE" ? s.url : null, can_revoke: canRevoke(s, user) };
  if (withItems)
    share.items = session_ids.map((id, i) => ({
      session_id: id,
      order: i + 1,
      video_sha256: hex(`${s.id}-${id}`),
      size_bytes: 38_000_000,
      source_sha256: { CAM1: hex(`${id}-1`), CAM2: hex(`${id}-2`) },
      snapshot_count: s.include_snapshots && i === 0 ? 2 : 0,
    }));
  return share;
}

/** `shares[]` của API-31 / API-132: ≤ 3 link mới nhất (trừ `FAILED`) + số link đang hoạt động. */
export function sharesFor(
  match: (s: MockShare) => boolean,
  user: { id: string; role: Role },
): { shares: ShareBrief[]; shares_active_count: number } {
  const list = mockShares
    .map((s) => refreshShare(s))
    .filter((s) => match(s) && s.status !== "FAILED")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return {
    shares: list.slice(0, 3).map((s) => {
      const {
        id,
        status,
        recipient,
        expires_at,
        session_count,
        url,
        can_revoke,
        revoke_pending,
        created_at,
      } = toShare(s, user);
      return {
        id,
        status,
        recipient,
        expires_at,
        session_count,
        url,
        can_revoke,
        revoke_pending,
        created_at,
      };
    }),
    shares_active_count: list.filter((s) => s.status === "ACTIVE" || s.status === "CREATING").length,
  };
}

export const sharesOfPackage = (pkg: MockPackage, user: { id: string; role: Role }) => {
  const ids = new Set(pkg.sessions.map((s) => s.id));
  return sharesFor((s) => s.source.package_id === pkg.id || s.session_ids.some((x) => ids.has(x)), user);
};
export const sharesOfClaim = (claimId: string, user: { id: string; role: Role }) =>
  sharesFor((s) => s.source.claim_id === claimId, user);

/** API-189 `affected_shares` (02 §6.2 v0.4 — DEC-531). */
export function affectedShares(sessionId: string, user: { id: string; role: Role }): AffectedShare[] {
  return mockShares
    .map((s) => refreshShare(s))
    .filter((s) => (s.status === "ACTIVE" || s.status === "CREATING") && s.session_ids.includes(sessionId))
    .map((s) => ({
      id: s.id,
      recipient: s.recipient,
      status: s.status as "ACTIVE" | "CREATING",
      expires_at: s.expires_at,
      created_by: s.created_by,
      can_revoke: canRevoke(s, user),
    }));
}

export function inListStatus(s: MockShare, status: ShareListStatus) {
  if (status === "ALL") return true;
  if (status === "ACTIVE") return s.status === "ACTIVE" || s.status === "CREATING";
  return s.status === status;
}

// ───────────────────────── API-164 ─────────────────────────

const UNAVAILABLE: Record<string, ShareOptionSession["unavailable_reason"]> = {
  PENDING: "CLIP_PENDING",
  FAILED: "CLIP_FAILED",
  DELETED: "CLIP_DELETED",
  MISSING: "CLIP_MISSING",
};

function optionOf(
  s: MockSession,
  inEvidence?: Set<string>,
): Omit<
  ShareOptionSession,
  "primary" | "default_selected" | "prior_return" | "excluded" | "evidence_exclusion"
> {
  const cam1 = s.clips.find((c) => c.camera_role === "CAM1");
  const selectable = cam1?.status === "READY";
  return {
    id: s.id,
    type: s.type ?? "PACK",
    status: s.status,
    started_at: s.started_at,
    ended_at: s.ended_at,
    station_name: s.station_name,
    operator_name: s.operator_name ?? null,
    conclusion: s.inspection?.conclusion ?? null,
    duration_s: s.duration_s ?? 0,
    selectable,
    unavailable_reason: selectable ? null : (UNAVAILABLE[cam1?.status ?? "PENDING"] ?? "CLIP_PENDING"),
    unavailable_at: !selectable && cam1?.status === "DELETED" ? cam1.deleted_at : null,
    cameras: s.clips.filter((c) => c.status === "READY").map((c) => c.camera_role),
    review_needed: false,
    // M16 (02 §6.2 API-164 — BE DEC-667): ảnh `READY` của phiên trong bằng chứng (nguồn SESSION: mọi ảnh của phiên).
    snapshot_count: (s.snapshots ?? []).filter(
      (x) => x.status !== "MISSING" && x.status !== "DELETED" && (!inEvidence || inEvidence.has(x.id)),
    ).length,
  };
}

/** Nguồn `CLAIM`: phiên trong `evidence[]` (phiên chính trước, rồi theo `started_at`); `SESSION`: đúng phiên đó. */
export function shareOptions(q: {
  claim_id?: string | null;
  session_id?: string | null;
}): ShareOptions | null {
  let claim: MockClaim | null = null;
  let sessions: MockSession[] = [];
  let pkg: MockPackage | undefined;
  if (q.claim_id) {
    claim = mockClaims.find((c) => c.id === q.claim_id) ?? null;
    if (!claim) return null;
    pkg = findPackage(claim.package_id);
    sessions = claim.evidence
      .filter((e) => e.kind === "SESSION")
      .map((e) => findSessionAnywhere(e.ref_id)?.session)
      .filter((s): s is MockSession => Boolean(s));
  } else if (q.session_id) {
    const found = findSessionAnywhere(q.session_id);
    if (!found) return null;
    pkg = found.pkg;
    sessions = [found.session];
  }
  if (!pkg) return null;
  // item 03 (T-256): nguồn CLAIM lấy phiên chính / phiên trước / "Cần soát" theo API-132 của hồ sơ (một luật với D17).
  const detail = claim ? toClaimDetail(claim) : null;
  const evOf = (id: string) =>
    detail?.evidence.find((e) => e.kind === "SESSION" && e.session.id === id) as
      Extract<ClaimEvidence, { kind: "SESSION" }> | undefined;
  const snapIds = claim
    ? new Set(claim.evidence.filter((e) => e.kind === "SNAPSHOT").map((e) => e.ref_id))
    : undefined;
  const opts = sessions.map((s) => ({
    ...optionOf(s, snapIds),
    review_needed: claim ? Boolean(evOf(s.id)?.session.review_needed) : sessionReview(s).review_needed,
    // BR-39: phiên bị loại nhưng có trong bằng chứng do thêm tay (M16 — BE DEC-667) → không chọn sẵn. G3V-2 (BE DEC-933):
    // nguồn phiên cũng vậy — phiên bị loại / "Cần soát" không chọn sẵn (API-160 sẽ 409 SESSION_EXCLUDED).
    excluded: claim
      ? Boolean(evOf(s.id)?.session.evidence_exclusion)
      : Boolean(sessionReview(s).evidence_exclusion),
    // G3-EV-4 (BE `OptionSession.evidence_exclusion`) — G3V-3: ShareLinkDialog đọc thẳng.
    evidence_exclusion: claim
      ? (evOf(s.id)?.session.evidence_exclusion ?? null)
      : sessionReview(s).evidence_exclusion,
  }));
  const returns = opts
    .filter((o) => o.type === "RETURN" && o.selectable && !o.review_needed)
    .sort((a, b) => a.started_at.localeCompare(b.started_at));
  const primaryId = detail
    ? ((
        detail.evidence.find((e) => e.kind === "SESSION" && e.primary) as
          { session?: { id: string } } | undefined
      )?.session?.id ?? null)
    : (returns[0]?.id ?? opts.find((o) => o.type === "PACK")?.id ?? null);
  const ordered = [...opts].sort(
    (a, b) =>
      Number(b.id === primaryId) - Number(a.id === primaryId) || a.started_at.localeCompare(b.started_at),
  );
  let picked = 0;
  const shop = shopOfPackage(pkg);
  // G3-EV-4 (02 §6.2 API-164 bổ sung): Cam 1 phiên chính không READY.
  const primaryOpt = opts.find((o) => o.id === primaryId);
  const snapshotCount = claim
    ? claim.evidence.filter((e) => e.kind === "SNAPSHOT").length
    : sessions.reduce((n, s) => n + (s.snapshots ?? []).filter((x) => x.status !== "MISSING").length, 0);
  return {
    storage_configured: mockCloud.configured,
    source: { ...sourceOf(claim, pkg), platform: shop?.platform ?? null, shop_name: shop?.name ?? null },
    sessions: ordered.map((o) => {
      const selected = o.selectable && !o.review_needed && !o.excluded && (claim ? picked < 4 : true);
      if (selected) picked += 1;
      return {
        ...o,
        primary: o.id === primaryId,
        prior_return: Boolean(evOf(o.id)?.prior_return),
        default_selected: selected,
      };
    }),
    snapshot_count: Math.min(20, snapshotCount),
    review_pending_count: detail ? detail.review_sessions.length : 0,
    limits: { max_sessions: 4, max_total_seconds: 1800, max_snapshots: 20 },
    default_expires_days: 7,
    primary_unavailable: Boolean(primaryOpt && !primaryOpt.selectable),
    primary_unavailable_reason: primaryOpt && !primaryOpt.selectable ? primaryOpt.unavailable_reason : null,
  };
}

export function createShare(
  body: {
    claim_id: string | null;
    session_id: string | null;
    session_ids: string[];
    layout: "SIDE_BY_SIDE" | "CAM1";
    include_snapshots: boolean;
    recipient: string;
    expires_days: number;
  },
  user: { id: string; display_name: string },
  pkg: MockPackage,
  claim: MockClaim | null,
): MockShare {
  shareSeq += 1;
  const now = Date.now();
  const share: MockShare = {
    id: `share-new-${now.toString(36)}-${shareSeq}`,
    status: "CREATING",
    progress: 0,
    step: "RENDERING",
    step_index: 1,
    step_total: body.session_ids.length,
    url: null,
    recipient: body.recipient.trim(),
    source: sourceOf(claim, pkg),
    session_count: body.session_ids.length,
    layout: body.layout,
    include_snapshots: body.include_snapshots,
    expires_at: iso(now + body.expires_days * DAY),
    created_at: iso(now),
    created_by: { id: user.id, display_name: user.display_name },
    revoked_at: null,
    revoked_by: null,
    revoke_pending: false,
    error: null,
    session_ids: body.session_ids,
    ticks: SHARE_TICKS,
    fail: mockCloud.failUpload || mockFlag("shareFail"),
  };
  mockShares.unshift(share);
  return share;
}

resetMockShares();
