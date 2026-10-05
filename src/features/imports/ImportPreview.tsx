import type { ImportPreview as Preview } from "@/lib/api/imports";
import { fmtHourMinute } from "@/shared/format";
import { Alert, Button, StatusChip } from "@/shared/ui";

import { columnLabel, COPY } from "./copy";
import { importable } from "./rules";

const ACTION_TONE = { NEW: "primary", UPDATE: "info", SKIP: "neutral" } as const;

/**
 * Bước xem trước của D5: bộ đếm, bảng lỗi (khóa nút Nhập — EX-P11) hoặc 20 dòng đầu.
 * Nút Nhập bị khóa khi có lỗi hoặc không còn đơn nào để nhập.
 */
export function ImportPreview({
  preview,
  committing,
  onCommit,
  onCancel,
}: {
  preview: Preview;
  committing: boolean;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const hasErrors = preview.counts.error > 0;
  const n = importable(preview);
  return (
    <section aria-label={COPY.previewOf(preview.file_name)} className="card p-4 sm:p-6">
      <h2 className="mb-1 text-title-md text-on-surface">{COPY.previewOf(preview.file_name)}</h2>
      <p className="mb-4 text-body-md text-on-surface tabular-nums">{COPY.counts(preview.counts)}</p>

      {hasErrors ? (
        <>
          <Alert kind="error">{COPY.hasErrors(preview.counts.error)}</Alert>
          <h3 className="mb-2 text-title-sm text-on-surface">{COPY.errorsTitle}</h3>
          <div className="mb-4 overflow-x-auto">
            <table className="md-table" aria-label={COPY.errorsTitle}>
              <thead>
                <tr>
                  <th>{COPY.col.row}</th>
                  <th>{COPY.col.column}</th>
                  <th>{COPY.col.reason}</th>
                </tr>
              </thead>
              <tbody>
                {preview.errors.map((e, i) => (
                  <tr key={`${e.row}-${e.column}-${i}`}>
                    <td className="tabular-nums">{e.row}</td>
                    <td>{columnLabel(e.column)}</td>
                    <td>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          {n === 0 && <Alert kind="info">{COPY.nothingToImport}</Alert>}
          <h3 className="mb-2 text-title-sm text-on-surface">{COPY.sampleTitle}</h3>
          <div className="mb-4 overflow-x-auto">
            <table className="md-table" aria-label={COPY.sampleTitle}>
              <thead>
                <tr>
                  <th>{COPY.col.row}</th>
                  <th>{COPY.col.tracking}</th>
                  <th>{COPY.col.order}</th>
                  <th>{COPY.col.product}</th>
                  <th>{COPY.col.variation}</th>
                  <th className="text-right">{COPY.col.quantity}</th>
                  <th>{COPY.col.result}</th>
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((r) => (
                  <tr key={r.row}>
                    <td className="tabular-nums">{r.row}</td>
                    <td className="font-mono">{r.tracking_number}</td>
                    <td className="font-mono">{r.platform_order_sn}</td>
                    <td>{r.product_name}</td>
                    <td>{r.variation ?? "—"}</td>
                    <td className="text-right tabular-nums">{r.quantity}</td>
                    <td>
                      <StatusChip tone={ACTION_TONE[r.action]}>{COPY.action[r.action]}</StatusChip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {!hasErrors && (
          <span className="mr-auto text-body-sm text-on-surface-variant">
            {COPY.expiresAt(fmtHourMinute(preview.expires_at))}
          </span>
        )}
        <Button variant="text" onClick={onCancel} disabled={committing}>
          {COPY.chooseOther}
        </Button>
        <Button icon="file_download_done" disabled={hasErrors || n === 0 || committing} onClick={onCommit}>
          {COPY.commit(n)}
        </Button>
      </div>
    </section>
  );
}
