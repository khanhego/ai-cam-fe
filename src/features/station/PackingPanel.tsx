import { useState } from "react";

import type { StationSession, StationState } from "@/lib/api/station";
import { Alert, Button, Icon, StatusChip, TrackingNumber } from "@/shared/ui";

import { CancelSessionDialog } from "./CancelSessionDialog";
import { COPY } from "./copy";
import { StationStatePanel } from "./StationStatePanel";
import { mmss, useServerNow } from "./useServerClock";

function TrayChip({ match }: { match: StationState["tray"]["match"] }) {
  if (match === "MATCH")
    return (
      <StatusChip tone="success" icon="verified">
        {COPY.tray.MATCH}
      </StatusChip>
    );
  if (match === "NOT_SEEN")
    return (
      <StatusChip tone="warning" icon="visibility_off">
        {COPY.tray.NOT_SEEN}
      </StatusChip>
    );
  if (match === "UNAVAILABLE")
    return (
      <StatusChip tone="neutral" icon="videocam_off">
        {COPY.tray.UNAVAILABLE}
      </StatusChip>
    );
  return null;
}

function ItemList({ session }: { session: StationSession }) {
  if (session.package.items.length === 0) return <p className="text-title-lg">{COPY.packing.noItems}</p>;
  return (
    <ul className="flex flex-col divide-y divide-outline-variant">
      {session.package.items.map((item, i) => (
        <li key={i} className="flex items-center gap-4 py-3">
          {item.image_url ? (
            <img src={item.image_url} alt="" className="h-16 w-16 rounded-sm object-cover" />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-sm bg-surface-container-high text-on-surface-variant">
              <Icon name="inventory_2" size={28} />
            </span>
          )}
          <span className="flex-1 text-title-lg">{item.product_name}</span>
          <span className="text-title-lg text-on-surface-variant">{item.variation}</span>
          <span className="w-20 text-right text-title-lg tabular-nums">× {item.quantity}</span>
        </li>
      ))}
    </ul>
  );
}

/** Đơn vừa bị hủy trên sàn khi đang đóng (FR-03.15, L9, BR-21) — banner đỏ trên danh sách sản phẩm. */
function OrderCancelledBanner() {
  return (
    <Alert kind="error">
      <span className="text-headline-sm">{COPY.orderCancelled.banner}</span>
    </Alert>
  );
}

/** S2 — Đang đóng gói (01 §10.4). Item 02: banner đơn vừa hủy + nút "Hủy phiên" nhấn mạnh. */
export function PackingPanel({ state, onCallManager }: { state: StationState; onCallManager: () => void }) {
  const session = state.session!;
  const now = useServerNow();
  const [cancelOpen, setCancelOpen] = useState(false);
  const elapsed = now - Date.parse(session.started_at);
  const warn = now >= Date.parse(session.warn_at);
  const warnMinutes = Math.round((Date.parse(session.warn_at) - Date.parse(session.started_at)) / 60_000);
  const cancelled = session.flags.includes("ORDER_CANCELLED");
  return (
    <StationStatePanel
      tone="primary"
      icon="package_2"
      title={COPY.packing.title}
      aside={
        <span className="text-title-lg tabular-nums">
          {COPY.packing.timer} <span className="font-mono">{mmss(elapsed)}</span>
        </span>
      }
    >
      {warn && <Alert kind="warning">{COPY.packing.warn15(warnMinutes)}</Alert>}
      {cancelled && <OrderCancelledBanner />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <TrackingNumber value={session.package.tracking_number} size="display" copy={false} />
        {session.package.order && (
          <span className="text-title-lg">
            Shopee <span className="font-mono">{session.package.order.platform_order_sn}</span>
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <TrayChip match={state.tray.match} />
        {session.flags
          .filter((f) => COPY.flags[f])
          .map((f) => (
            <StatusChip key={f} tone="warning" icon="warning">
              {COPY.flags[f]}
            </StatusChip>
          ))}
      </div>
      <div className="rounded-md bg-surface-container-lowest p-4 text-on-surface">
        <ItemList session={session} />
        {session.package.order?.buyer_note && (
          <p className="mt-3 text-title-lg">
            {COPY.packing.buyerNote} “{session.package.order.buyer_note}”
          </p>
        )}
      </div>
      <p className="text-headline-md">{COPY.packing.hint}</p>
      <div className="mt-auto flex justify-between gap-6">
        {/* Nút trên nền màu trạng thái: dùng nền surface để đủ tương phản (outlined chữ primary trên primary-container bị chìm). */}
        <Button
          variant={cancelled ? "tonal" : "elevated"}
          icon={cancelled ? "cancel" : undefined}
          className="h-14 px-8"
          onClick={() => setCancelOpen(true)}
        >
          {COPY.packing.cancel}
        </Button>
        <Button variant="tonal" icon="support_agent" className="h-14 px-8" onClick={onCallManager}>
          {COPY.packing.callManager}
        </Button>
      </div>
      <CancelSessionDialog open={cancelOpen} onClose={() => setCancelOpen(false)} />
    </StationStatePanel>
  );
}
