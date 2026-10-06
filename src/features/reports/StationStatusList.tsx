import type { DailyStation } from "@/lib/api/reports";
import { fmtTime } from "@/shared/format";
import { CAMERA_ROLE, STATION_STATE } from "@/shared/labels";
import { StatusChip } from "@/shared/ui";

import { COPY } from "./copy";

/**
 * Khối Station của D2: tên, chip camera, chế độ "Nhận hoàn" + người kiểm (item 02), trạng thái hiện tại ("Đang kiểm
 * hoàn" + mã kiện), lần quét gần nhất (01 §10.5).
 */
export function StationStatusList({ stations }: { stations: DailyStation[] }) {
  if (stations.length === 0) return <p className="text-body-md text-on-surface-variant">{COPY.noStations}</p>;
  return (
    <ul className="flex flex-col divide-y divide-outline-variant">
      {stations.map((s) => {
        const [label, tone] = STATION_STATE[s.state] ?? ["—", "neutral"];
        return (
          <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
            <span className="min-w-28 text-title-sm text-on-surface">{s.name}</span>
            <span className="flex flex-wrap gap-1">
              {s.cameras.length === 0 && <StatusChip>{COPY.noCamera}</StatusChip>}
              {s.cameras.map((c) =>
                c.status === "ONLINE" ? (
                  <StatusChip key={c.role} tone="success" icon="check_circle">
                    {CAMERA_ROLE[c.role]}
                  </StatusChip>
                ) : (
                  <StatusChip key={c.role} tone="error" icon="videocam_off" title="Mất tín hiệu">
                    {CAMERA_ROLE[c.role]} mất tín hiệu
                  </StatusChip>
                ),
              )}
            </span>
            {s.work_mode === "RETURN" && <StatusChip tone="info">{COPY.workMode.RETURN}</StatusChip>}
            {s.operator_name && (
              <span className="text-body-sm text-on-surface-variant">{COPY.operator(s.operator_name)}</span>
            )}
            <StatusChip tone={tone}>{label}</StatusChip>
            {s.tracking_number && (
              <span className="font-mono text-body-sm text-on-surface">{s.tracking_number}</span>
            )}
            <span className="ml-auto text-body-sm text-on-surface-variant tabular-nums">
              {COPY.lastScan} {fmtTime(s.last_scan_at)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
