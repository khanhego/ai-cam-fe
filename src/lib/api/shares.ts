import type { Platform, ShareLayout, ShareStatus } from "@/shared/labels";

import { api } from "./client";
import type { Page } from "./stations";

/** API-160..164 (02 §6.2) — link chia sẻ bằng chứng (D21, ShareLinkDialog, khối Link ở D4 / D17). */
export type ShareSourceType = "CLAIM" | "SESSION";

export type ShareSource = {
  type: ShareSourceType;
  claim_id: string | null;
  claim_code: string | null;
  package_id: string;
  tracking_number: string;
};

/** `step` khi `CREATING`: dựng (`step_index` / `step_total` = phiên đang dựng / tổng) → tải lên → công bố. */
export type ShareStep = "RENDERING" | "UPLOADING" | "PUBLISHING";
export type ShareErrorCode = "RENDER_FAILED" | "UPLOAD_FAILED" | "TIMEOUT";

export type ShareItem = {
  session_id: string;
  order: number;
  video_sha256: string;
  size_bytes: number;
  source_sha256: { CAM1?: string; CAM2?: string };
  snapshot_count: number;
};

/** Item API-161 (không có `items[]` con) và API-162 (có `items[]`). `url` chỉ khi `ACTIVE`. */
export type Share = {
  id: string;
  status: ShareStatus;
  progress: number;
  step: ShareStep | null;
  step_index: number | null;
  step_total: number | null;
  url: string | null;
  recipient: string;
  source: ShareSource;
  session_count: number;
  layout: ShareLayout;
  include_snapshots: boolean;
  expires_at: string;
  created_at: string;
  created_by: { id: string; display_name: string } | null;
  revoked_at: string | null;
  revoked_by: { id: string; display_name: string } | null;
  /** Thu hồi xong trên DB nhưng còn đối tượng trên cloud (kho mất Internet — DEC-442). */
  revoke_pending: boolean;
  error: { code: ShareErrorCode; message: string } | null;
  items?: ShareItem[];
  /** `CREATING` / `ACTIVE` và (ADMIN, SUPERVISOR hoặc người tạo). */
  can_revoke: boolean;
};

/**
 * `shares[]` ở API-31 / API-132: ≤ 3 link mới nhất (trừ `FAILED`). M16 (02 §6.2 API-31 — BE DEC-666 / 678, FE DEC-702)
 * thêm `revoke_pending` (EX-S7 "Đang thu hồi — chờ Internet" ở D4 / D17) và `created_at` (T-262 — DEC-800).
 */
export type ShareBrief = Pick<
  Share,
  | "id"
  | "status"
  | "recipient"
  | "expires_at"
  | "session_count"
  | "url"
  | "can_revoke"
  | "revoke_pending"
  | "created_at"
>;

/** Tab D21: `ACTIVE` gồm `CREATING`; `ALL` gồm `FAILED`. */
export type ShareListStatus = "ACTIVE" | "REVOKED" | "EXPIRED" | "ALL";
export const SHARE_LIST_STATUSES: readonly ShareListStatus[] = [
  "ACTIVE",
  "REVOKED",
  "EXPIRED",
  "ALL",
] as const;

export type ShareFilters = {
  status?: ShareListStatus;
  /** Mã kiện / mã hồ sơ / gửi cho, ≤ 64. */
  q?: string;
  mine?: boolean;
  created_by?: string;
  claim_id?: string;
  package_id?: string;
  page?: number;
  page_size?: number;
};

export type ShareList = Page<Share> & { counts: Record<ShareListStatus, number> };

/** Lý do phiên không chọn được (API-164). */
export type ShareUnavailableReason = "CLIP_PENDING" | "CLIP_FAILED" | "CLIP_DELETED" | "CLIP_MISSING";

export type ShareOptionSession = {
  id: string;
  type: "PACK" | "RETURN";
  status: string;
  started_at: string;
  ended_at: string | null;
  station_name: string;
  operator_name: string | null;
  conclusion: string | null;
  duration_s: number;
  prior_return: boolean;
  primary: boolean;
  default_selected: boolean;
  selectable: boolean;
  unavailable_reason: ShareUnavailableReason | null;
  unavailable_at: string | null;
  cameras: ("CAM1" | "CAM2")[];
  /** v0.3: phiên "Cần soát" — không chọn sẵn, chip. */
  review_needed?: boolean;
  /**
   * M16 (02 §6.2 API-164 — BE DEC-667): phiên bị loại theo BR-39 nhưng có trong bằng chứng do thêm tay → server không
   * chọn sẵn (`default_selected = false`); FE vẫn cho chọn tay (T-262 — DEC-800).
   */
  excluded: boolean;
  /** M16 (BE DEC-667): ảnh `READY` của phiên trong bằng chứng — link chỉ kèm ảnh của phiên được chọn (DEC-801). */
  snapshot_count: number;
};

export type ShareOptions = {
  storage_configured: boolean;
  source: ShareSource & { platform: Platform | null; shop_name: string | null };
  sessions: ShareOptionSession[];
  snapshot_count: number;
  /** v0.4 (DEC-531): số phiên "Cần soát" chưa xử lý của hồ sơ (nguồn `SESSION` → 0). */
  review_pending_count: number;
  limits: { max_sessions: number; max_total_seconds: number; max_snapshots: number };
  default_expires_days: 1 | 3 | 7;
  /** G3-EV-4 (02 §6.2 API-164 bổ sung): Cam 1 của phiên chính không `READY` → Alert ở dialog. Thiếu → `false`. */
  primary_unavailable?: boolean;
  primary_unavailable_reason?: ShareUnavailableReason | null;
};

export type ShareExpiresDays = 1 | 3 | 7;
export const SHARE_EXPIRES_DAYS: readonly ShareExpiresDays[] = [1, 3, 7] as const;

export type CreateShareBody = {
  source_type: ShareSourceType;
  claim_id: string | null;
  session_id: string | null;
  session_ids: string[];
  layout: ShareLayout;
  include_snapshots: boolean;
  recipient: string;
  expires_days: ShareExpiresDays;
};

export type ShareOptionsQuery = { claim_id: string } | { session_id: string };

export const sharesApi = {
  /** API-164: đúng một trong `claim_id`, `session_id`. 404 khi nguồn không có. */
  options: (q: ShareOptionsQuery) => api.get<ShareOptions>("/shares/options", { query: q }),
  /**
   * API-160 → 202 `{id, status: CREATING}`. 422 `fields.session_ids` / `recipient` / `expires_days`; 409
   * SESSION_CLIP_UNAVAILABLE (`details.session_id`, `reason`); 503 CLOUD_NOT_CONFIGURED.
   */
  create: (body: CreateShareBody) => api.post<{ id: string; status: "CREATING" }>("/shares", body),
  list: (filters: ShareFilters) => api.get<ShareList>("/shares", { query: filters }),
  get: (id: string) => api.get<Share>(`/shares/${id}`),
  /** API-163: 409 SHARE_NOT_ACTIVE; 403 (CSKH thu hồi link người khác). */
  revoke: (id: string) => api.post<Share>(`/shares/${id}/revoke`),
};
