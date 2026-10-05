import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { useScanListener } from "@/shared/scan/useScanListener";
import { Skeleton } from "@/shared/ui";

import { AlertOverlay } from "./AlertOverlay";
import { COPY } from "./copy";
import { DisconnectedOverlay } from "./DisconnectedOverlay";
import { MismatchPanel } from "./MismatchPanel";
import { PackingPanel } from "./PackingPanel";
import { ReadyPanel } from "./ReadyPanel";
import { StationStatusBar } from "./StationStatusBar";
import { resetStationStore, useStationStore } from "./stationStore";
import { StationStatePanel } from "./StationStatePanel";
import { useStationSocket } from "./useStationSocket";
import { WaitingApprovalPanel } from "./WaitingApprovalPanel";

export const BLOCKED_RETRY_MS = 30_000;

/**
 * `/station` — một trang, chọn panel theo `state` của server (DEC-18). Quét bằng máy quét HID.
 * Thứ tự ưu tiên: mất kết nối (S6) → cảnh báo vừa quét (S4) → state (S1, S2, S3, S5).
 */
export default function StationPage({ socketFactory }: { socketFactory?: (url: string) => WebSocket } = {}) {
  const queryClient = useQueryClient();
  const s = useStationStore();
  const offline = s.disconnected || s.wsLost;

  useEffect(() => {
    void s.load();
    // Rời trang (đăng xuất, hết phiên): không để âm báo lỗi lặp, cảnh báo, hàng đợi quét sót lại (review M1 #10).
    return resetStationStore;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tải state một lần khi vào trang
  }, []);
  // Station bị tắt: thử lại định kỳ để tự về S1 khi Admin bật lại.
  useEffect(() => {
    if (!s.blocked) return;
    const id = setInterval(() => void useStationStore.getState().load(), BLOCKED_RETRY_MS);
    return () => clearInterval(id);
  }, [s.blocked]);
  useStationSocket(socketFactory);

  const completed = s.state?.today_count;
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ["station", "recent"] });
  }, [completed, queryClient]);

  useScanListener((code) => void s.scan(code), { enabled: !offline && !s.blocked });

  const callManager = () => void s.requestApproval(s.state?.state === "MISMATCH" ? "MISMATCH" : "ASSIST");

  let body;
  if (offline) body = <DisconnectedOverlay />;
  else if (s.blocked)
    body = (
      <StationStatePanel tone="error" icon="block" title={COPY.inactive.title}>
        <p className="text-headline-md">{s.blocked}</p>
        <p className="text-title-lg">{COPY.inactive.hint}</p>
      </StationStatePanel>
    );
  else if (!s.state)
    body = (
      <div className="p-8">
        <Skeleton lines={6} className="h-8" />
      </div>
    );
  else if (s.alert)
    body = (
      <AlertOverlay
        alert={s.alert}
        code={s.lastCode}
        onRequestRepack={(code) => void s.requestApproval("REPACK", code)}
      />
    );
  else if (s.state.state === "PACKING") body = <PackingPanel state={s.state} onCallManager={callManager} />;
  else if (s.state.state === "MISMATCH") body = <MismatchPanel state={s.state} onCallManager={callManager} />;
  else if (s.state.state === "WAITING_APPROVAL")
    body = <WaitingApprovalPanel state={s.state} onWithdraw={() => void s.withdrawApproval()} />;
  else body = <ReadyPanel state={s.state} notice={s.notice} onDismissNotice={s.dismissNotice} />;

  return (
    <div className="flex h-screen flex-col bg-surface">
      <StationStatusBar state={s.state} online={!offline} />
      {s.busy && <div className="h-1 bg-primary/40" aria-hidden />}
      {body}
    </div>
  );
}
