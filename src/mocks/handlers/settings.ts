import { http, HttpResponse } from "msw";

import { THRESHOLD_KEYS, type Health, type RetentionImpact, type SystemSettings } from "@/lib/api/settings";

import { API, apiError } from "../http";
import { phase3Config } from "../returnsDb";
import { stationSim } from "../stationSim";
import { stationWs } from "../ws";
import { healthBackup } from "./backup";
import { requireRole } from "./session";
import { mockShops } from "./shops";
import { mockStations } from "./stations";

/** item 02 (02 §6.2 API-80): 6 ngưỡng mới, giá trị mặc định. */
function THRESHOLDS() {
  return {
    return_warn_minutes: 20,
    return_abandon_minutes: 45,
    return_missing_days: 7,
    handover_warn_hours: 24,
    claim_deadline_days: 7,
    claim_due_soon_hours: 48,
  };
}

/** item 03 (02 §6.2 API-80): người đóng gói bắt buộc + hạn mặc định Chỉ hoàn tiền. */
function PHASE3() {
  return { packer_name_required: false, refund_only_default_hours: 48 };
}

/** API-82 mock: số liệu theo mức giảm (02 §6.2). */
function retentionImpact(raw: number, clip: number): RetentionImpact {
  const dClip = Math.max(0, (mockSettings.retention_clip_days ?? 90) - clip);
  const dRaw = Math.max(0, mockSettings.retention_raw_days - raw);
  return {
    clips: dClip * 15 + (dClip ? 12 : 0),
    clip_bytes: (dClip * 15 + (dClip ? 12 : 0)) * 165_000_000,
    raw_hours: dRaw * 124,
    raw_bytes: dRaw * 124 * 900_000_000,
    protected_clips: 18,
    next_run_at: new Date(
      Date.parse(`${new Date().toISOString().slice(0, 10)}T19:00:00Z`) + 86_400_000,
    ).toISOString(),
  };
}

/** API-80, API-81 theo 02 §6.2 (BE T-18 đã có — ràng buộc như `settings/service.py`). */
export const mockSettings: SystemSettings = {
  retention_raw_days: 30,
  retention_clip_days: 90,
  session_warn_minutes: 15,
  session_abandon_minutes: 30,
  ...THRESHOLDS(),
  ...PHASE3(),
  retention_clip_min_days: 60,
  updated_at: "2026-10-01T00:00:00Z",
};
/** Phần sức khỏe test đổi được (D2 mock có DISK_USAGE 83%). */
export const mockHealth = { db: "OK", redis: "OK", mediamtx: "OK", diskPercent: 83 } as {
  db: Health["db"];
  redis: Health["redis"];
  mediamtx: Health["mediamtx"];
  diskPercent: number | null;
};

export function resetMockSettings() {
  Object.assign(mockSettings, {
    retention_raw_days: 30,
    retention_clip_days: 90,
    session_warn_minutes: 15,
    session_abandon_minutes: 30,
    ...THRESHOLDS(),
    ...PHASE3(),
    retention_clip_min_days: 60,
    updated_at: "2026-10-01T00:00:00Z",
  });
  Object.assign(mockHealth, { db: "OK", redis: "OK", mediamtx: "OK", diskPercent: 83 });
  phase3Config.refundOnlyDefaultHours = 48;
}

const TOTAL = 8_000_000_000_000;
const KEYS = [
  ["retention_raw_days", 365],
  ["retention_clip_days", 365],
  ["session_warn_minutes", 1440],
  ["session_abandon_minutes", 1440],
] as const;

