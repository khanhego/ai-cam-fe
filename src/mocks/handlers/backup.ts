import { http } from "msw";

import type { BackupIssue, BackupRun, BackupStatus, ResolveIssueAction } from "@/lib/api/backup";
import type { BackupState } from "@/shared/labels";

import { API, apiError, json } from "../http";
import { mockParam } from "../shopsDb";
import { dashboardEvent } from "../ws";
import { requireRole } from "./session";

/**
 * API-180..188 (02 §6.2, 02b-admin §12). Kịch bản theo query của trang lúc tải `pnpm dev:mock`:
 * `?backupState=NOT_CONFIGURED|KEY_UNCONFIRMED|KEY_CHANGED|RESTORE_PENDING|DISABLED|ON`, `?oldKeys=1` (1 khóa cũ: 812
 * tệp, 42 bản DB), `?dbFail=2` (`consecutive_failures = 2`), `?srcMissing=1` (1 tệp `SOURCE_MISSING`); mặc định có 2 tệp
 * `HASH_MISMATCH` xử lý được. Test đổi trực tiếp `mockBackup`.
 */
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();

export const FINGERPRINT = "7F3A-91C2-0B5E-44D1";
export const OLD_FINGERPRINT = "21C4-0D9A-77E1-5B30";

type MockIssue = BackupIssue & { issueKind: "HASH_MISMATCH" | "SOURCE_MISSING" | "UPLOAD_FAILED" };

export const mockBackup = {
  configured: true,
  /** Trạng thái do người dùng / lệnh đặt; `state` tính theo thứ tự ưu tiên 02 §6.2 API-180. */
  enabled: true,
  restorePending: false,
  fingerprint: FINGERPRINT as string,
  confirmedFingerprint: FINGERPRINT as string | null,
  confirmedAt: null as string | null,
  oldKeys: false,
  consecutiveFailures: 0,
  running: false,
  uploadMbps: 10,
  allPackClips: false,
  history: [] as BackupRun[],
  issues: [] as MockIssue[],
  /** API-183: kết quả kiểm tra kết nối tiếp theo (`null` = OK). */
  nextTestError: null as null | { status: number; code: string; message: string },
};

function issue(
  n: number,
  kind: MockIssue["issueKind"],
  tracking: string,
  extra: Partial<BackupIssue> = {},
): MockIssue {
  return {
    issueKind: kind,
    object_id: `bo-${n}`,
    kind: "CLIP",
    status: kind === "HASH_MISMATCH" ? "HASH_MISMATCH" : "FAILED",
    session_id: `ses-${tracking}`,
    package_id: `pkg-${tracking}`,
    tracking_number: tracking,
    detected_at: iso(Date.now() - (n + 2) * HOUR),
    detail: kind === "SOURCE_MISSING" ? "SOURCE_MISSING" : null,
    sha256_expected:
      kind === "HASH_MISMATCH" ? "3f9a1c22b7d04e19a6c1f0de8a7b5c21e3d4f5a6b7c8d9e0f1a2b3c4d5e6c21e" : null,
    sha256_actual:
      kind === "HASH_MISMATCH" ? "9b0e44a1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d777d2" : null,
    resolution: null,
    ...extra,
  };
}

export function resetMockBackup() {
  const now = Date.now();
  const scenario = mockParam("backupState") as BackupState | null;
  Object.assign(mockBackup, {
    configured: scenario !== "NOT_CONFIGURED",
    enabled: scenario !== "DISABLED",
    restorePending: scenario === "RESTORE_PENDING",
    fingerprint: FINGERPRINT,
    confirmedFingerprint:
      scenario === "KEY_UNCONFIRMED" ? null : scenario === "KEY_CHANGED" ? OLD_FINGERPRINT : FINGERPRINT,
    confirmedAt: scenario === "KEY_UNCONFIRMED" ? null : iso(now - 20 * DAY),
    oldKeys: mockParam("oldKeys") === "1",
    consecutiveFailures: Number(mockParam("dbFail") ?? 0) || 0,
    running: false,
    uploadMbps: 10,
    allPackClips: false,
    nextTestError: null,
  });
  mockBackup.history = Array.from({ length: 14 }, (_, i): BackupRun => {
    const failed = i < mockBackup.consecutiveFailures;
    const start = now - (i + 1) * DAY + 2 * HOUR;
    return {
      id: `run-${i + 1}`,
      kind: "DB",
      started_at: iso(start),
      finished_at: iso(start + 4 * 60_000),
      status: failed ? "FAILED" : "SUCCESS",
      size_bytes: failed ? null : 190_840_832 - i * 1_200_000,
      error: failed ? "Không kết nối được kho lưu." : null,
      key_fingerprint: i > 10 && mockBackup.oldKeys ? OLD_FINGERPRINT : FINGERPRINT,
    };
  });
  mockBackup.issues = [
    issue(1, "HASH_MISMATCH", "SPXTST0000004"),
    issue(2, "HASH_MISMATCH", "SPXTST0000005"),
  ];
  if (mockParam("srcMissing") === "1") mockBackup.issues.push(issue(3, "SOURCE_MISSING", "SPXTST0000006"));
}
resetMockBackup();

