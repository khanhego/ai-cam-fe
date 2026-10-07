import type { BackupRun } from "@/lib/api/backup";
import { fmtShort } from "@/shared/format";
import { StatusChip } from "@/shared/ui";

import { COPY } from "./copy";
import { fmtSize, shortFp } from "./format";

const H = COPY.history;

function Result({ run }: { run: BackupRun }) {
  if (run.status === "SUCCESS") return <StatusChip tone="success">{H.success}</StatusChip>;
  if (run.status === "RUNNING") return <StatusChip tone="primary">{H.running}</StatusChip>;
  return <span className="text-body-md text-error">{H.failed(run.error)}</span>;
}

/**
 * Lịch sử 14 ngày (API-180 `history`, mới nhất trước — 01 §10.5 D23). Cột "Khóa" = dấu vân tay rút gọn (`title` đầy
 * đủ), bản mã hóa bằng khóa khác khóa hiện tại thêm chữ "khóa cũ" (v0.2, EX-K7).
 */
export function BackupHistoryTable({
  history,
  currentFp,
}: {
  history: BackupRun[];
  currentFp: string | null;
}) {
  return (
    <section aria-labelledby="backup-history" className="card mb-6 overflow-hidden">
      <h2 id="backup-history" className="px-4 pt-4 pb-2 text-title-md text-on-surface">
        {H.title}
      </h2>
      {history.length === 0 ? (
        <p className="px-4 pb-4 text-body-md text-on-surface-variant">{H.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="md-table" aria-label={H.title}>
            <thead>
              <tr>
                <th className="pl-4">{H.at}</th>
                <th>{H.kind}</th>
                <th className="text-right">{H.size}</th>
                <th>{H.result}</th>
                <th>{H.key}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id}>
                  <td className="pl-4 tabular-nums whitespace-nowrap">{fmtShort(r.started_at)}</td>
                  <td>{H.db}</td>
                  <td className="text-right tabular-nums">
                    {r.size_bytes === null ? "—" : fmtSize(r.size_bytes)}
                  </td>
                  <td>
                    <Result run={r} />
                  </td>
                  <td
                    className="font-mono text-body-sm whitespace-nowrap"
                    title={r.key_fingerprint ?? undefined}
                  >
                    {r.key_fingerprint ? shortFp(r.key_fingerprint) : "—"}
                    {r.key_fingerprint && currentFp && r.key_fingerprint !== currentFp && (
                      <span className="ml-1 font-sans text-on-surface-variant">({H.oldKey})</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
