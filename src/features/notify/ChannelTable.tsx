import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { isApiError } from "@/lib/api/errors";
import { notifyApi, type NotifyChannel, type NotifyChannels } from "@/lib/api/notify";
import { fmtHourMinute, fmtShort, vnDay } from "@/shared/format";
import { NOTIFY_CHANNEL_TYPE } from "@/shared/labels";
import { Alert, Button, Icon, IconButton, StatusChip, toast } from "@/shared/ui";

import { COPY } from "./copy";
import { NOTIFY_KEY } from "./rules";

/** Giờ gửi: hôm nay → `10:02`, ngày khác → `06/10 10:02`. */
const when = (iso: string) => (vnDay(iso) === vnDay() ? fmtHourMinute(iso) : fmtShort(iso));

function lastError(ch: NotifyChannel): { message: string; at: string | null } {
  const e = ch.last_error;
  if (!e) return { message: "", at: null };
  if (typeof e === "string") return { message: e, at: null };
  const message = e.message || (e.code === "NOTIFY_TIMEOUT" ? COPY.timeout[ch.type] : (e.code ?? ""));
  return { message, at: e.at ?? null };
}

/** Trạng thái kênh (01 §10.5 D22): "Gửi được 10:02" · "Lỗi 09:30: …" · "Tắt" · "Chưa gửi". */
function ChannelStatus({ ch }: { ch: NotifyChannel }) {
  if (!ch.enabled) return <StatusChip tone="neutral">{COPY.status.off}</StatusChip>;
  if (ch.last_status === "ERROR") {
    const { message, at } = lastError(ch);
    return (
      <span className="text-body-sm text-error">{COPY.status.error(at ? when(at) : null, message)}</span>
    );
  }
  if (ch.last_status === "OK" && ch.last_sent_at)
    return <StatusChip tone="success">{COPY.status.ok(when(ch.last_sent_at))}</StatusChip>;
  return <span className="text-body-sm text-on-surface-variant">{COPY.status.never}</span>;
}

function MoreMenu({ ch, onDelete }: { ch: NotifyChannel; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-block"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <IconButton
        icon="more_vert"
        label={COPY.more(ch.name)}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <ul
          role="menu"
          aria-label={COPY.more(ch.name)}
          className="absolute right-0 z-10 mt-1 min-w-40 rounded-md bg-surface-container py-1 shadow-elevation-2"
        >
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="state-layer w-full px-4 py-2 text-left text-body-md text-error"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            >
              {COPY.remove}
            </button>
          </li>
        </ul>
      )}
    </span>
  );
}

type RowProps = {
  ch: NotifyChannel;
  configured: boolean;
  testing: boolean;
  onTest: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

function RowActions({ ch, configured, testing, onTest, onEdit, onDelete }: RowProps) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="text"
        size="sm"
        disabled={testing || !configured}
        aria-label={COPY.testFor(ch.name)}
        aria-busy={testing}
        title={configured ? undefined : COPY.testLocked}
        onClick={onTest}
      >
        {testing && <Icon name="progress_activity" size={18} className="animate-spin" />}
        {testing ? COPY.testing : COPY.test}
      </Button>
      <Button variant="text" size="sm" aria-label={COPY.editFor(ch.name)} onClick={onEdit}>
        {COPY.edit}
      </Button>
      <MoreMenu ch={ch} onDelete={onDelete} />
    </div>
  );
}

/**
 * Bảng kênh từ `md`, card dưới `md` (02b-admin §9). "Gửi thử" (API-174, ≤ 10 giây): nút xoay → Toast "Đã gửi tin thử
 * tới {tên}." / Alert dưới dòng "Gửi thử lỗi: {message server}" (502 `NOTIFY_SEND_FAILED`, 504 `NOTIFY_TIMEOUT`, 409
 * `PROVIDER_NOT_CONFIGURED`); bấm lại được. Tên dài cắt `…` + `title` (RF-43).
 */
export function ChannelTable({
  data,
  onEdit,
  onDelete,
}: {
  data: NotifyChannels;
  onEdit: (ch: NotifyChannel) => void;
  onDelete: (ch: NotifyChannel) => void;
}) {
  const qc = useQueryClient();
  const [testing, setTesting] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const label = (code: string) => data.events.find((e) => e.code === code)?.label ?? code;

  async function testSend(ch: NotifyChannel) {
    setTesting((s) => new Set(s).add(ch.id));
    setErrors((m) => {
      const next = { ...m };
      delete next[ch.id];
      return next;
    });
    try {
      await notifyApi.test(ch.id);
      toast(COPY.testDone(ch.name));
    } catch (e) {
      if (isApiError(e) && e.code === "NOT_FOUND") toast(e.message);
      else {
        const message = isApiError(e) ? e.message : COPY.generic;
        setErrors((m) => ({ ...m, [ch.id]: COPY.testFailed(message) }));
      }
    } finally {
      setTesting((s) => {
        const next = new Set(s);
        next.delete(ch.id);
        return next;
      });
      void qc.invalidateQueries({ queryKey: NOTIFY_KEY });
    }
  }

  const props = (ch: NotifyChannel): RowProps => ({
    ch,
    configured: Boolean(data.providers[ch.type]?.configured),
    testing: testing.has(ch.id),
    onTest: () => void testSend(ch),
    onEdit: () => onEdit(ch),
    onDelete: () => onDelete(ch),
  });
  const events = (ch: NotifyChannel) => ch.events.map(label).join(", ");
  const rowError = (ch: NotifyChannel) =>
    errors[ch.id] && (
      <div role="status">
        <Alert kind="error">{errors[ch.id]}</Alert>
      </div>
    );

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="md-table">
          <caption className="sr-only">{COPY.table.caption}</caption>
          <thead>
            <tr>
              <th className="pl-4">{COPY.table.name}</th>
              <th>{COPY.table.type}</th>
              <th>{COPY.table.events}</th>
              <th>{COPY.table.status}</th>
              <th className="pr-4">
                <span className="sr-only">{COPY.table.actions}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((ch) => [
              <tr key={ch.id}>
                <td className="max-w-48 truncate pl-4 font-medium text-on-surface" title={ch.name}>
                  {ch.name}
                </td>
                <td className="whitespace-nowrap">{NOTIFY_CHANNEL_TYPE[ch.type] ?? ch.type}</td>
                <td className="max-w-80">
                  <span className="line-clamp-2" title={events(ch)}>
                    {events(ch)}
                  </span>
                </td>
                <td className="max-w-72">
                  <ChannelStatus ch={ch} />
                </td>
                <td className="whitespace-nowrap pr-4">
                  <RowActions {...props(ch)} />
                </td>
              </tr>,
              errors[ch.id] ? (
                <tr key={`${ch.id}-error`}>
                  <td colSpan={5} className="px-4">
                    {rowError(ch)}
                  </td>
                </tr>
              ) : null,
            ])}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-outline-variant md:hidden" aria-label={COPY.table.caption}>
        {data.items.map((ch) => (
          <li key={ch.id} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 truncate font-medium text-on-surface" title={ch.name}>
                {ch.name}
              </span>
              <span className="shrink-0 text-body-sm text-on-surface-variant">
                {NOTIFY_CHANNEL_TYPE[ch.type] ?? ch.type}
              </span>
            </div>
            <p className="text-body-sm text-on-surface-variant">{events(ch)}</p>
            <div>
              <ChannelStatus ch={ch} />
            </div>
            {rowError(ch)}
            <RowActions {...props(ch)} />
          </li>
        ))}
      </ul>
    </>
  );
}
