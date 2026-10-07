import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { notifyApi, type NotifyChannel } from "@/lib/api/notify";
import type { NotifyChannelType } from "@/shared/labels";
import { Alert, Button, EmptyState, PageHeader, Skeleton } from "@/shared/ui";

import { ChannelDialog } from "./ChannelDialog";
import { ChannelTable } from "./ChannelTable";
import { COPY } from "./copy";
import { DeleteChannelDialog } from "./DeleteChannelDialog";
import { MessageLog } from "./MessageLog";
import { QuietHoursCard } from "./QuietHours";
import { CHANNELS_KEY } from "./rules";

const TYPES: NotifyChannelType[] = ["TELEGRAM", "ZALO_OA"];

type Editing =
  { mode: "add" } | { mode: "edit"; channel: NotifyChannel } | { mode: "delete"; channel: NotifyChannel };

/**
 * D22 — Thông báo (01 §10.5 D22, FR-06.04, 06.07..06.11, UC-18; API-170..176). Chỉ ADMIN (route `RequireRole`, 403 →
 * D12). Alert từng loại chưa cấu hình trên máy chủ (EX-N1), bảng kênh + Gửi thử / Sửa / ⋮ Xóa kênh, dòng giờ yên lặng,
 * nhật ký gửi 30 ngày. Bot token / khóa OA ở cấu hình máy chủ — giao diện không nhập, không hiện (DEC-408, DEC-760).
 */
export default function NotificationsPage() {
  const result = useQuery({ queryKey: CHANNELS_KEY, queryFn: notifyApi.channels });
  const [editing, setEditing] = useState<Editing | null>(null);
  const data = result.data;
  const unconfigured = data ? TYPES.filter((t) => !data.providers[t]?.configured) : [];
  const canAdd = Boolean(data) && unconfigured.length < TYPES.length;
  const add = (
    <Button icon="add" disabled={!canAdd} onClick={() => setEditing({ mode: "add" })}>
      {COPY.add}
    </Button>
  );

  return (
    <>
      <PageHeader
        title={COPY.title}
        subtitle={COPY.subtitle}
        actions={data && data.items.length > 0 ? add : undefined}
      />
      {result.isPending && (
        <div className="card p-4" aria-busy="true" aria-label={COPY.loading}>
          <Skeleton lines={6} className="h-8" />
        </div>
      )}
      {result.isError && !data && (
        <Alert
          kind="error"
          action={
            <Button variant="text" onClick={() => void result.refetch()}>
              {COPY.retry}
            </Button>
          }
        >
          {COPY.loadError}
        </Alert>
      )}
      {data && (
        <>
          {unconfigured.map((t) => (
            <Alert key={t} kind="info">
              {COPY.notConfigured[t]}
            </Alert>
          ))}
          {data.items.length === 0 ? (
            <EmptyState icon="notifications" title={COPY.empty} action={add}>
              {COPY.emptyHint}
            </EmptyState>
          ) : (
            <section aria-label={COPY.table.caption} className="card mb-4">
              <ChannelTable
                data={data}
                onEdit={(channel) => setEditing({ mode: "edit", channel })}
                onDelete={(channel) => setEditing({ mode: "delete", channel })}
              />
            </section>
          )}
          <QuietHoursCard value={data.quiet_hours} />
          <MessageLog channels={data.items} />
          {editing?.mode === "add" && <ChannelDialog data={data} onClose={() => setEditing(null)} />}
          {editing?.mode === "edit" && (
            <ChannelDialog data={data} channel={editing.channel} onClose={() => setEditing(null)} />
          )}
          {editing?.mode === "delete" && (
            <DeleteChannelDialog channel={editing.channel} onClose={() => setEditing(null)} />
          )}
        </>
      )}
    </>
  );
}
