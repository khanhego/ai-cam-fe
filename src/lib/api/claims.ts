import type { EvidenceExclusion, Platform, WarehouseStatus, WrongScanCode } from "@/shared/labels";
import type { ReturnKind, Snapshot } from "@/shared/returns/types";

import { api } from "./client";
import type { CancelReason, ReturnSessionReview, ShopRef } from "./packages";
import type { ShareBrief, ShareUnavailableReason } from "./shares";
import type { SessionFlag } from "./station";
import type { Page } from "./stations";

/** API-130..138 (02 §6.2) — hồ sơ khiếu nại (D16, D17) + gói bằng chứng. */
export type ClaimType =
  "DAMAGED" | "MISSING_ITEM" | "WRONG_ITEM" | "EMPTY_BOX" | "OTHER" | "BUYER_CLAIM" | "LOST_IN_TRANSIT";
export type ClaimStatus = "NEW" | "SUBMITTED" | "WAITING" | "WON" | "LOST" | "CLOSED";
export const CLAIM_STATUSES: readonly ClaimStatus[] = [
  "NEW",
  "SUBMITTED",
  "WAITING",
  "WON",
  "LOST",
  "CLOSED",
] as const;
export type Counterparty = "PLATFORM" | "CARRIER";
export type ClaimSource = "AUTO_RETURN" | "MANUAL" | "RECON" | "LEGACY_HOLD";
export type UserBrief = { id: string; display_name: string };

export type ClaimListItem = {
  id: string;
  code: string;
  type: ClaimType;
  counterparty: Counterparty;
  status: ClaimStatus;
  source: ClaimSource;
  package: { id: string; tracking_number: string };
  order: { platform_order_sn: string } | null;
  owner: UserBrief | null;
  deadline_at: string | null;
  due_soon: boolean;
  overdue: boolean;
  created_at: string;
  /** item 03 (02 §6.2 API-130 mở rộng). */
  platform: Platform | null;
  shop: ShopRef | null;
};

export type ClaimFilters = {
  status?: ClaimStatus;
  type?: ClaimType;
  counterparty?: Counterparty;
  /** `me` hoặc id người dùng. */
  owner?: string;
  due?: "soon" | "overdue";
  q?: string;
  /** item 03. */
  platform?: string;
  shop_id?: string;
  page?: number;
  page_size?: number;
};

export type ClaimList = Page<ClaimListItem> & { status_counts: Record<ClaimStatus, number> };

export type EvidenceClip = {
  id: string;
  camera_role: "CAM1" | "CAM2";
  status: string;
  sha256: string | null;
  deleted_at: string | null;
};

/** Phiên trong bằng chứng; item 03 thêm `cancel_reason` + trường BR-39 (`ReturnSessionReview`, chỉ đọc). */
export type EvidenceSession = {
  id: string;
  type: "PACK" | "RETURN";
  status: string;
  station_name: string;
  operator_name: string | null;
  started_at: string;
  ended_at: string | null;
  flags: SessionFlag[];
  clips: EvidenceClip[];
  cancel_reason: CancelReason | null;
} & ReturnSessionReview;

/** item 03 (02 §6.2 API-132): cờ phiên mở hoàn trước / phiên chính (server tính — FE không tự tính, DEC-511). */
type EvidenceExtras = {
  prior_return: boolean;
  primary: boolean;
  /** Ngày Dialog bỏ bằng chứng hiển thị (FR-08.09). */
  removal_keep_until: string | null;
};

export type ClaimEvidence =
  | ({ id: string; kind: "SESSION"; auto: boolean; session: EvidenceSession } & EvidenceExtras)
  | ({ id: string; kind: "SNAPSHOT"; auto: boolean; snapshot: EvidenceSnapshot } & EvidenceExtras);

/** item 03 (BR-38): bằng chứng đã bỏ mềm. */
export type RemovedEvidence = ClaimEvidence & {
  removed: { at: string; by: UserBrief | null; reason: string; keep_until: string | null };
};

