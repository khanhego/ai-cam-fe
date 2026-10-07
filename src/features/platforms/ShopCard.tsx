import { useState } from "react";

import type { Shop } from "@/lib/api/shops";
import { fmtDateTime, fmtNumber } from "@/shared/format";
import { Alert, Button, IconButton, StatusChip } from "@/shared/ui";

import { COPY, shopName } from "./copy";

/** Số cảnh báo đồng bộ hiện thẳng; phần còn lại gom "và n cảnh báo khác" (RF-43: thẻ không dài vô hạn). */
const WARNINGS_SHOWN = 3;

/**
 * `last_error` → câu cho người dùng theo sàn; chi tiết kỹ thuật (`code`, `message` server) trong `<details>` (P2-17).
 */
function SyncError({ shop }: { shop: Shop }) {
  const e = shop.last_error;
  if (!e) return null;
  const at = e.at ? fmtDateTime(e.at) : null;
  const tech = [e.code, e.message].filter(Boolean).join(": ");
  return (
    <Alert kind="error">
      <span>{COPY.syncError(shop.platform, at, e.code)}</span>
      {tech && (
        <details className="mt-1 text-body-sm">
          <summary className="cursor-pointer">{COPY.techDetails}</summary>
          <span className="font-mono">{tech}</span>
        </details>
      )}
    </Alert>
  );
}

/** EX-T2 `TRACKING_OWNED_BY_OTHER_SHOP`: `message` server nguyên văn; `ORDER_SKIPPED_PLATFORM_FULFILLED` chỉ log, không hiện (02 §6.2). */
function SyncWarnings({ shop }: { shop: Shop }) {
  const shown = shop.sync_warnings.filter((w) => w.code !== "ORDER_SKIPPED_PLATFORM_FULFILLED");
  if (shown.length === 0) return null;
  const more = shown.length - WARNINGS_SHOWN;
  return (
    <Alert kind="warning">
      <ul aria-label={COPY.warnings} className="flex flex-col gap-1">
        {shown.slice(0, WARNINGS_SHOWN).map((w, i) => (
          <li key={`${w.code}-${w.at}-${i}`}>
            {w.message} <span className="text-body-sm tabular-nums">({fmtDateTime(w.at)})</span>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="mt-1 text-body-sm">{COPY.moreWarnings(more)}</p>}
    </Alert>
  );
}

/** Menu ⋮ của thẻ shop — hiện chỉ có "Ngắt kết nối" (01 §10.5 D7). */
function ShopMenu({ name, onDisconnect }: { name: string; onDisconnect: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <IconButton
        icon="more_vert"
        label={COPY.moreActions(name)}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <ul
          role="menu"
          aria-label={COPY.moreActions(name)}
          className="absolute right-0 z-10 mt-1 min-w-48 rounded-md bg-surface-container py-1 shadow-elevation-2"
        >
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="state-layer w-full px-4 py-2 text-left text-body-md text-error"
              onClick={() => {
                setOpen(false);
                onDisconnect();
              }}
            >
              {COPY.disconnect}
            </button>
          </li>
        </ul>
      )}
    </span>
  );
}

/**
 * Thẻ một shop đang kết nối / hết hạn (01 §10.5 D7): trạng thái, hạn ủy quyền, lần đồng bộ, số đơn hôm nay; lỗi đồng bộ
 * + cảnh báo đồng bộ; [Đồng bộ ngay] (CONNECTED) hoặc [Kết nối lại] (EXPIRED); ⋮ Ngắt kết nối.
 */
export function ShopCard({
  shop,
  connectDisabled,
  onConnect,
  syncBusy,
  onSync,
  onDisconnect,
}: {
  shop: Shop;
  connectDisabled: boolean;
  onConnect: () => void;
  /** Đang gửi API-73, hoặc server vừa trả 409 SYNC_IN_PROGRESS. */
  syncBusy: boolean;
  onSync: () => void;
  onDisconnect: () => void;
}) {
  const [label, tone] = COPY.status[shop.auth_status] ?? [shop.auth_status, "neutral"];
  const connected = shop.auth_status === "CONNECTED";
  const name = shopName(shop);
  const syncing = shop.sync_in_progress || syncBusy;
  return (
    <section aria-label={name} className="card p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h3 className="max-w-full truncate text-title-lg text-on-surface" title={name}>
          {name}
        </h3>
        <StatusChip tone={tone}>{label}</StatusChip>
      </div>
      {shop.auth_status === "EXPIRED" && <Alert kind="warning">{COPY.expiredHint}</Alert>}
      <SyncError shop={shop} />
      <SyncWarnings shop={shop} />
      <dl className="mb-6 grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-body-sm text-on-surface-variant">{COPY.field.expires}</dt>
          <dd className="text-body-lg text-on-surface tabular-nums">{fmtDateTime(shop.auth_expires_at)}</dd>
        </div>
        <div>
          <dt className="text-body-sm text-on-surface-variant">{COPY.field.lastSync}</dt>
          <dd className="text-body-lg text-on-surface tabular-nums">{fmtDateTime(shop.last_synced_at)}</dd>
        </div>
        <div>
          <dt className="text-body-sm text-on-surface-variant">{COPY.field.today}</dt>
          <dd className="text-body-lg text-on-surface tabular-nums">{fmtNumber(shop.today_synced_orders)}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {connected && syncing && (
          <span className="mr-auto text-body-md text-on-surface-variant" role="status">
            {COPY.syncInProgress}
          </span>
        )}
        {connected ? (
          <Button icon="sync" disabled={syncing} onClick={onSync}>
            {COPY.sync}
          </Button>
        ) : (
          <Button icon="link" disabled={connectDisabled} onClick={onConnect}>
            {COPY.reconnect}
          </Button>
        )}
        <ShopMenu name={name} onDisconnect={onDisconnect} />
      </div>
    </section>
  );
}
