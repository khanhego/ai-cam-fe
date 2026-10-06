import { api } from "./client";

/**
 * API-40, 42, 43, 44, 46 (02 §6.2). Item 02: API-42 (giữ clip) chỉ ADMIN, deprecated — UI không còn nút (DEC-242);
 * clip được bảo vệ qua hồ sơ khiếu nại (ADR-009).
 */
export type ExportLayout = "CAM1" | "CAM2" | "SIDE_BY_SIDE";

export type ExportJob = {
  id: string;
  status: "QUEUED" | "RUNNING" | "READY" | "FAILED";
  progress: number;
  /** API-44 (02 v0.3 DEC-57); API-43 không trả. */
  session_id?: string;
  layout?: ExportLayout;
  sha256?: string | null;
  source_clip_sha256?: Partial<Record<"CAM1" | "CAM2", string>>;
  files?: { video: string; info: string } | null;
  expires_at?: string | null;
};

export type HoldResult = {
  id: string;
  held: boolean;
  held_by: { id: string; display_name: string } | null;
  held_at: string | null;
  retention_until: string | null;
};

export const clipsApi = {
  playUrl: (clipId: string) => api.get<{ url: string; expires_at: string }>(`/clips/${clipId}/play-url`),
  hold: (clipId: string, held: boolean) => api.put<HoldResult>(`/clips/${clipId}/hold`, { held }),
  rebuild: (sessionId: string) => api.post<{ queued: boolean }>(`/sessions/${sessionId}/clips/rebuild`),
  createExport: (sessionId: string, layout: ExportLayout) =>
    api.post<ExportJob>(`/sessions/${sessionId}/exports`, { layout }),
  getExport: (exportId: string) => api.get<ExportJob>(`/exports/${exportId}`),
};
