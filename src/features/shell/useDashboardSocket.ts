import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { connectWs, type WsMessage } from "@/lib/ws";

/** `report.updated` → gọi lại API-32 tối đa 1 lần / 5 giây (02 §6 WS-02). */
export const REPORT_THROTTLE_MS = 5000;

/** Throttle có lần chạy cuối: sự kiện dồn trong 5 giây vẫn được phản ánh khi hết 5 giây. */
function throttled(fn: () => void, ms: number) {
  let last = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const call = () => {
    timer = undefined;
    last = Date.now();
    fn();
  };
  return {
    fire() {
      const wait = last + ms - Date.now();
      if (wait <= 0 && !timer) call();
      else timer ??= setTimeout(call, Math.max(wait, 0));
    },
    cancel: () => clearTimeout(timer),
  };
}

const invalidate = (qc: QueryClient, ...keys: unknown[][]) =>
  keys.forEach((queryKey) => void qc.invalidateQueries({ queryKey }));

/**
 * WS-02 cho dashboard (02b-admin §4, DEC-20): sự kiện chỉ để invalidate query, không giữ state song song.
 * - `report.updated` → D2 (throttle 5 giây).
 * - `camera.status` → D6 (station) + D2 (chip camera, mục Cần xử lý).
 * - `approval.created` / `approval.resolved` → D13 + badge + D2 (số yêu cầu đang chờ); `approval.created` còn gọi
 *   `onApprovalCreated` (âm báo D13).
 * - `export.updated` → bản xuất đang theo dõi (ExportDialog vẫn poll 2 giây dự phòng).
 * - `session.*`, `clip.*` (vd. `session.clip_ready`) → tra cứu D3 + chi tiết D4. WS-02 trong 02 §6 chưa liệt kê
 *   các sự kiện này (DEC-71) nên D4 còn tự poll khi có clip đang cắt; nếu BE gửi thì nhận ngay.
 */
export function useDashboardSocket(
  socketFactory?: (url: string) => WebSocket,
  events?: { onApprovalCreated?: () => void },
) {
  const queryClient = useQueryClient();
  // Ref: đổi callback không mở lại WS.
  const eventsRef = useRef(events);
  useEffect(() => {
    eventsRef.current = events;
  });
  useEffect(() => {
    const report = throttled(() => invalidate(queryClient, ["daily"]), REPORT_THROTTLE_MS);
    const onMessage = (msg: WsMessage) => {
      const data = (msg.data ?? {}) as { id?: string };
      if (msg.type === "report.updated") report.fire();
      else if (msg.type === "camera.status") invalidate(queryClient, ["stations"], ["station"], ["daily"]);
      else if (msg.type.startsWith("approval.")) {
        invalidate(queryClient, ["approvals"], ["daily"]);
        if (msg.type === "approval.created") eventsRef.current?.onApprovalCreated?.();
      } else if (msg.type === "export.updated")
        invalidate(queryClient, data.id ? ["export", data.id] : ["export"]);
      else if (msg.type.startsWith("session.") || msg.type.startsWith("clip."))
        invalidate(queryClient, ["package"], ["packages"]);
    };
    const conn = connectWs({ path: "/ws/dashboard", onMessage, socketFactory });
    return () => {
      report.cancel();
      conn.close();
    };
  }, [queryClient, socketFactory]);
}
