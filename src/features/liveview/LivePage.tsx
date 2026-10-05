import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import { liveApi, type LiveStation } from "@/lib/api/live";
import { CAMERA_ROLE } from "@/shared/labels";
import { Alert, Button, cx, EmptyState, PageHeader, SegmentedButtons } from "@/shared/ui";

import { CameraTile } from "./CameraTile";
import { COPY } from "./copy";

const LIVE_KEY = ["live"] as const;

function StationGrid({
  station,
  zoomed,
  onRefresh,
}: {
  station: LiveStation;
  zoomed: boolean;
  onRefresh: () => void;
}) {
  const headingId = `live-${station.id}`;
  const cameras = [...station.cameras].sort((a, b) => a.role.localeCompare(b.role));
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-title-md text-on-surface">
        {station.name}
      </h2>
      {cameras.length === 0 ? (
        <p className="text-body-md text-on-surface-variant">{COPY.noCamera}</p>
      ) : (
        <div className={cx("grid gap-4", zoomed ? "grid-cols-1" : "md:grid-cols-2")}>
          {cameras.map((cam) => (
            // Đổi trạng thái camera (WS `camera.status` → API-65) → mount lại ô, nối lại WHEP.
            <CameraTile
              key={`${cam.id}-${cam.status}`}
              camera={cam}
              label={`${station.name} · ${CAMERA_ROLE[cam.role]}`}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function LoadingGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex aspect-video items-center justify-center rounded-md bg-inverse-surface"
          role="progressbar"
          aria-label={COPY.connecting}
        >
          <span className="h-8 w-8 animate-spin rounded-full border-4 border-inverse-on-surface/30 border-t-inverse-on-surface" />
        </div>
      ))}
    </div>
  );
}

/** D11 — Live view (01 §10.5, FR-01.05): lưới camera theo station qua WHEP (API-65). ADMIN, SUPERVISOR. */
export default function LivePage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const live = useQuery({ queryKey: LIVE_KEY, queryFn: liveApi.list, refetchInterval: 30_000 });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: LIVE_KEY });
  const stations = live.data?.stations ?? [];
  const selectedId = params.get("station") ?? "";
  const selected = stations.find((s) => s.id === selectedId);
  const shown = selected ? [selected] : stations;
  const cameraCount = stations.reduce((n, s) => n + s.cameras.length, 0);

  return (
    <>
      <PageHeader title={COPY.title} subtitle={COPY.subtitle} />
      {live.isPending ? (
        <LoadingGrid />
      ) : live.isError ? (
        <Alert
          kind="error"
          action={
            <Button variant="elevated" size="sm" onClick={() => void live.refetch()}>
              {COPY.retry}
            </Button>
          }
        >
          {COPY.error}
        </Alert>
      ) : cameraCount === 0 ? (
        <EmptyState icon="videocam_off" title={COPY.empty}>
          {COPY.emptyHint}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {stations.length > 1 && (
            <div className="overflow-x-auto">
              <SegmentedButtons
                label={COPY.pick}
                value={selected ? selected.id : ""}
                onChange={(id) => setParams(id ? { station: id } : {}, { replace: true })}
                options={[["", COPY.all], ...stations.map((s): [string, string] => [s.id, s.name])]}
              />
            </div>
          )}
          {shown.map((st) => (
            <StationGrid key={st.id} station={st} zoomed={!!selected} onRefresh={refresh} />
          ))}
        </div>
      )}
    </>
  );
}
