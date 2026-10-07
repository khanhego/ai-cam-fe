import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { clipsApi, type ExportLayout } from "@/lib/api/clips";
import { isApiError } from "@/lib/api/errors";
import type { PackageSession } from "@/lib/api/packages";
import { fmtDateTime, shortHash } from "@/shared/format";
import { clipStateError } from "@/shared/media/copy";
import { Alert, Button, Dialog, LinearProgress, SegmentedButtons, toast } from "@/shared/ui";

import { COPY } from "./copy";
import { exportLayouts, exportPoll } from "./exportLayouts";

const C = COPY.exportDialog;
const linkBtn =
  "state-layer inline-flex h-10 items-center justify-center gap-2 rounded-full px-6 text-label-lg font-medium whitespace-nowrap";

/** Lỗi API-43 (02 §6.2): clip đang cắt / cắt lỗi (`details.status`) / đã xóa (`details.deleted_at`). */
function createErrorText(err: unknown): string {
  const state = clipStateError(err);
  if (state?.kind === "pending") return C.notReady;
  if (state?.kind === "failed") return C.clipFailed;
  // item 03: API-43 409 `details.status = MISSING` → `message` server ("Thiếu tệp clip trên máy chủ — …").
  if (state?.kind === "deleted")
    return state.deletedAt ? C.deletedOn(state.deletedAt, state.days) : C.deleted;
  return isApiError(err) ? err.message : C.generic;
}

/**
 * Dialog xuất clip (01 §10.5 D4, FR-07.04, 02.07, UC-03): chọn Cam 1 / Cam 2 / Ghép → API-43 → poll API-44 mỗi 2 giây
 * (WS-02 `export.updated` invalidate thêm) → "Tải file MP4" + "Tải thông tin (JSON)" qua URL ký (API-45).
 */
export function ExportDialog({ session, onClose }: { session: PackageSession; onClose: () => void }) {
  const layouts = exportLayouts(session);
  const [layout, setLayout] = useState<ExportLayout>(
    layouts.includes("SIDE_BY_SIDE") ? "SIDE_BY_SIDE" : (layouts[0] ?? "CAM1"),
  );
  const [exportId, setExportId] = useState<string | null>(null);
  /** API-44 404 (quá 24 giờ / không phải người tạo — 02 v0.3 DEC-57): về bước chọn camera kèm thông báo. */
  const [gone, setGone] = useState(false);

  const create = useMutation({
    mutationFn: (l: ExportLayout) => clipsApi.createExport(session.id, l),
    onSuccess: (job) => setExportId(job.id),
    onError: (err) => {
      if (isApiError(err) && err.code === "FORBIDDEN") {
        toast(err.message);
        onClose();
      }
    },
  });
  const job = useQuery({
    queryKey: ["export", exportId],
    enabled: Boolean(exportId),
    queryFn: async () => {
      try {
        return await clipsApi.getExport(exportId!);
      } catch (e) {
        if (isApiError(e) && e.status === 404) {
          setExportId(null);
          setGone(true);
        }
        throw e;
      }
    },
    // Dừng poll khi READY / FAILED hoặc khi API-44 lỗi (review G3 F14) — "Thử lại" gọi lại tay.
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return q.state.status === "error" || s === "READY" || s === "FAILED" ? false : exportPoll.ms;
    },
  });

  const status = job.data?.status;
  const running =
    create.isPending || (Boolean(exportId) && !job.isError && status !== "READY" && status !== "FAILED");
  const createError = create.error ? createErrorText(create.error) : null;
  const start = () => {
    setExportId(null);
    setGone(false);
    create.mutate(layout);
  };

  const options = layouts.map((l) => [l, C.layouts[l]] as [ExportLayout, string]);

  return (
    <Dialog
      open
      title={C.title}
      onClose={onClose}
      actions={
        !exportId &&
        !create.isPending && (
          <Button onClick={start} disabled={layouts.length === 0}>
            {C.create}
          </Button>
        )
      }
    >
      {!exportId && !create.isPending && (
        <>
          <p className="mb-2 text-label-lg text-on-surface">{C.layout}</p>
          <SegmentedButtons label={C.layout} options={options} value={layout} onChange={setLayout} />
          <p className="mt-3">{C.hint}</p>
          {gone && !createError && (
            <div className="mt-4">
              <Alert kind="warning">{C.gone}</Alert>
            </div>
          )}
          {createError && (
            <div className="mt-4">
              <Alert kind="error">{createError}</Alert>
            </div>
          )}
        </>
      )}
      {running && (
        <div className="flex flex-col gap-2">
          <p className="text-on-surface">
            {C.progress} · {C.layouts[layout]}
            {job.data ? ` · ${job.data.progress}%` : ""}
          </p>
          <LinearProgress value={job.data?.progress ?? 0} label={C.progress} />
        </div>
      )}
      {exportId && job.isError && (
        <Alert
          kind="error"
          action={
            <Button variant="elevated" size="sm" onClick={() => job.refetch()}>
              {C.retry}
            </Button>
          }
        >
          {isApiError(job.error) ? job.error.message : C.generic}
        </Alert>
      )}
      {status === "FAILED" && (
        <Alert
          kind="error"
          action={
            <Button variant="elevated" size="sm" onClick={start}>
              {C.retry}
            </Button>
          }
        >
          {C.failed}
        </Alert>
      )}
      {status === "READY" && job.data?.files && (
        <div className="flex flex-col gap-3">
          <Alert kind="success">{C.ready}</Alert>
          {job.data.sha256 && (
            <p>
              SHA-256{" "}
              <span className="font-mono text-on-surface" title={job.data.sha256}>
                {shortHash(job.data.sha256)}
              </span>
            </p>
          )}
          {job.data.expires_at && (
            <p className="text-body-sm">
              {C.expires} {fmtDateTime(job.data.expires_at)}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <a href={job.data.files.video} download className={`${linkBtn} bg-primary text-on-primary`}>
              <span aria-hidden="true" className="icon" style={{ fontSize: 18 }}>
                download
              </span>
              {C.video}
            </a>
            <a
              href={job.data.files.info}
              download
              className={`${linkBtn} bg-secondary-container text-on-secondary-container`}
            >
              {C.info}
            </a>
          </div>
        </div>
      )}
    </Dialog>
  );
}
