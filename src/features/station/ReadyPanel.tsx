import type { ReactNode } from "react";

import type { StationState } from "@/lib/api/station";
import { Alert, Button, Icon } from "@/shared/ui";

import { cameraName, COPY } from "./copy";
import { RecentSessions } from "./RecentSessions";
import { StationStatePanel } from "./StationStatePanel";

/** S1 — Sẵn sàng (01 §10.4). Item 02: nút "Chuyển sang nhận hàng hoàn" (station "Cả hai"), thông báo sau đóng. */
export function ReadyPanel({
  state,
  notice,
  onDismissNotice,
  closedNotice,
  onSwitchMode,
}: {
  state: StationState;
  notice: string | null;
  onDismissNotice: () => void;
  /** Thông báo cờ của phiên vừa đóng (FR-03.14). */
  closedNotice?: ReactNode;
  /** Có → hiện nút đổi chế độ (chỉ station "Cả hai" khi rảnh). */
  onSwitchMode?: () => void;
}) {
  const offline = state.cameras.filter((c) => c.status === "OFFLINE");
  return (
    <StationStatePanel tone="success" icon="qr_code_scanner" title={COPY.ready.title}>
      {closedNotice}
      {notice && (
        <Alert
          kind="warning"
          action={
            <Button variant="text" onClick={onDismissNotice}>
              Đóng
            </Button>
          }
        >
          {notice}
        </Alert>
      )}
      {offline.map((c) => (
        <Alert key={c.role} kind="error">
          {COPY.camera.alert(cameraName(c.role))}
        </Alert>
      ))}
      <div className="grid flex-1 gap-8 lg:grid-cols-[1fr_minmax(0,28rem)]">
        <div className="flex flex-col items-center justify-center gap-4 text-center">
          <Icon name="qr_code_scanner" size={96} />
          <p className="text-headline-md">{COPY.ready.hint}</p>
          <p className="text-title-lg tabular-nums">{COPY.ready.today(state.today_count)}</p>
        </div>
        <RecentSessions type="PACK" empty={COPY.recent.empty} />
      </div>
      {onSwitchMode && (
        <div className="flex justify-end">
          <Button variant="elevated" icon="assignment_return" className="h-14 px-8" onClick={onSwitchMode}>
            {COPY.workMode.toReturn}
          </Button>
        </div>
      )}
    </StationStatePanel>
  );
}
