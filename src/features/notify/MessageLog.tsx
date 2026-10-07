import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import { notifyApi, type NotifyChannel, type NotifyMessage } from "@/lib/api/notify";
import { fmtHourMinute, fmtShort } from "@/shared/format";
import { NOTIFY_MESSAGE_STATUS, notifyMessageStatus, type NotifyMessageStatus } from "@/shared/labels";
import { Alert, Button, EmptyState, Pagination, SelectField, Skeleton, StatusChip } from "@/shared/ui";

import { LOG } from "./copy";
import {
  LOG_PAGE_SIZE,
  logFiltersFromParams,
  paramsFromLogFilters,
  toApiLogFilters,
  type LogUrlFilters,
} from "./rules";

const STATUSES = Object.keys(NOTIFY_MESSAGE_STATUS) as NotifyMessageStatus[];
/** Poll 30 giây khi trang mở (02b-admin §4). */
export const LOG_POLL_MS = 30_000;

function Result({ m }: { m: NotifyMessage }) {
  const tone = NOTIFY_MESSAGE_STATUS[m.status]?.[1] ?? "neutral";
  return (
    <span className="flex flex-col items-start gap-1">
      <StatusChip tone={tone}>{notifyMessageStatus(m.status, m.attempts)}</StatusChip>
      {m.status === "RETRYING" && m.next_attempt_at && (
        <span className="text-body-sm text-on-surface-variant">
          {LOG.nextAttempt(fmtHourMinute(m.next_attempt_at))}
        </span>
      )}
      {m.last_error && m.status !== "SENT" && <span className="text-body-sm text-error">{m.last_error}</span>}
    </span>
  );
}

function Content({ m }: { m: NotifyMessage }) {
  return (
    <details>
      <summary className="cursor-pointer text-on-surface">{LOG.event(m.event_label, m.item_count)}</summary>
      <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-body-sm text-on-surface-variant">
        {m.text}
      </pre>
    </details>
  );
}

/**
 * "Nhật ký gửi (30 ngày)" (01 §10.5 D22, FR-06.10; API-175): lọc Kênh / Kết quả ở URL (`?channel=&status=&page=`),
 * bảng / card, phân trang, poll 30 giây. Bấm dòng nội dung → xem nguyên văn tin.
 */
export function MessageLog({ channels }: { channels: NotifyChannel[] }) {
  const [params, setParams] = useSearchParams();
  const filters = logFiltersFromParams(params);
  const result = useQuery({
    queryKey: ["notify", "messages", toApiLogFilters(filters)],
    queryFn: () => notifyApi.messages(toApiLogFilters(filters)),
    placeholderData: keepPreviousData,
    refetchInterval: LOG_POLL_MS,
  });
  const apply = (next: Partial<LogUrlFilters>) =>
    setParams(paramsFromLogFilters({ ...filters, page: undefined, ...next }), { replace: true });
  const filtered = Boolean(filters.channel || filters.status);
  const data = result.data;

  return (
    <section aria-labelledby="notify-log-title">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-x-4">
        <h2 id="notify-log-title" className="mb-5 text-title-lg text-on-surface">
          {LOG.title}
        </h2>
        <div className="flex flex-wrap gap-x-3 [&>*]:min-w-44">
          <SelectField
            name="log-channel"
            label={LOG.channel}
            value={filters.channel ?? ""}
            onChange={(e) => apply({ channel: e.target.value || undefined })}
          >
            <option value="">{LOG.allChannels}</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            name="log-status"
            label={LOG.status}
            value={filters.status ?? ""}
            onChange={(e) =>
              apply({ status: (e.target.value || undefined) as NotifyMessageStatus | undefined })
            }
          >
            <option value="">{LOG.allStatuses}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {NOTIFY_MESSAGE_STATUS[s][0]}
              </option>
            ))}
          </SelectField>
        </div>
      </div>

      {result.isError && (
        <Alert
          kind="error"
          action={
            <Button variant="text" onClick={() => void result.refetch()}>
              {LOG.retry}
            </Button>
          }
        >
          {LOG.loadError}
        </Alert>
      )}
      {result.isPending && (
        <div className="card p-4" aria-busy="true" aria-label={LOG.loading}>
          <Skeleton lines={5} className="h-8" />
        </div>
      )}
      {data && data.total === 0 && !result.isError && (
        <EmptyState
          icon="notifications"
          title={filtered ? LOG.emptyFiltered : LOG.empty}
          action={
            filtered ? (
              <Button variant="tonal" onClick={() => setParams({}, { replace: true })}>
                {LOG.clear}
              </Button>
            ) : undefined
          }
        />
      )}
      {data && data.total > 0 && !result.isError && (
        <div className="card" aria-busy={result.isFetching}>
          <div className="hidden overflow-x-auto md:block">
            <table className="md-table">
              <caption className="sr-only">{LOG.title}</caption>
              <thead>
                <tr>
                  <th className="pl-4">{LOG.col.time}</th>
                  <th>{LOG.col.channel}</th>
                  <th>{LOG.col.event}</th>
                  <th className="pr-4">{LOG.col.status}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap pl-4 align-top tabular-nums">
                      {fmtShort(m.created_at)}
                    </td>
                    <td className="max-w-40 truncate align-top" title={m.channel.name}>
                      {m.channel.name}
                    </td>
                    <td className="align-top">
                      <Content m={m} />
                    </td>
                    <td className="pr-4 align-top">
                      <Result m={m} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-outline-variant md:hidden" aria-label={LOG.title}>
            {data.items.map((m) => (
              <li key={m.id} className="flex flex-col gap-1 px-4 py-3">
                <p className="flex flex-wrap gap-x-2 text-body-sm text-on-surface-variant">
                  <span className="tabular-nums">{fmtShort(m.created_at)}</span>
                  <span>{m.channel.name}</span>
                </p>
                <Content m={m} />
                <Result m={m} />
              </li>
            ))}
          </ul>
          <Pagination
            page={data.page}
            pageSize={data.page_size || LOG_PAGE_SIZE}
            total={data.total}
            onPage={(page) => setParams(paramsFromLogFilters({ ...filters, page }))}
          />
        </div>
      )}
    </section>
  );
}