/** Thứ tự ưu tiên của 02 §6.2 API-180. */
export function backupState(): BackupState {
  const b = mockBackup;
  if (!b.configured) return "NOT_CONFIGURED";
  if (b.restorePending) return "RESTORE_PENDING";
  if (!b.confirmedFingerprint) return "KEY_UNCONFIRMED";
  if (b.confirmedFingerprint !== b.fingerprint) return "KEY_CHANGED";
  if (!b.enabled) return "DISABLED";
  return "ON";
}

const openIssues = () => mockBackup.issues.filter((i) => !i.resolution);

export function backupStatus(): BackupStatus {
  const b = mockBackup;
  const state = backupState();
  const lastSuccess = b.history.find((r) => r.status === "SUCCESS");
  const hours = lastSuccess ? (Date.now() - Date.parse(lastSuccess.finished_at!)) / HOUR : null;
  const open = openIssues();
  const mismatch = open.filter((i) => i.issueKind === "HASH_MISMATCH").length;
  const sourceMissing = open.filter((i) => i.issueKind === "SOURCE_MISSING").length;
  return {
    configured: b.configured,
    storage: b.configured ? { endpoint_host: "s3.example.vn", bucket: "aicam-backup" } : null,
    key: {
      configured: b.configured,
      fingerprint: b.configured ? b.fingerprint : null,
      confirmed_fingerprint: b.confirmedFingerprint,
      confirmed_at: b.confirmedAt,
      confirmed_by: b.confirmedFingerprint ? { id: "u-admin", display_name: "Quản trị" } : null,
      old_keys: b.oldKeys
        ? [
            {
              fingerprint: OLD_FINGERPRINT,
              evidence_objects: 812,
              db_runs: 42,
              reuploadable: 790,
              reuploadable_bytes: 146_028_888_064,
            },
          ]
        : [],
    },
    state,
    enabled: b.enabled,
    db: {
      last_success_at: lastSuccess?.finished_at ?? null,
      last_size_bytes: lastSuccess?.size_bytes ?? null,
      next_run_at: iso(Date.parse(`${new Date().toISOString().slice(0, 10)}T19:00:00Z`) + DAY),
      hours_since_success: hours === null ? null : Math.round(hours * 10) / 10,
      late: hours === null || hours > 26,
      running: b.running,
      consecutive_failures: b.consecutiveFailures,
    },
    evidence: {
      uploaded: 1204,
      pending: 3,
      failed: sourceMissing,
      oldest_pending_at: iso(Date.now() - 2 * HOUR),
      late_count: 0,
      hash_mismatch: mismatch,
      ignored: mockBackup.issues.filter((i) => i.resolution?.action === "IGNORE").length,
      source_deleted: 4,
      source_missing: sourceMissing,
    },
    cloud_bytes: 162_135_113_728,
    last_error: b.consecutiveFailures
      ? { code: "CLOUD_UNREACHABLE", message: "Không kết nối được kho lưu.", at: b.history[0]!.finished_at! }
      : null,
    settings: {
      upload_mbps: b.uploadMbps,
      all_pack_clips: b.allPackClips,
      all_pack_clips_estimate_gb_per_day: 30.4,
    },
    history: b.history,
  };
}