/** item 03 (BR-39 v0.4): phiên mở hoàn bị loại khỏi bằng chứng tự chọn (gồm phiên đã đánh dấu quét nhầm). */
export type ExcludedReturnSession = {
  session_id: string;
  status: string;
  cancel_reason: CancelReason | null;
  cancel_cause: ReturnSessionReview["cancel_cause"];
  evidence_exclusion: EvidenceExclusion;
  wrong_scan: ReturnSessionReview["wrong_scan"];
  started_at: string;
  has_clip: boolean;
  in_evidence: boolean;
};

/** Ảnh bằng chứng (BE `EvidenceSnapshot`): `url` null khi ảnh đã bị xóa (`status = DELETED` — DEC-312 e). */
export type EvidenceSnapshot = Omit<Snapshot, "url"> & { url: string | null };

export type ClaimNote = {
  id: string;
  kind: "NOTE" | "STATUS_CHANGE" | "SYSTEM";
  text: string;
  author: UserBrief | null;
  at: string;
};

export type ClaimMissing = "NO_PACK_CLIP" | "PACK_CLIP_DELETED" | "RETURN_CLIP_PENDING";

/** item 03: `DEFAULT_PLATFORM_PASSED` = hạn sàn đã qua lúc tạo → dùng hạn mặc định (BR-42). */
export type DeadlineSource = "PLATFORM" | "DEFAULT" | "MANUAL" | "DEFAULT_PLATFORM_PASSED";

export type ClaimDetail = {
  id: string;
  code: string;
  type: ClaimType;
  counterparty: Counterparty;
  status: ClaimStatus;
  source: ClaimSource;
  version: number;
  package: { id: string; tracking_number: string; warehouse_status: WarehouseStatus };
  order: { id: string; platform_order_sn: string } | null;
  return_case: { id: string; code: string; kind: ReturnKind; return_tracking_number: string | null } | null;
  owner: UserBrief | null;
  deadline_at: string | null;
  deadline_source: DeadlineSource | null;
  platform_claim_ref: string | null;
  recovered_amount: number | null;
  close_reason: string | null;
  created_at: string;
  closed_at: string | null;
  evidence: ClaimEvidence[];
  other_sessions: { id: string; type: "PACK" | "RETURN"; status: string; started_at: string }[];
  missing: ClaimMissing[];
  notes: ClaimNote[];
  allowed_transitions: ClaimStatus[];
  // ---- item 03 (02 §6.2 "API-131 / API-132 / API-134 mở rộng") ----
  submitted_at: string | null;
  result_at: string | null;
  prior_return_sessions: { session_id: string; status: string; started_at: string }[];
  excluded_return_sessions: ExcludedReturnSession[];
  /** v0.3: phiên "Cần soát" (Supervisor hủy trước Phase 3, chưa rõ lý do). */
  review_sessions: { session_id: string; status: string; started_at: string; in_evidence: boolean }[];
  removed_evidence: RemovedEvidence[];
  shares: ShareBrief[];
  shares_active_count: number;
  /**
   * G3-EV-4 (02 §6.2 API-132 bổ sung): Cam 1 của phiên chính không `READY` → D17 hiện Alert. Server cũ chưa trả → coi
   * như `false`.
   */
  primary_unavailable?: boolean;
  primary_unavailable_reason?: ShareUnavailableReason | null;
};

