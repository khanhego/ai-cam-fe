import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { stationApi, type RecentSession, type StationState } from "@/lib/api/station";
import { ClipPlayer } from "@/shared/media/ClipPlayer";
import { Alert, Button, Dialog, Icon, Skeleton, StatusChip } from "@/shared/ui";

import { cameraName, COPY } from "./copy";
import { StationStatePanel } from "./StationStatePanel";

const time = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(iso));

function RecentList({ onView }: { onView: (s: RecentSession) => void }) {
  const recent = useQuery({ queryKey: ["station", "recent"], queryFn: stationApi.recent });
  if (recent.isPending) return <Skeleton lines={5} className="h-10" />;
  if (recent.isError) return null;
  if (recent.data.items.length === 0) return <p className="text-body-lg">{COPY.recent.empty}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {recent.data.items.map((s) => {
        const cutting = s.clips.length === 0 || s.clips.some((c) => c.status === "PENDING");
        return (
          <li
            key={s.id}
            className="flex items-center gap-3 rounded-md bg-surface-container-lowest px-4 py-2 text-on-surface"
          >
            <span className="tabular-nums text-body-lg">{time(s.ended_at ?? s.started_at)}</span>
            <span className="flex-1 font-mono text-body-lg">{s.tracking_number}</span>
            {cutting ? (
              <StatusChip tone="warning" icon="autorenew">
                {COPY.recent.cutting}
              </StatusChip>
            ) : (
              <Button variant="tonal" icon="play_arrow" onClick={() => onView(s)}>
                {COPY.recent.view}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** S1 — Sẵn sàng (01 §10.4). */
export function ReadyPanel({
  state,
  notice,
  onDismissNotice,
}: {
  state: StationState;
  notice: string | null;
  onDismissNotice: () => void;
}) {
  const [viewing, setViewing] = useState<RecentSession | null>(null);
  const offline = state.cameras.filter((c) => c.status === "OFFLINE");
  return (
    <StationStatePanel tone="success" icon="qr_code_scanner" title={COPY.ready.title}>
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
        <div>
          <h2 className="mb-3 text-title-lg">{COPY.recent.title}</h2>
          <RecentList onView={setViewing} />
        </div>
      </div>
      <Dialog
        open={viewing !== null}
        title={viewing?.tracking_number ?? ""}
        onClose={() => setViewing(null)}
        wide
      >
        {viewing && <ClipPlayer clips={viewing.clips} />}
      </Dialog>
    </StationStatePanel>
  );
}
