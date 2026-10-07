import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { settingsApi, type ComponentStatus } from "@/lib/api/settings";
import { fmtDateTime } from "@/shared/format";
import { CAMERA_ROLE } from "@/shared/labels";
import { Alert, Button, LinearProgress, Skeleton, StatusChip } from "@/shared/ui";

import { useAuth } from "../auth/useAuth";

import { backupHealth, type BackupHealth } from "./backupHealth";
import { COPY } from "./copy";
import { fmtBytes } from "./rules";

const H = COPY.health;
/** Ngưỡng cảnh báo ổ (01 §10.5 D8, 02 API-32 `DISK_USAGE`). */
const DISK_WARN = 80;
/** Lệch giờ camera > 1 giây là cảnh báo (BR-15, FR-01.06). */
const DRIFT_WARN_MS = 1000;

function Service({ label, status }: { label: string; status: ComponentStatus }) {
  return (
    <li className="flex items-center justify-between gap-2 py-2">
      <span className="text-body-md text-on-surface">{label}</span>
      {status === "OK" ? (
        <StatusChip tone="success" icon="check_circle">
          {H.ok}
        </StatusChip>
      ) : (
        <StatusChip tone="error" icon="error">
          {H.error}
        </StatusChip>
      )}
    </li>
  );
}

function BackupRow({ backup }: { backup: BackupHealth }) {
  const isAdmin = useAuth((st) => st.me?.role === "ADMIN");
  const v = backupHealth(backup);
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 py-2">
      <span className="flex-1 text-body-md text-on-surface">{v.text ?? H.backupNoRun}</span>
      <StatusChip tone={v.tone}>{v.chip}</StatusChip>
      {isAdmin && (
        <Link to="/admin/settings/backup" className="md-link text-label-lg">
          {H.backupOpen}
        </Link>
      )}
    </div>
  );
}

/** Khối sức khỏe D8 (API-81, làm mới 30 giây — 02b-admin §4). */
export function HealthPanel() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: settingsApi.health,
    refetchInterval: 30_000,
  });
  const d = health.data;
  return (
    <section aria-label={H.title} className="card p-4 sm:p-6">
      <h2 className="mb-1 text-title-md text-on-surface">{H.title}</h2>
      <p className="mb-4 text-body-sm text-on-surface-variant">{H.refresh}</p>
      {health.isPending && <Skeleton lines={5} className="h-6" />}
      {health.isError && (
        <Alert
          kind="error"
          action={
            <Button variant="text" onClick={() => health.refetch()}>
              {COPY.retry}
            </Button>
          }
        >
          {H.loadError}
        </Alert>
      )}
      {d && (
        <>
          <h3 className="mb-2 text-title-sm text-on-surface">{H.disk}</h3>
          {d.disk ? (
            <div className="mb-6">
              {d.disk.percent >= DISK_WARN && <Alert kind="warning">{H.diskWarn(d.disk.percent)}</Alert>}
              <LinearProgress
                value={d.disk.percent}
                label={H.disk}
                tone={d.disk.percent >= DISK_WARN ? "error" : "primary"}
              />
              <p className="mt-2 text-body-sm text-on-surface-variant tabular-nums">
                {H.diskUsed(fmtBytes(d.disk.used_bytes), fmtBytes(d.disk.total_bytes), d.disk.percent)}
              </p>
            </div>
          ) : (
            <p className="mb-6 text-body-md text-on-surface-variant">{H.diskUnknown}</p>
          )}

          <h3 className="text-title-sm text-on-surface">{H.services}</h3>
          <ul className="mb-6 divide-y divide-outline-variant">
            <Service label={H.db} status={d.db} />
            <Service label={H.redis} status={d.redis} />
            <Service label={H.mediamtx} status={d.mediamtx} />
          </ul>

          <h3 className="text-title-sm text-on-surface">{H.cameras}</h3>
          {d.cameras.length === 0 ? (
            <p className="mb-6 py-2 text-body-md text-on-surface-variant">{H.noCameras}</p>
          ) : (
            <ul className="mb-6 divide-y divide-outline-variant" aria-label={H.cameras}>
              {d.cameras.map((c) => {
                const drift = c.clock_offset_ms;
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="flex-1 text-body-md text-on-surface">
                      {c.station_name} · {CAMERA_ROLE[c.role]}
                    </span>
                    <span
                      className={
                        drift !== null && Math.abs(drift) > DRIFT_WARN_MS
                          ? "text-body-sm text-error"
                          : "text-body-sm text-on-surface-variant"
                      }
                    >
                      {drift === null ? H.noOffset : H.offset(drift)}
                    </span>
                    {c.status === "ONLINE" ? (
                      <StatusChip tone="success">{H.online}</StatusChip>
                    ) : (
                      <StatusChip tone="error" icon="videocam_off">
                        {H.offline}
                      </StatusChip>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {d.backup && (
            <>
              <h3 className="text-title-sm text-on-surface">{H.backup}</h3>
              <BackupRow backup={d.backup} />
            </>
          )}

          <h3 className="text-title-sm text-on-surface">{H.sync}</h3>
          {d.sync.length === 0 ? (
            <p className="py-2 text-body-md text-on-surface-variant">{H.noSync}</p>
          ) : (
            <ul className="divide-y divide-outline-variant">
              {d.sync.map((s) => (
                <li key={s.shop_id} className="py-2 text-body-md text-on-surface">
                  {H.lastSuccess(fmtDateTime(s.last_success_at))}
                  {s.last_error && <p className="text-body-sm text-error">{H.syncError}</p>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
