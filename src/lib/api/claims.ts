import type { WarehouseStatus } from "@/shared/labels";
import type { ReturnKind, Snapshot } from "@/shared/returns/types";

import { api } from "./client";
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
};

export type ClaimFilters = {
  status?: ClaimStatus;
  type?: ClaimType;
  counterparty?: Counterparty;
  /** `me` hoặc id người dùng. */
  owner?: string;
  due?: "soon" | "overdue";
  q?: string;
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

export type ClaimEvidence =
  | {
      id: string;
      kind: "SESSION";
      auto: boolean;
      session: {
        id: string;
        type: "PACK" | "RETURN";
        status: string;
        station_name: string;
        operator_name: string | null;
        started_at: string;
        ended_at: string | null;
        flags: SessionFlag[];
        clips: EvidenceClip[];
      };
    }
  | { id: string; kind: "SNAPSHOT"; auto: boolean; snapshot: Snapshot };

export type ClaimNote = {
  id: string;
  kind: "NOTE" | "STATUS_CHANGE" | "SYSTEM";
  text: string;
  author: UserBrief | null;
  at: string;
};

export type ClaimMissing = "NO_PACK_CLIP" | "PACK_CLIP_DELETED" | "RETURN_CLIP_PENDING";

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
  deadline_source: "PLATFORM" | "DEFAULT" | "MANUAL";
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
  missing?: { session_id: string; camera_role: "CAM1" | "CAM2"; reason: string }[];
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
  addNote: (id: string, text: string) => api.post<ClaimNote>(`/claims/${id}/notes`, { text }),
  /** API-136: 202; 409 PACK_IN_PROGRESS (`details.pack_id`) / NO_EVIDENCE. */
  createPack: (id: string) => api.post<EvidencePack>(`/claims/${id}/evidence-packs`),
  getPack: (packId: string) => api.get<EvidencePack>(`/evidence-packs/${packId}`),
};