/** item 03 (v0.3 / v0.4): API-189 — đánh dấu / bỏ đánh dấu quét nhầm, xác nhận phiên hoàn thật. */
export type ReturnSessionReviewAction = "MARK_WRONG_SCAN" | "UNMARK_WRONG_SCAN" | "CONFIRM_RETURN";
export type ReturnSessionReviewBody = {
  version: number;
  action: ReturnSessionReviewAction;
  /** Bắt buộc khi `MARK_WRONG_SCAN`. */
  reason_code?: WrongScanCode | null;
  note: string;
};
/** Link `CREATING` / `ACTIVE` chứa phiên vừa đánh dấu (không tự thu hồi — DEC-531). */
export type AffectedShare = {
  id: string;
  recipient: string;
  status: "CREATING" | "ACTIVE";
  expires_at: string;
  created_by: UserBrief | null;
  can_revoke: boolean;
};

export type CreateClaimBody = {
  package_id: string;
  type: ClaimType;
  counterparty: Counterparty;
  note?: string | null;
  return_case_id?: string | null;
  recon_alert_id?: string | null;
};

/** API-133: gửi `version`; trường không đổi để null / bỏ. */
export type ClaimPatch = {
  version: number;
  status?: ClaimStatus;
  platform_claim_ref?: string | null;
  owner_user_id?: string | null;
  deadline_at?: string | null;
  recovered_amount?: number | null;
  reason?: string | null;
};

export type EvidencePackStatus = "QUEUED" | "RUNNING" | "READY" | "FAILED";
export type EvidencePack = {
  id: string;
  claim_id?: string;
  status: EvidencePackStatus;
  progress: number;
  sha256?: string | null;
  size_bytes?: number | null;
  /** `reason`: CLIP_DELETED / CLIP_MISSING / CLIP_NOT_READY / CLIP_FAILED / CLIP_FILE_MISSING / CLIP_CHECKSUM_MISMATCH /
   * SNAPSHOT_DELETED (+ `snapshot_id`) — DEC-315 b. */
  missing?: {
    session_id: string;
    camera_role: "CAM1" | "CAM2";
    reason: string;
    snapshot_id?: string | null;
  }[];
  files?: { zip: string } | null;
  expires_at?: string | null;
};

export const claimsApi = {
  list: (filters: ClaimFilters) => api.get<ClaimList>("/claims", { query: filters }),
  /** API-131: 409 CLAIM_EXISTS (`details.claim_id`, `code`). */
  create: (body: CreateClaimBody) => api.post<ClaimDetail>("/claims", body),
  get: (id: string) => api.get<ClaimDetail>(`/claims/${id}`),
  /** 409 VERSION_CONFLICT (`details.current`), INVALID_TRANSITION, CLAIM_CLOSED. */
  patch: (id: string, body: ClaimPatch) => api.patch<ClaimDetail>(`/claims/${id}`, body),
  /** API-134: bỏ bằng chứng tự chọn → `note` 5–500 bắt buộc (02 §6.3 #10). */
  setEvidence: (
    id: string,
    body: { version: number; session_ids: string[]; snapshot_ids: string[]; note?: string | null },
  ) => api.put<ClaimDetail>(`/claims/${id}/evidence`, body),
  /**
   * API-189 → API-132 của hồ sơ + `affected_shares` (khác [] chỉ khi `MARK_WRONG_SCAN`). 422 `fields.reason_code` /
   * `fields.note`; 409 VERSION_CONFLICT / CLAIM_CLOSED / SESSION_NOT_ELIGIBLE; 403 (CSKH gỡ lý do hủy).
   */
  reviewReturnSession: (id: string, sessionId: string, body: ReturnSessionReviewBody) =>
    api.post<ClaimDetail & { affected_shares: AffectedShare[] }>(
      `/claims/${id}/return-sessions/${sessionId}/review`,
      body,
    ),
  addNote: (id: string, text: string) => api.post<ClaimNote>(`/claims/${id}/notes`, { text }),
  /** API-136: 202; 409 PACK_IN_PROGRESS (`details.pack_id`, có thể null) / NO_EVIDENCE. */
  createPack: (id: string) => api.post<EvidencePack>(`/claims/${id}/evidence-packs`),
  getPack: (packId: string) => api.get<EvidencePack>(`/evidence-packs/${packId}`),
};
