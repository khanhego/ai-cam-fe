import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { connectWs, type WsMessage, type WsStatus } from "@/lib/ws";

/** `report.updated` → gọi lại API-32 tối đa 1 lần / 2 giây (02 §6 WS-02 v0.7, DEC-69: bảo đảm D2 cập nhật ≤ 5 giây — TC-09.03). */
export const REPORT_THROTTLE_MS = 2000;

/** `return.updated` → D14 làm mới tối đa 1 lần / 2 giây (01 §10.5 D14 Realtime). */
export const RETURNS_THROTTLE_MS = 2000;

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
 * - `report.updated` → D2 (throttle 2 giây).
 * - `camera.status` → D6 (station) + D2 (chip camera, mục Cần xử lý) + D11 (ô camera nối lại / "Mất tín hiệu").
 * - `approval.created` / `approval.resolved` → D13 + badge + D2 (số yêu cầu đang chờ); `approval.created` còn gọi
 *   `onApprovalCreated` (âm báo D13).
 * - `export.updated` → bản xuất đang theo dõi (ExportDialog vẫn poll 2 giây dự phòng).
 * - WS nối lại (sau lần mở đầu) → D13 + D2.
 * - `session.*`, `clip.*` (vd. `session.clip_ready`) → tra cứu D3 + chi tiết D4. WS-02 trong 02 §6 chưa liệt kê
 *   các sự kiện này (DEC-71) nên D4 còn tự poll khi có clip đang cắt; nếu BE gửi thì nhận ngay.
 * - Item 02 (02 §6.2 WS-02, 02b-admin §4): `return.updated` → D14 (throttle 2 giây) + D4 + D2;
 *   `recon.updated` → D15 + D4 + D2 (badge Lệch); `claim.updated` → D16 + D17 của hồ sơ đó + D4 + D2 (badge Hồ sơ);
 *   `evidence_pack.updated` → ghi thẳng trạng thái gói vào `['evidence-pack', id]` (dữ liệu đầy đủ như API-137).
 * - WS nối lại → thêm D14, D15, D16 (sự kiện lỡ trong lúc mất).
 * - Item 03 (02 §6.2 WS-02 mới, 02b-admin §4): `share.updated` → D21 + link đang theo dõi + khối Link ở D4 / D17;
 *   `backup.updated` (chỉ ADMIN) → D23 + D8 sức khỏe + D2; `shop.updated` (chỉ ADMIN) → D7 + bộ lọc shop + D2.
 *   WS nối lại → thêm D21, D23, D7.
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
    const returns = throttled(() => invalidate(queryClient, ["returns"]), RETURNS_THROTTLE_MS);
    const onMessage = (msg: WsMessage) => {
      const data = (msg.data ?? {}) as { id?: string; claim_id?: string; share_id?: string };
      if (msg.type === "report.updated") report.fire();
      else if (msg.type === "camera.status")
        invalidate(queryClient, ["stations"], ["station"], ["daily"], ["live"]);
      else if (msg.type.startsWith("approval.")) {
        invalidate(queryClient, ["approvals"], ["daily"]);
        if (msg.type === "approval.created") eventsRef.current?.onApprovalCreated?.();
      } else if (msg.type === "export.updated")
        invalidate(queryClient, data.id ? ["export", data.id] : ["export"]);
      else if (msg.type.startsWith("session.") || msg.type.startsWith("clip."))
        invalidate(queryClient, ["package"], ["packages"]);
      else if (msg.type === "return.updated") {
        returns.fire();
        invalidate(queryClient, ["package"], ["daily"]);
      } else if (msg.type === "recon.updated") invalidate(queryClient, ["recon"], ["package"], ["daily"]);
      else if (msg.type === "claim.updated")
        invalidate(
          queryClient,
          ["claims"],
          data.claim_id ? ["claim", data.claim_id] : ["claim"],
          ["package"],
          ["daily"],
        );
      else if (msg.type === "share.updated")
        invalidate(
          queryClient,
          ["shares"],
          data.share_id ? ["share", data.share_id] : ["share"],
          ["package"],
          ["claim"],
        );
      else if (msg.type === "backup.updated") invalidate(queryClient, ["backup"], ["health"], ["daily"]);
      else if (msg.type === "shop.updated") invalidate(queryClient, ["shops"], ["shopsBrief"], ["daily"]);
      else if (msg.type === "evidence_pack.updated" && data.id)
        queryClient.setQueryData(["evidence-pack", data.id], (old: object | undefined) => ({
          ...old,
          ...(msg.data as object),
        }));
    };
    // Nối lại sau khi mất WS: sự kiện trong lúc mất đã lỡ → làm mới ngay D13 + D2 thay vì đợi poll 60 giây (G3 F34b).
    let openedBefore = false;
    const onStatus = (status: WsStatus) => {
      if (status !== "open") return;
      if (openedBefore)
        invalidate(
          queryClient,
          ["approvals"],
          ["daily"],
          ["returns"],
          ["recon"],
          ["claims"],
          ["shares"],
          ["backup"],
          ["shops"],
        );
      openedBefore = true;
    };
    const conn = connectWs({ path: "/ws/dashboard", onMessage, onStatus, socketFactory });
    return () => {
      report.cancel();
      returns.cancel();
      conn.close();
    };
  }, [queryClient, socketFactory]);
}
