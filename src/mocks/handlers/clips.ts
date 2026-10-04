import { http, HttpResponse } from "msw";

import type { ExportLayout } from "@/lib/api/clips";

import { API, apiError } from "../http";
import {
  findClip,
  findSession,
  mockExports,
  mockPackages,
  type MockClip,
  type MockExport,
} from "../packagesDb";
import { DASHBOARD_ROLES, requireRole } from "./session";

const video = (clipId: string) => (clipId.endsWith("-2") ? "/mock/clip-cam2.mp4" : "/mock/clip-cam1.mp4");

function clipStateError(clip: MockClip) {
  if (clip.status === "DELETED")
    return apiError(410, "CLIP_DELETED", "Clip đã bị xóa theo chính sách lưu trữ.");
  if (clip.status !== "READY") return apiError(409, "CLIP_NOT_READY", "Clip đang được cắt.");
  return null;
}

const NEEDS: Record<ExportLayout, ("CAM1" | "CAM2")[]> = {
  CAM1: ["CAM1"],
  CAM2: ["CAM2"],
  SIDE_BY_SIDE: ["CAM1", "CAM2"],
};

/** Mock: bản xuất đầu tiên của SPXTST0000002 lỗi encode (để thử "Thử lại"); test bật/tắt được. */
export const mockExportRules = { failFirstFor: new Set<string>(["pkg-0000002"]) };
export function resetMockExportRules() {
  mockExportRules.failFirstFor = new Set(["pkg-0000002"]);
}

function exportBody(e: MockExport, uid: string) {
  const session = findSession(e.session_id)!;
  const sig = `uid=${uid}&exp=1790000000&sig=mock`;
  const ready = e.status === "READY";
  return {
    id: e.id,
    status: e.status,
    progress: e.progress,
    sha256: ready ? "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" : null,
    source_clip_sha256: Object.fromEntries(
      session.clips
        .filter((c) => NEEDS[e.layout].includes(c.camera_role))
        .map((c) => [c.camera_role, c.sha256]),
    ),
    files: ready
      ? {
          video: `${e.layout === "CAM2" ? "/mock/clip-cam2.mp4" : "/mock/clip-cam1.mp4"}?export=${e.id}&${sig}`,
          info: `${API}/media/exports/${e.id}/info.json?${sig}`,
        }
      : null,
    expires_at: ready ? new Date(Date.now() + 24 * 3600_000).toISOString() : null,
  };
}

