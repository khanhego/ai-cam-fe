import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { stationApi, type RecentSession, type SessionType } from "@/lib/api/station";
import { ClipPlayer } from "@/shared/media/ClipPlayer";
import { CONCLUSION_LABEL, conclusionTone } from "@/shared/returns/inspection";
import { Button, Dialog, Skeleton, StatusChip } from "@/shared/ui";

import { COPY } from "./copy";

const time = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(iso));

/**
 * "Phiên gần đây" (API-15) ở S1 / R1 — lọc theo loại phiên của panel (station "Cả hai" có cả hai loại, DEC-322).
 * R1 thêm chip kết luận + mã hồ sơ khiếu nại (01 §10.4 R1).
 */
export function RecentSessions({ type, empty }: { type: SessionType; empty: string }) {
  const [viewing, setViewing] = useState<RecentSession | null>(null);
  const recent = useQuery({ queryKey: ["station", "recent"], queryFn: stationApi.recent });
  let body;
  if (recent.isPending) body = <Skeleton lines={5} className="h-10" />;
  else if (recent.isError) body = null;
  else {
    // API-15 trước item 02 không có `type` → coi là PACK.
    const items = recent.data.items.filter((s) => (s.type ?? "PACK") === type);
    body =
      items.length === 0 ? (
        <p className="text-body-lg">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((s) => {
            const cutting = s.clips.length === 0 || s.clips.some((c) => c.status === "PENDING");
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-3 rounded-md bg-surface-container-lowest px-4 py-2 text-on-surface"
              >
                <span className="tabular-nums text-body-lg">{time(s.ended_at ?? s.started_at)}</span>
                <span className="flex-1 font-mono text-body-lg">{s.tracking_number}</span>
                {type === "RETURN" && s.conclusion && (
                  <StatusChip tone={conclusionTone(s.conclusion)}>
                    {CONCLUSION_LABEL[s.conclusion]}
                  </StatusChip>
                )}
                {s.claim_code && <span className="font-mono text-body-md">{s.claim_code}</span>}
                {cutting ? (
                  <StatusChip tone="warning" icon="autorenew">
                    {COPY.recent.cutting}
                  </StatusChip>
                ) : (
                  <Button variant="tonal" icon="play_arrow" onClick={() => setViewing(s)}>
                    {COPY.recent.view}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      );
  }
  return (
    <div>
      <h2 className="mb-3 text-title-lg">{COPY.recent.title}</h2>
      {body}
      <Dialog
        open={viewing !== null}
        title={viewing?.tracking_number ?? ""}
        onClose={() => setViewing(null)}
        wide
      >
        {viewing && <ClipPlayer clips={viewing.clips} />}
      </Dialog>
    </div>
  );
}
