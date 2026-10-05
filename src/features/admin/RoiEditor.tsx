import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { isApiError } from "@/lib/api/errors";
import { stationsApi, type Camera, type Roi } from "@/lib/api/stations";
import { Alert, Button, LinearProgress, toast } from "@/shared/ui";

import { ROI_COPY as COPY } from "./copy";
import {
  describeRoi,
  nudgeRoi,
  rectFromPoints,
  ROI_DEFAULT,
  roiValid,
  sameRoi,
  toRatio,
  type Point,
} from "./roi";

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** Ảnh API-63 (cần token → tải Blob rồi tạo object URL, thu hồi khi đổi ảnh / rời trang). */
function useSnapshot(cameraId: string) {
  const query = useQuery({
    queryKey: ["snapshot", cameraId],
    queryFn: () => stationsApi.snapshot(cameraId),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
  const url = useMemo(() => (query.data ? URL.createObjectURL(query.data) : null), [query.data]);
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);
  return { query, url };
}

/**
 * Bước ROI của D6 (01 §10.5, FR-01.04): ảnh Cam 2 (API-63), kéo khung bằng pointer events (chuột, cảm ứng),
 * xuất tỉ lệ 0–1, lưu qua API-64. Bàn phím: mũi tên di chuyển, Shift + mũi tên đổi kích thước (DEC-105).
 * Khung < 5% → khóa nút Lưu; `422 VALIDATION_ERROR` → Alert trên ảnh (02b-admin §5).
 */
export function RoiEditor({ stationId, camera }: { stationId: string; camera: Camera }) {
  const queryClient = useQueryClient();
  const { query: snapshot, url } = useSnapshot(camera.id);
  const boxRef = useRef<HTMLDivElement>(null);
  const start = useRef<Point | null>(null);
  const [draft, setDraft] = useState<Roi | null>(camera.roi);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (roi: Roi) => stationsApi.setRoi(camera.id, roi),
    onSuccess: (saved) => {
      toast(COPY.saved);
      setDraft(saved.roi);
      void queryClient.invalidateQueries({ queryKey: ["station", stationId] });
      void queryClient.invalidateQueries({ queryKey: ["stations"] });
    },
    onError: (e) => {
      // 02 v0.4 (DEC-61): ROI sai → 422 VALIDATION_ERROR (bỏ ROI_INVALID cũ).
      if (isApiError(e) && e.code === "VALIDATION_ERROR") return setError(COPY.invalid);
      setError(isApiError(e) ? e.message : COPY.invalid);
    },
  });

  const point = (e: PointerEvent<HTMLDivElement>) =>
    toRatio(e.clientX, e.clientY, boxRef.current!.getBoundingClientRect());
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = point(e);
    start.current = p;
    setError(null);
    setDraft(rectFromPoints(p, p));
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (start.current) setDraft(rectFromPoints(start.current, point(e)));
  }
  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    setDraft(rectFromPoints(start.current, point(e)));
    start.current = null;
  }

  /** Mũi tên: di chuyển; Shift + mũi tên: đổi kích thước; bước 1% (Alt: 5%). Chưa có khung → khung mặc định. */
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const dir = ARROWS[e.key];
    if (!dir) return;
    e.preventDefault();
    setError(null);
    const step = e.altKey ? 0.05 : 0.01;
    setDraft((cur) =>
      cur ? nudgeRoi(cur, e.shiftKey ? "resize" : "move", dir[0] * step, dir[1] * step) : ROI_DEFAULT,
    );
  }

  const valid = roiValid(draft);
  const changed = !sameRoi(draft, camera.roi);

  return (
    <section className="card p-6" aria-labelledby="roi-title">
      <h2 id="roi-title" className="mb-1 text-title-md">
        {COPY.title}
      </h2>
      <p id="roi-hint" className="mb-4 text-body-md text-on-surface-variant">
        {COPY.hint} {COPY.keyboardHint}
      </p>
      <div className="relative w-full max-w-3xl overflow-hidden rounded-md bg-inverse-surface">
        {error && (
          <div className="pointer-events-none absolute inset-x-2 top-2 z-10">
            <Alert kind="error">{error}</Alert>
          </div>
        )}
        {url ? (
          <div ref={boxRef} className="relative">
            <img src={url} alt={COPY.imgAlt} draggable={false} className="block w-full select-none" />
            <div
              role="application"
              aria-label={COPY.title}
              aria-describedby="roi-hint"
              data-testid="roi-surface"
              tabIndex={0}
              className="absolute inset-0 cursor-crosshair touch-none select-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
              onKeyDown={onKeyDown}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => (start.current = null)}
            >
              {draft && (
                <div
                  data-testid="roi-rect"
                  className={
                    valid
                      ? "absolute border-2 border-primary bg-primary/15"
                      : "absolute border-2 border-dashed border-error bg-error/15"
                  }
                  style={{
                    left: `${draft.x * 100}%`,
                    top: `${draft.y * 100}%`,
                    width: `${draft.w * 100}%`,
                    height: `${draft.h * 100}%`,
                  }}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 p-6 text-center text-inverse-on-surface">
            {snapshot.isFetching ? (
              <>
                <p className="text-body-md">{COPY.loading}</p>
                <div className="w-48">
                  <LinearProgress label={COPY.loading} />
                </div>
              </>
            ) : (
              snapshot.isError && <p className="text-body-md">{COPY.snapshotError}</p>
            )}
          </div>
        )}
      </div>
      <p className="mt-2 text-body-md text-on-surface-variant" aria-live="polite">
        {draft ? `${COPY.current}: ${describeRoi(draft)}` : COPY.none}
        {draft && !valid && <span className="ml-2 text-error">{COPY.tooSmall}</span>}
      </p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button
          variant="outlined"
          icon="photo_camera"
          disabled={snapshot.isFetching}
          onClick={() => void snapshot.refetch()}
        >
          {COPY.retake}
        </Button>
        {changed && (
          <Button
            variant="text"
            onClick={() => {
              setDraft(camera.roi);
              setError(null);
            }}
          >
            {COPY.reset}
          </Button>
        )}
        <Button
          icon="crop_free"
          disabled={!valid || !changed || save.isPending || !url}
          onClick={() => valid && save.mutate(draft)}
        >
          {COPY.save}
        </Button>
      </div>
    </section>
  );
}
