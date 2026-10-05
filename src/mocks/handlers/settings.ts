import { http, HttpResponse } from "msw";

import type { Health, SystemSettings } from "@/lib/api/settings";

import { API, apiError } from "../http";
import { requireRole } from "./session";
import { mockShops } from "./shops";
import { mockStations } from "./stations";

/** API-80, API-81 theo 02 §6.2 (BE T-18 đã có — ràng buộc như `settings/service.py`). */
export const mockSettings: SystemSettings = {
  retention_raw_days: 30,
  retention_clip_days: 90,
  session_warn_minutes: 15,
  session_abandon_minutes: 30,
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
    updated_at: "2026-10-01T00:00:00Z",
  });
  Object.assign(mockHealth, { db: "OK", redis: "OK", mediamtx: "OK", diskPercent: 83 });
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
    if (Object.keys(fields).length > 0)
      return apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", { fields });
    for (const [key] of KEYS) mockSettings[key] = n[key];
    mockSettings.updated_at = new Date().toISOString();
    return HttpResponse.json(mockSettings);
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
      sync: mockShops.map((s) => ({
        shop_id: s.id,
        last_success_at: s.last_synced_at,
        last_error: s.last_error,
      })),
    };
    return HttpResponse.json(health);
  }),
];