export const settingsHandlers = [
  http.get(`${API}/settings`, ({ request }) => {
    const [, denied] = requireRole(request, ["ADMIN", "SUPERVISOR"]);
    return denied ?? HttpResponse.json(mockSettings);
  }),

  http.put(`${API}/settings`, async ({ request }) => {
    const [, denied] = requireRole(request, ["ADMIN"]);
    if (denied) return denied;
    const body = (await request.json()) as Record<string, unknown>;
    const fields: Record<string, string> = {};
    for (const [key, max] of KEYS) {
      const v = body[key];
      if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > max)
        fields[key] = `Giá trị phải từ 1 đến ${max}.`;
    }
    const n = body as unknown as SystemSettings;
    if (
      !fields.retention_clip_days &&
      !fields.retention_raw_days &&
      n.retention_clip_days < n.retention_raw_days
    )
      fields.retention_clip_days = "Số ngày giữ clip phải lớn hơn hoặc bằng video thô.";
    if (
      !fields.session_abandon_minutes &&
      !fields.session_warn_minutes &&
      n.session_abandon_minutes <= n.session_warn_minutes
    )
      fields.session_abandon_minutes = "Thời gian bỏ dở phải lớn hơn thời gian cảnh báo.";
    // item 02: ngưỡng mới tùy chọn (thiếu = giữ cũ) + ràng buộc 02 §6.2 API-80.
    const LIMITS: Record<(typeof THRESHOLD_KEYS)[number], number> = {
      return_missing_days: 60,
      handover_warn_hours: 168,
      claim_deadline_days: 90,
      claim_due_soon_hours: 168,
      return_warn_minutes: 1440,
      return_abandon_minutes: 1440,
    };
    const next: Record<string, number> = {};
    for (const key of THRESHOLD_KEYS) {
      const v = body[key];
      if (v === undefined) {
        next[key] = mockSettings[key]!;
        continue;
      }
      if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > LIMITS[key])
        fields[key] = `Giá trị phải từ 1 đến ${LIMITS[key]}.`;
      else next[key] = v;
    }
    // item 03: tùy chọn (thiếu = giữ).
    const refundHours = body.refund_only_default_hours;
    if (
      refundHours !== undefined &&
      (typeof refundHours !== "number" ||
        !Number.isInteger(refundHours) ||
        refundHours < 1 ||
        refundHours > 168)
    )
      fields.refund_only_default_hours = "Giá trị phải từ 1 đến 168.";
    const packerRequired = body.packer_name_required;
    if (packerRequired !== undefined && typeof packerRequired !== "boolean")
      fields.packer_name_required = "Không hợp lệ";
    if (
      !fields.return_abandon_minutes &&
      !fields.return_warn_minutes &&
      next.return_abandon_minutes! <= next.return_warn_minutes!
    )
      fields.return_abandon_minutes = "Thời gian tự đóng phải lớn hơn thời gian cảnh báo.";
    if (Object.keys(fields).length > 0)
      return apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", { fields });
    const min = mockSettings.retention_clip_min_days ?? 60;
    if (n.retention_clip_days < min)
      return apiError(422, "RETENTION_BELOW_MINIMUM", `Số ngày giữ clip không được thấp hơn ${min}.`, {
        min,
        fields: { retention_clip_days: `Số ngày giữ clip không được thấp hơn ${min}.` },
      });
    const reduced =
      n.retention_clip_days < (mockSettings.retention_clip_days ?? 0) ||
      n.retention_raw_days < mockSettings.retention_raw_days;
    if (reduced && body.confirm_reduction !== true)
      return apiError(409, "RETENTION_REDUCTION_UNCONFIRMED", "Giảm thời gian lưu cần xác nhận.", {
        impact: retentionImpact(n.retention_raw_days, n.retention_clip_days),
      });
    for (const [key] of KEYS) mockSettings[key] = n[key];
    Object.assign(mockSettings, next);
    if (typeof refundHours === "number") {
      mockSettings.refund_only_default_hours = refundHours;
      phase3Config.refundOnlyDefaultHours = refundHours;
    }
    if (typeof packerRequired === "boolean" && packerRequired !== mockSettings.packer_name_required) {
      mockSettings.packer_name_required = packerRequired;
      // 02 §6.2 API-80: đổi → WS `station.state` cho mọi station.
      stationSim.operatorRequired = packerRequired;
      stationWs.broadcast(
        JSON.stringify({ type: "station.state", data: stationSim.state(), at: new Date().toISOString() }),
      );
    }
    mockSettings.updated_at = new Date().toISOString();
    return HttpResponse.json(mockSettings);
  }),

  http.get(`${API}/settings/retention-impact`, ({ request }) => {
    const [, denied] = requireRole(request, ["ADMIN"]);
    if (denied) return denied;
    const p = new URL(request.url).searchParams;
    const raw = Number(p.get("retention_raw_days") ?? mockSettings.retention_raw_days);
    const clip = Number(p.get("retention_clip_days") ?? mockSettings.retention_clip_days);
    return HttpResponse.json(retentionImpact(raw, clip));
  }),

  http.get(`${API}/system/health`, ({ request }) => {
    const [, denied] = requireRole(request, ["ADMIN", "SUPERVISOR"]);
    if (denied) return denied;
    const pct = mockHealth.diskPercent;
    const health: Health = {
      db: mockHealth.db,
      redis: mockHealth.redis,
      mediamtx: mockHealth.mediamtx,
      disk:
        pct === null
          ? null
          : { total_bytes: TOTAL, used_bytes: Math.round((TOTAL * pct) / 100), percent: pct },
      cameras: mockStations.flatMap((s) =>
        s.cameras.map((c) => ({
          id: c.id,
          station_name: s.name,
          role: c.role,
          status: c.status,
          clock_offset_ms: c.clock_offset_ms,
          last_seen_at: c.status === "ONLINE" ? new Date().toISOString() : null,
        })),
      ),
      sync: mockShops
        .filter((s) => s.auth_status !== "DISCONNECTED")
        .map((s) => ({
          shop_id: s.id,
          last_success_at: s.last_synced_at,
          last_error: s.last_error,
          platform: s.platform,
          shop_name: s.name,
        })),
      backup: healthBackup(),
    };
    return HttpResponse.json(health);
  }),
];