/** API-40, 41 (mock bằng video mẫu), 42, 43, 44, 45, 46 theo 02 §6.2. */
export const clipsHandlers = [
  http.get(`${API}/clips/:id/play-url`, ({ request, params }) => {
    const [, denied] = requireRole(request, [...DASHBOARD_ROLES, "STATION"]);
    if (denied) return denied;
    const id = String(params.id);
    const clip = findClip(id);
    if (clip) {
      const err = clipStateError(clip);
      if (err) return err;
    }
    // Clip của StationSim (phiên gần đây ở station) không nằm trong packagesDb.
    return HttpResponse.json({ url: video(id), expires_at: new Date(Date.now() + 600_000).toISOString() });
  }),

  http.put(`${API}/clips/:id/hold`, async ({ request, params }) => {
    const [user, denied] = requireRole(request, DASHBOARD_ROLES);
    if (denied) return denied;
    const clip = findClip(String(params.id));
    if (!clip) return apiError(404, "NOT_FOUND", "Không tìm thấy clip.");
    const err = clipStateError(clip);
    if (err) return err;
    const { held } = (await request.json()) as { held: boolean };
    const session = findSession(clip.session_id)!;
    clip.held = held;
    clip.retention_until = held
      ? null
      : new Date(Date.parse(session.ended_at ?? session.started_at) + 90 * 86_400_000).toISOString();
    return HttpResponse.json({
      id: clip.id,
      held,
      held_by: held ? { id: user.id, display_name: user.display_name } : null,
      held_at: held ? new Date().toISOString() : null,
      retention_until: clip.retention_until,
    });
  }),

  http.post(`${API}/sessions/:id/clips/rebuild`, ({ request, params }) => {
    const [, denied] = requireRole(request, ["ADMIN", "SUPERVISOR"]);
    if (denied) return denied;
    const session = findSession(String(params.id));
    if (!session) return apiError(404, "NOT_FOUND", "Không tìm thấy phiên.");
    const failed = session.clips.filter((c) => c.status === "FAILED");
    if (failed.length === 0) return apiError(409, "CLIP_NOT_FAILED", "Clip không ở trạng thái lỗi.");
    for (const c of failed) c.status = "PENDING";
    // Giả lập worker cắt lại xong sau 3 giây.
    setTimeout(() => {
      for (const c of failed) {
        if (c.status !== "PENDING") continue;
        c.status = "READY";
        c.sha256 = "5d41402abc4b2a76b9719d911017c592".repeat(2);
        c.duration_s = (session.duration_s ?? 120) + 10;
      }
    }, 3000);
    return HttpResponse.json({ queued: true }, { status: 202 });
  }),

  http.post(`${API}/sessions/:id/exports`, async ({ request, params }) => {
    const [user, denied] = requireRole(request, DASHBOARD_ROLES);
    if (denied) return denied;
    const session = findSession(String(params.id));
    if (!session) return apiError(404, "NOT_FOUND", "Không tìm thấy phiên.");
    const { layout } = (await request.json()) as { layout: ExportLayout };
    if (!NEEDS[layout])
      return apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", {
        fields: { layout: "Không hợp lệ" },
      });
    for (const role of NEEDS[layout]) {
      const clip = session.clips.find((c) => c.camera_role === role);
      if (!clip) return apiError(409, "CLIP_NOT_READY", "Clip đang được cắt.");
      const err = clipStateError(clip);
      if (err) return err;
    }
    const fail = mockExportRules.failFirstFor.delete(session.package_id);
    const e: MockExport = {
      id: `exp-${Date.now()}-${mockExports.size + 1}`,
      session_id: session.id,
      layout,
      status: "QUEUED",
      progress: 0,
      created_by: user.id,
      ticks: 0,
      fail,
    };
    mockExports.set(e.id, e);
    return HttpResponse.json({ id: e.id, status: e.status, progress: 0 }, { status: 202 });
  }),

  http.get(`${API}/exports/:id`, ({ request, params }) => {
    const [user, denied] = requireRole(request, DASHBOARD_ROLES);
    if (denied) return denied;
    const e = mockExports.get(String(params.id));
    if (!e) return apiError(404, "NOT_FOUND", "Không tìm thấy bản xuất.");
    if (e.created_by !== user.id && user.role !== "ADMIN")
      return apiError(403, "FORBIDDEN", "Tài khoản không có quyền thực hiện thao tác này.");
    // Mỗi lần poll tiến thêm một bước: QUEUED → RUNNING 40 → RUNNING 80 → READY / FAILED.
    if (e.status === "QUEUED" || e.status === "RUNNING") {
      e.ticks += 1;
      if (e.ticks >= 3) {
        e.status = e.fail ? "FAILED" : "READY";
        e.progress = e.fail ? e.progress : 100;
      } else {
        e.status = "RUNNING";
        e.progress = e.ticks * 40;
      }
    }
    return HttpResponse.json(exportBody(e, user.id));
  }),

  http.get(`${API}/media/exports/:id/info.json`, ({ params }) => {
    const e = mockExports.get(String(params.id));
    if (!e || e.status !== "READY") return apiError(403, "SIGNATURE_INVALID", "Liên kết đã hết hạn.");
    const session = findSession(e.session_id)!;
    const pkg = mockPackages.find((p) => p.id === session.package_id)!;
    const body = exportBody(e, "mock");
    return HttpResponse.json({
      tracking_number: pkg.tracking_number,
      platform_order_sn: pkg.order?.platform_order_sn,
      station_name: session.station_name,
      started_at: session.started_at,
      ended_at: session.ended_at,
      layout: e.layout,
      sha256: body.sha256,
      source_clip_sha256: body.source_clip_sha256,
    });
  }),
];
