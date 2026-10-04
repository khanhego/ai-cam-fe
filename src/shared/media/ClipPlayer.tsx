import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { EmptyState, Tabs } from "@/shared/ui";

export type ClipRef = { id: string; camera_role: "CAM1" | "CAM2"; status: string };

/** URL phát có chữ ký (API-40), hết hạn 10 phút → giữ 8 phút. */
function useClipUrl(clipId: string | undefined) {
  return useQuery({
    queryKey: ["clip-url", clipId],
    enabled: Boolean(clipId),
    staleTime: 8 * 60_000,
    retry: (count, error) => isApiError(error) && error.code === "SIGNATURE_INVALID" && count < 1,
    queryFn: () => api.get<{ url: string; expires_at: string }>(`/clips/${clipId}/play-url`),
  });
}

const LABEL = { CAM1: "Cam 1", CAM2: "Cam 2" } as const;

/** Trình phát clip Cam 1 / Cam 2 (dùng chung station S1 và dashboard D4 — 02b §3). */
export function ClipPlayer({ clips }: { clips: ClipRef[] }) {
  const roles = clips.map((c) => c.camera_role);
  const [tab, setTab] = useState<"CAM1" | "CAM2">(roles[0] ?? "CAM1");
  const clip = clips.find((c) => c.camera_role === tab);
  const url = useClipUrl(clip?.status === "READY" ? clip.id : undefined);

  if (clips.length === 0 || clip?.status === "PENDING") {
    return <EmptyState icon="autorenew" title="Clip đang được cắt, sẵn sàng trong khoảng 1 phút." />;
  }
  return (
    <div>
      <Tabs label="Camera" value={tab} onChange={setTab} items={roles.map((r) => [r, LABEL[r]])} />
      {clip?.status === "DELETED" && (
        <EmptyState icon="delete" title="Clip đã bị xóa theo chính sách lưu trữ." />
      )}
      {clip?.status === "FAILED" && <EmptyState icon="error" title="Không tạo được clip." />}
      {clip?.status === "READY" && url.data && (
        // preload="none": chỉ tải khi bấm phát để audit VIEW_CLIP đúng nghĩa (02b-admin §10).
        <video
          key={url.data.url}
          src={url.data.url}
          controls
          preload="none"
          className="aspect-video w-full rounded-md bg-black"
        />
      )}
      {clip?.status === "READY" && url.isError && (
        <EmptyState icon="error" title="Không phát được clip. Thử lại." />
      )}
    </div>
  );
}