/** Phần `backup` của API-81 (D8). */
export function healthBackup() {
  const s = backupStatus();
  return {
    state: s.state,
    last_db_success_at: s.db.last_success_at,
    pending: s.evidence.pending,
    late: s.db.late || s.evidence.late_count > 0 || s.evidence.hash_mismatch > 0,
    last_error: s.last_error,
  };
}

const announce = () => {
  const s = backupStatus();
  dashboardEvent("backup.updated", {
    state: s.state,
    pending: s.evidence.pending,
    last_db_success_at: s.db.last_success_at,
  });
};

const NOT_CONFIGURED = () =>
  apiError(
    503,
    "BACKUP_NOT_CONFIGURED",
    "Chưa cấu hình kho lưu cloud. Liên hệ IT (S3_*, BACKUP_ENCRYPTION_KEY).",
  );
const RESTORE_UNVERIFIED = () =>
  apiError(
    409,
    "BACKUP_RESTORE_UNVERIFIED",
    "Hệ thống vừa được khôi phục. Sao lưu tạm dừng tới khi IT chạy lệnh kiểm khôi phục đạt.",
  );
const KEY_UNCONFIRMED = () =>
  apiError(409, "BACKUP_KEY_UNCONFIRMED", "Chưa xác nhận đã cất khóa sao lưu. Xác nhận khóa trước.");
const DISABLED = () => apiError(409, "BACKUP_DISABLED", "Sao lưu đang tắt. Bật sao lưu rồi thử lại.");

const ISSUE_KIND_OK: Record<ResolveIssueAction, MockIssue["issueKind"][]> = {
  UPLOAD_ANYWAY: ["HASH_MISMATCH"],
  RETRY: ["SOURCE_MISSING"],
  IGNORE: ["HASH_MISMATCH", "SOURCE_MISSING"],
};

const strip = ({ issueKind, ...rest }: MockIssue): BackupIssue => {
  void issueKind;
  return rest;
};

