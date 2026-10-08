import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { SnapshotStrip } from "@/shared/media/SnapshotStrip";
import { useScanListener } from "@/shared/scan/useScanListener";
import { Skeleton } from "@/shared/ui";

import { AlertOverlay } from "./AlertOverlay";
import { ClosedNotice } from "./ClosedNotice";
import { COPY } from "./copy";
import { DisconnectedOverlay } from "./DisconnectedOverlay";
import { MismatchPanel } from "./MismatchPanel";
import { PackingPanel } from "./PackingPanel";
import { ReadyPanel } from "./ReadyPanel";
import { ForceNewDialog } from "./returns/ForceNewDialog";
import { InspectingPanel } from "./returns/InspectingPanel";
import { OperatorDialog } from "./returns/OperatorDialog";
import { PackReferenceCard } from "./returns/PackReferenceCard";
import { ReturnLookupDialog } from "./returns/ReturnLookupDialog";
import { ReturnReadyPanel } from "./returns/ReturnReadyPanel";
import { canSwitchMode, needsOperator, selectPanel } from "./selectPanel";
import { StationStatusBar } from "./StationStatusBar";
import { resetStationStore, useStationStore } from "./stationStore";
import { StationStatePanel } from "./StationStatePanel";
import { useStationSocket } from "./useStationSocket";
import { WaitingApprovalPanel } from "./WaitingApprovalPanel";

export const BLOCKED_RETRY_MS = 30_000;
/** API-103 tối đa 20 ảnh mỗi phiên (FR-04.04). */
const SNAPSHOT_MAX = 20;

/**
 * `/station` — một trang, chọn panel theo `state` của server (DEC-18). Quét bằng máy quét HID.
 * Thứ tự ưu tiên: mất kết nối (S6) → cảnh báo vừa quét (S4 / R4) → `selectPanel(state)` (S1, S2, S3, S5, R1, R2).
 * R5 (người kiểm) là Dialog trên R1 — bắt buộc khi chế độ nhận hoàn chưa có tên (02b-station §2). Item 03: R5 cả ở chế
 * độ đóng gói ("Người đóng gói") — mở từ thanh trạng thái hoặc khi quét bị `OPERATOR_REQUIRED` (DEC-481).
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
  const returned = s.state?.today_return_count;
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ["station", "recent"] });
  }, [completed, returned, queryClient]);

  // Bàn hoàn có ô nhập (ghi chú, tên người kiểm, tìm thủ công): lần quét HID không lọt vào ô (DEC-237).
  useScanListener((code) => void s.scan(code), {
    enabled: !offline && !s.blocked,
    captureInInputs: s.state?.station.work_mode === "RETURN",
  });
  // R3 chỉ trên R1: state rời READY (quét mở phiên, phiên khác) → đóng (DEC-325).
  const ready = s.state?.state === "READY";
  useEffect(() => {
    if (!ready) useStationStore.getState().closeLookup();
  }, [ready]);
  // F2 chụp ảnh chỉ ở R2 (DEC-237): phím chức năng, máy quét HID không gửi — nghe riêng, kể cả khi đang gõ ghi chú.
  const inspecting = !offline && !s.alert && s.state?.state === "INSPECTING";
  useEffect(() => {
    if (!inspecting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F2") return;
      e.preventDefault();
      // Giữ phím (auto-repeat) không chụp hàng loạt; có Dialog mở (hủy phiên, R3, R5, kiện khác, clip…) thì F2 không
      // chụp sau lưng Dialog (G3-F19, DEC-331).
      if (e.repeat || document.querySelector("dialog[open]")) return;
      void useStationStore.getState().takeSnapshot();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inspecting]);
  const operatorRequired = needsOperator(s.state);

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
        onLookup={(code) => s.openLookup(code)}
        onOpenUnidentified={(code) => void s.openReturnSession({ unidentified_code: code })}
        onRecordOther={(code) => s.openForceNew(code)}
        onDismiss={s.dismissAlert}
      />
    );
  else {
    const panel = selectPanel(s.state);
    const closedNotice = <ClosedNotice closed={s.closedNotice} onDismiss={s.dismissClosedNotice} />;
    const switchable = canSwitchMode(s.state);
    if (panel === "S2") body = <PackingPanel state={s.state} onCallManager={callManager} />;
    else if (panel === "S3") body = <MismatchPanel state={s.state} onCallManager={callManager} />;
    else if (panel === "S5")
      body = <WaitingApprovalPanel state={s.state} onWithdraw={() => void s.withdrawApproval()} />;
    else if (panel === "R2")
      body = (
        <InspectingPanel
          state={s.state}
          inline={s.inline}
          onCallManager={callManager}
          aside={
            <PackReferenceCard
              reference={s.state.session?.pack_reference ?? null}
              onImageExpired={s.refreshMedia}
            />
          }
          snapshots={
            <SnapshotStrip
              snapshots={s.state.session?.snapshots ?? []}
              max={s.snapshotLimit ? 0 : SNAPSHOT_MAX}
              label={COPY.returns.inspecting.snapshots.replace(":", "")}
              captureLabel={COPY.returns.inspecting.capture}
              limitLabel={COPY.returns.inspecting.snapshotLimit}
              capturing={s.capturing}
              onCapture={() => void s.takeSnapshot()}
              onExpired={s.refreshMedia}
            />
          }
        />
      );
    else if (panel === "R1")
      body = (
        <ReturnReadyPanel
          state={s.state}
          notice={s.notice}
          onDismissNotice={s.dismissNotice}
          closedNotice={closedNotice}
          onLookup={() => s.openLookup("")}
          onSwitchMode={switchable ? () => void s.setWorkMode("PACK") : undefined}
        />
      );
    else
      body = (
        <ReadyPanel
          state={s.state}
          notice={s.notice}
          onDismissNotice={s.dismissNotice}
          closedNotice={closedNotice}
          onSwitchMode={switchable ? () => void s.setWorkMode("RETURN") : undefined}
        />
      );
  }

  return (
    <div className="flex h-screen flex-col bg-surface">
      <StationStatusBar state={s.state} online={!offline} onChangeOperator={s.openOperator} />
      {s.busy && <div className="h-1 bg-primary/40" aria-hidden />}
      {body}
      {s.state && !offline && !s.blocked && (
        <OperatorDialog
          open={operatorRequired || s.operatorOpen}
          mode={s.state.station.work_mode}
          required={operatorRequired}
          current={s.state.station.operator_name}
          onSubmit={s.setOperator}
          onClose={s.closeOperator}
          onSwitchToPack={
            operatorRequired && canSwitchMode(s.state) ? () => void s.setWorkMode("PACK") : undefined
          }
        />
      )}
      {s.state?.station.work_mode === "RETURN" && !offline && !s.blocked && !operatorRequired && (
        <>
          <ReturnLookupDialog
            open={s.lookup !== null && s.state.state === "READY"}
            initialQuery={s.lookup?.query ?? ""}
            busy={s.busy}
            onOpen={(body) => void s.openReturnSession(body)}
            onClose={s.closeLookup}
          />
          <ForceNewDialog
            code={s.forceNew?.code ?? null}
            onSubmit={(note) =>
              s.openReturnSession({ unidentified_code: s.forceNew!.code, force_new: true, note })
            }
            onClose={s.closeForceNew}
          />
        </>
      )}
    </div>
  );
}
