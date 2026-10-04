import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { connectWs, type WsMessage } from "@/lib/ws";

/**
 * WS-02 cho dashboard (02b-admin §4): sự kiện chỉ để invalidate query, không giữ state song song.
 * `camera.status` → làm mới D6 (danh sách station, trang sửa station).
 */
export function useDashboardSocket(socketFactory?: (url: string) => WebSocket) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const onMessage = (msg: WsMessage) => {
      if (msg.type === "camera.status") {
        void queryClient.invalidateQueries({ queryKey: ["stations"] });
        void queryClient.invalidateQueries({ queryKey: ["station"] });
      }
    };
    const conn = connectWs({ path: "/ws/dashboard", onMessage, socketFactory });
    return () => conn.close();
  }, [queryClient, socketFactory]);
}
