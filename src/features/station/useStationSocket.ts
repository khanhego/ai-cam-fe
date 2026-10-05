import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import type { StationState } from "@/lib/api/station";
import { connectWs, type WsMessage } from "@/lib/ws";

import { useStationStore } from "./stationStore";

/** Mất WS quá 5 giây → S6 (02 WS: "Mất kết nối > 5 giây → station hiện S6"). */
export const WS_LOST_MS = 5000;

export function useStationSocket(socketFactory?: (url: string) => WebSocket) {
  const queryClient = useQueryClient();
  useEffect(() => {
    let lostTimer: ReturnType<typeof setTimeout> | undefined;
    const store = useStationStore.getState;
    const onMessage = (msg: WsMessage) => {
      if (msg.type === "station.state") store().applyState(msg.data as StationState);
      if (msg.type === "session.clip_ready")
        void queryClient.invalidateQueries({ queryKey: ["station", "recent"] });
      if (msg.type === "alert") store().onServerAlert(msg.data as { code: string; tracking_number?: string });
    };
    const conn = connectWs({
      path: "/ws/station",
      onMessage,
      socketFactory,
      // Bộ đếm 5 giây chạy từ lần mất đầu tiên, không bị reset bởi mỗi lần thử nối lại (review M1 #8).
      onStatus: (status) => {
        if (status === "open") {
          clearTimeout(lostTimer);
          lostTimer = undefined;
          store().setWsLost(false);
          void store().load();
        } else if (status === "lost" && lostTimer === undefined) {
          lostTimer = setTimeout(() => store().setWsLost(true), WS_LOST_MS);
        }
      },
    });
    return () => {
      clearTimeout(lostTimer);
      conn.close();
    };
  }, [queryClient, socketFactory]);
}