export const backupHandlers = [
  http.get(`${API}/backup`, ({ request }) => {
    const [, denied] = requireRole(request, ["ADMIN"]);
    return denied ?? json(backupStatus());
  }),

  http.put(`${API}/backup/settings`, async ({ request }) => {
    const [, denied] = requireRole(request, ["ADMIN"]);
    if (denied) return denied;
    if (!mockBackup.configured) return NOT_CONFIGURED();
    const body = (await request.json()) as {
      enabled?: boolean;
      upload_mbps?: number;
      all_pack_clips?: boolean;
    };
    const v = body.upload_mbps;
    if (v !== undefined && (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 1000))
      return apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", {
        fields: { upload_mbps: "Giá trị phải từ 1 đến 1000." },
      });
    if (body.enabled === true) {
      const state = backupState();
      if (state === "RESTORE_PENDING") return RESTORE_UNVERIFIED();
      if (state === "KEY_UNCONFIRMED" || state === "KEY_CHANGED") return KEY_UNCONFIRMED();
    }
    if (body.enabled !== undefined) mockBackup.enabled = body.enabled;
    if (v !== undefined) mockBackup.uploadMbps = v;
    if (body.all_pack_clips !== undefined) mockBackup.allPackClips = body.all_pack_clips;
    announce();
    return json(backupStatus());
  }),

  http.post(`${API}/backup/confirm-key`, async ({ request }) => {
    const [, denied] = requireRole(request, ["ADMIN"]);
    if (denied) return denied;
    if (!mockBackup.configured) return NOT_CONFIGURED();
    const body = (await request.json()) as { fingerprint?: string };
    if (body.fingerprint !== mockBackup.fingerprint)
      return apiError(409, "BACKUP_KEY_MISMATCH", "Khóa trên máy chủ vừa đổi — kiểm lại dấu vân tay.");
    Object.assign(mockBackup, {
      confirmedFingerprint: mockBackup.fingerprint,
      confirmedAt: new Date().toISOString(),
      enabled: true,
    });
    announce();
    return json(backupStatus());
  }),

  http.post(`${API}/backup/test`, ({ request }) => {
    const [, denied] = requireRole(request, ["ADMIN"]);
    if (denied) return denied;
    if (!mockBackup.configured) return NOT_CONFIGURED();
    const e = mockBackup.nextTestError;
    if (e) return apiError(e.status, e.code, e.message);
    return json({ ok: true, elapsed_ms: 1840 });
  }),

  http.post(`${API}/backup/run-db`, ({ request }) => {
    const [, denied] = requireRole(request, ["ADMIN"]);
    if (denied) return denied;
    if (!mockBackup.configured) return NOT_CONFIGURED();
    const state = backupState();
    if (state === "RESTORE_PENDING") return RESTORE_UNVERIFIED();
    if (state === "KEY_UNCONFIRMED" || state === "KEY_CHANGED") return KEY_UNCONFIRMED();
    if (state === "DISABLED") return DISABLED();
    if (mockBackup.running) return apiError(409, "BACKUP_RUNNING", "Đang sao lưu, thử lại sau.");
    mockBackup.running = true;
    const now = Date.now();
    const run: BackupRun = {
      id: `run-now-${now.toString(36)}`,
      kind: "DB",
      started_at: iso(now),
      finished_at: iso(now + 1000),
      status: "SUCCESS",
      size_bytes: 191_002_112,
      error: null,
      key_fingerprint: mockBackup.fingerprint,
    };
    // Mock: lượt chạy xong ngay ở lần đọc sau.
    mockBackup.history.unshift(run);
    mockBackup.consecutiveFailures = 0;
    setTimeout(() => {
      mockBackup.running = false;
      announce();
    }, 0);
    return json({ run_id: run.id }, { status: 202 });
  }),

  http.get(`${API}/backup/issues`, ({ request }) => {
    const [, denied] = requireRole(request, ["ADMIN"]);
    if (denied) return denied;
    const p = new URL(request.url).searchParams;
    const kind = p.get("kind");
    const all = mockBackup.issues.filter(
      (i) => (p.get("include_resolved") === "true" || !i.resolution) && (!kind || i.issueKind === kind),
    );
    const page = Math.max(1, Number(p.get("page") ?? 1) || 1);
    const pageSize = 20;
    return json({
      items: all.slice((page - 1) * pageSize, page * pageSize).map(strip),
      page,
      page_size: pageSize,
      total: all.length,
    });
  }),

  http.post(`${API}/backup/reupload-old-key`, ({ request }) => {
    const [, denied] = requireRole(request, ["ADMIN"]);
    if (denied) return denied;
    if (!mockBackup.configured) return NOT_CONFIGURED();
    const state = backupState();
    if (state === "RESTORE_PENDING") return RESTORE_UNVERIFIED();
    if (state === "DISABLED") return DISABLED();
    // Idempotent: lần sau chỉ xếp tệp chưa xếp (mock: 0).
    const queued = mockBackup.oldKeys ? 790 : 0;
    mockBackup.oldKeys = false;
    announce();
    return json({ queued, bytes: queued ? 146_028_888_064 : 0 }, { status: 202 });
  }),

  http.post(`${API}/backup/issues/:id/resolve`, async ({ request, params }) => {
    const [user, denied] = requireRole(request, ["ADMIN"]);
    if (denied) return denied;
    const body = (await request.json()) as { action?: ResolveIssueAction; note?: string };
    const note = body.note?.trim() ?? "";
    if (!body.action || !(body.action in ISSUE_KIND_OK) || note.length < 5 || note.length > 500)
      return apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", {
        fields: { note: "Nhập lý do (5–500 ký tự)." },
      });
    const item = mockBackup.issues.find((i) => i.object_id === params.id);
    if (!item) return apiError(404, "NOT_FOUND", "Không tìm thấy tệp.");
    if (item.resolution)
      return apiError(409, "BACKUP_ISSUE_RESOLVED", "Tệp này đã được xử lý. Tải lại danh sách.");
    if (!ISSUE_KIND_OK[body.action].includes(item.issueKind))
      return apiError(409, "BACKUP_ISSUE_ACTION_INVALID", "Hành động không hợp với loại vấn đề của tệp.");
    item.resolution = {
      action: body.action,
      note,
      by: { id: user.id, display_name: user.display_name },
      at: new Date().toISOString(),
    };
    item.status = body.action === "IGNORE" ? "IGNORED" : "PENDING";
    announce();
    return json(strip(item));
  }),
];
