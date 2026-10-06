import type { ReactNode } from "react";

import type { StationState } from "@/lib/api/station";
import { Alert, Button, Icon } from "@/shared/ui";

import { cameraName, COPY } from "../copy";
import { RecentSessions } from "../RecentSessions";
import { StationStatePanel } from "../StationStatePanel";

/** R1 — Sẵn sàng nhận hoàn (01 §10.4, FR-04.01, 04.10, 01.07). Nền `success-container` như S1. */
export function ReturnReadyPanel({
  state,
  notice,
  onDismissNotice,
  closedNotice,
  onLookup,
  onSwitchMode,
}: {
  state: StationState;
  notice: string | null;
  onDismissNotice: () => void;
  /** Kết quả phiên vừa đóng (`ClosedNotice`). */
  closedNotice?: ReactNode;
  onLookup: () => void;
  /** Có → nút "Chuyển sang đóng gói" (station "Cả hai" khi rảnh). */
  onSwitchMode?: () => void;
}) {
  const offline = state.cameras.filter((c) => c.status === "OFFLINE");
  const r = COPY.returns.ready;
  return (
    <StationStatePanel tone="success" icon="assignment_return" title={r.title}>
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
          {r.cameraAlert(cameraName(c.role))}
        </Alert>
      ))}
      <div className="grid flex-1 gap-8 lg:grid-cols-[1fr_minmax(0,28rem)]">
        <div className="flex flex-col items-center justify-center gap-4 text-center">
          <Icon name="assignment_return" size={64} />
          <p className="text-headline-md">{r.hint}</p>
          <p className="text-title-lg">{r.hintCodes}</p>
          <p className="text-title-lg tabular-nums">
            {r.today(state.today_return_count ?? 0, state.today_return_issue_count ?? 0)}
          </p>
        </div>
        <RecentSessions type="RETURN" empty={r.empty} />
      </div>
      <div className="flex flex-wrap justify-between gap-6">
        <Button variant="elevated" icon="search" className="h-14 px-8" onClick={onLookup}>
          {r.lookup}
        </Button>
        {onSwitchMode && (
          <Button variant="elevated" icon="package_2" className="h-14 px-8" onClick={onSwitchMode}>
            {COPY.workMode.toPack}
          </Button>
        )}
      </div>
    </StationStatePanel>
  );
}
