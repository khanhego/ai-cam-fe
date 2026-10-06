import type {
  BackupIssueKind,
  BackupObjectStatus,
  BackupResolutionAction,
  BackupState,
} from "@/shared/labels";

import { api } from "./client";
import type { Page } from "./stations";

/** API-180..188 (02 §6.2) — sao lưu cloud (D23, ADMIN). Không API nào trả khóa — chỉ dấu vân tay. */
export type UserBrief = { id: string; display_name: string };

export type OldKey = {
  fingerprint: string;
  evidence_objects: number;
  db_runs: number;
  reuploadable: number;
  reuploadable_bytes: number;
};

export type BackupRun = {
  id: string;
  kind: "DB";
  started_at: string;
  finished_at: string | null;
  status: "RUNNING" | "SUCCESS" | "FAILED";
  size_bytes: number | null;
  error: string | null;
  key_fingerprint: string | null;
};

export type BackupStatus = {
  configured: boolean;
  /** null khi `configured = false`. */
  storage: { endpoint_host: string; bucket: string } | null;
  key: {
    configured: boolean;
    fingerprint: string | null;
    confirmed_fingerprint: string | null;
    confirmed_at: string | null;
    confirmed_by: UserBrief | null;
    /** Rỗng → FE không hiện Alert khóa cũ. */
    old_keys: OldKey[];
  };
  state: BackupState;
  enabled: boolean;
  db: {
    last_success_at: string | null;
    last_size_bytes: number | null;
    next_run_at: string | null;
    hours_since_success: number | null;
    late: boolean;
    running: boolean;
    consecutive_failures: number;
  };
  evidence: {
    uploaded: number;
    pending: number;
    failed: number;
    oldest_pending_at: string | null;
    late_count: number;
    hash_mismatch: number;
    ignored: number;
    source_deleted: number;
    source_missing: number;
  };
  cloud_bytes: number;
  last_error: { code: string; message: string; at: string } | null;
  settings: {
    upload_mbps: number;
    all_pack_clips: boolean;
    all_pack_clips_estimate_gb_per_day: number | null;
  };
  /** 14 ngày, mới nhất trước. */
  history: BackupRun[];
};

export type BackupSettingsInput = { enabled?: boolean; upload_mbps?: number; all_pack_clips?: boolean };

export type BackupIssue = {
  object_id: string;
  kind: "CLIP" | "SNAPSHOT";
  status: BackupObjectStatus;
  session_id: string | null;
  package_id: string | null;
  tracking_number: string | null;
  detected_at: string;
  detail: string | null;
  sha256_expected: string | null;
  sha256_actual: string | null;
  resolution: { action: BackupResolutionAction; note: string; by: UserBrief | null; at: string } | null;
};

export type BackupIssueFilters = { kind?: BackupIssueKind; include_resolved?: boolean; page?: number };

/** `UPLOAD_ANYWAY` chỉ `HASH_MISMATCH`; `RETRY` chỉ `SOURCE_MISSING`; `IGNORE` cả hai (v0.3). */
export type ResolveIssueAction = Exclude<BackupResolutionAction, "ACCEPT_RESTORED">;

export const BACKUP_LIMITS = { uploadMbpsMin: 1, uploadMbpsMax: 1000, noteMin: 5, noteMax: 500 } as const;

export const backupApi = {
  get: () => api.get<BackupStatus>("/backup"),
  /** API-181: 503 BACKUP_NOT_CONFIGURED; 409 BACKUP_KEY_UNCONFIRMED / BACKUP_RESTORE_UNVERIFIED; 422 `fields.upload_mbps`. */
  updateSettings: (body: BackupSettingsInput) => api.put<BackupStatus>("/backup/settings", body),
  /** API-182: 409 BACKUP_KEY_MISMATCH (khóa vừa đổi). */
  confirmKey: (fingerprint: string) => api.post<BackupStatus>("/backup/confirm-key", { fingerprint }),
  /** API-183 (≤ 10 giây): 502 CLOUD_AUTH_FAILED / CLOUD_ERROR, 504 CLOUD_UNREACHABLE. */
  test: () => api.post<{ ok: true; elapsed_ms: number }>("/backup/test"),
  /** API-184 → 202. 409 BACKUP_RUNNING / BACKUP_KEY_UNCONFIRMED / BACKUP_RESTORE_UNVERIFIED / BACKUP_DISABLED. */
  runDb: () => api.post<{ run_id: string }>("/backup/run-db"),
  /** API-185: mặc định chỉ mục chưa xử lý. */
  issues: (filters: BackupIssueFilters = {}) =>
    api.get<Page<BackupIssue>>("/backup/issues", { query: filters }),
  /** API-187 → 202. 409 BACKUP_DISABLED / BACKUP_RESTORE_UNVERIFIED. */
  reuploadOldKey: () => api.post<{ queued: number; bytes: number }>("/backup/reupload-old-key"),
  /** API-188: 422 `fields.note`; 409 BACKUP_ISSUE_RESOLVED / BACKUP_ISSUE_ACTION_INVALID. */
  resolveIssue: (objectId: string, action: ResolveIssueAction, note: string) =>
    api.post<BackupIssue>(`/backup/issues/${objectId}/resolve`, { action, note }),
};
