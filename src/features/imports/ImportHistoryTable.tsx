import type { ImportHistoryItem } from "@/lib/api/imports";
import { fmtDateTime, fmtNumber } from "@/shared/format";
import { IconButton, StatusChip } from "@/shared/ui";

import { COPY } from "./copy";

const at = (i: ImportHistoryItem) => fmtDateTime(i.committed_at ?? i.created_at);

function Status({ item }: { item: ImportHistoryItem }) {
  const [label, tone] = COPY.status[item.status] ?? [item.status, "neutral"];
  return <StatusChip tone={tone}>{label}</StatusChip>;
}

/** Lịch sử nhập D5 (API-52): bảng từ `md`, card dưới `md`. Tải file gốc qua API-54. */
export function ImportHistoryTable({
  items,
  onDownload,
}: {
  items: ImportHistoryItem[];
  onDownload: (item: ImportHistoryItem) => void;
}) {
  const H = COPY.history;
  const download = (i: ImportHistoryItem) => (
    <IconButton icon="download" label={H.download(i.file_name)} onClick={() => onDownload(i)} />
  );
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="md-table" aria-label={H.title}>
          <thead>
            <tr>
              <th className="pl-4">{H.at}</th>
              <th>{H.file}</th>
              <th>{H.by}</th>
              <th className="text-right">{H.new}</th>
              <th className="text-right">{H.updated}</th>
              <th className="text-right">{H.skipped}</th>
              <th className="text-right">{H.error_}</th>
              <th>{H.status}</th>
              <th aria-label={H.download("")} />
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td className="pl-4 tabular-nums">{at(i)}</td>
                <td className="max-w-56 truncate" title={i.file_name}>
                  {i.file_name}
                </td>
                <td>{i.created_by?.display_name ?? "—"}</td>
                <td className="text-right tabular-nums">{fmtNumber(i.counts.new)}</td>
                <td className="text-right tabular-nums">{fmtNumber(i.counts.updated)}</td>
                <td className="text-right tabular-nums">{fmtNumber(i.counts.skipped)}</td>
                <td className="text-right tabular-nums">{fmtNumber(i.counts.error)}</td>
                <td>
                  <Status item={i} />
                </td>
                <td className="pr-2 text-right">{download(i)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-outline-variant md:hidden" aria-label={H.title}>
        {items.map((i) => (
          <li key={i.id} className="flex items-start gap-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-title-sm text-on-surface">{i.file_name}</p>
              <p className="text-body-sm text-on-surface-variant tabular-nums">
                {at(i)} · {i.created_by?.display_name ?? "—"}
              </p>
              <p className="text-body-sm text-on-surface-variant tabular-nums">{COPY.counts(i.counts)}</p>
              <Status item={i} />
            </div>
            {download(i)}
          </li>
        ))}
      </ul>
    </>
  );
}
