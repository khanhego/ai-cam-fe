import type { StationState } from "@/lib/api/station";
import { Button, TrackingNumber } from "@/shared/ui";

import { COPY } from "./copy";
import { StationStatePanel } from "./StationStatePanel";
import { mmss, useServerNow } from "./useServerClock";

/** S5 — Chờ quản lý duyệt (01 §10.4, DEC-5). */
export function WaitingApprovalPanel({ state, onWithdraw }: { state: StationState; onWithdraw: () => void }) {
  const request = state.approval_request!;
  const now = useServerNow();
  return (
    <StationStatePanel
      tone="warning"
      icon="schedule"
      title={COPY.waiting.title}
      aside={
        <span className="text-title-lg tabular-nums">
          {COPY.waiting.waited}{" "}
          <span className="font-mono">{mmss(now - Date.parse(request.created_at))}</span>
        </span>
      }
    >
      <p className="text-headline-md">{COPY.waiting.reason[request.type]}</p>
      <TrackingNumber value={request.tracking_number} size="display" copy={false} />
      <p className="text-title-lg">{COPY.waiting.hint}</p>
      <div className="mt-auto">
        <Button variant="elevated" className="h-14 px-8" onClick={onWithdraw}>
          {COPY.waiting.withdraw}
        </Button>
      </div>
    </StationStatePanel>
  );
}
