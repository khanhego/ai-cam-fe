import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { clipsApi, type ExportLayout } from "@/lib/api/clips";
import { isApiError } from "@/lib/api/errors";
import type { PackageSession } from "@/lib/api/packages";
import { fmtDateTime, shortHash } from "@/shared/format";
import { Alert, Button, Dialog, LinearProgress, SegmentedButtons, toast } from "@/shared/ui";

import { COPY } from "./copy";
import { exportLayouts, exportPoll } from "./exportLayouts";

const C = COPY.exportDialog;
const linkBtn =
  "state-layer inline-flex h-10 items-center justify-center gap-2 rounded-full px-6 text-label-lg font-medium whitespace-nowrap";

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
    queryFn: () => clipsApi.getExport(exportId!),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "READY" || s === "FAILED" ? false : exportPoll.ms;
    },
  });

  const status = job.data?.status;
  const running = create.isPending || (Boolean(exportId) && status !== "READY" && status !== "FAILED");
  const createError = create.error
    ? isApiError(create.error) && create.error.code === "CLIP_NOT_READY"
      ? C.notReady
      : isApiError(create.error) && create.error.code === "CLIP_DELETED"
        ? C.deleted
        : isApiError(create.error)
          ? create.error.message
          : "Có lỗi hệ thống. Thử lại sau ít phút."
    : null;
  const start = () => {
    setExportId(null);
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
      {job.isError && (
        <Alert
          kind="error"
          action={
            <Button variant="elevated" size="sm" onClick={() => job.refetch()}>
              {C.retry}
            </Button>
          }
        >
          {isApiError(job.error) ? job.error.message : "Có lỗi hệ thống. Thử lại sau ít phút."}
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
