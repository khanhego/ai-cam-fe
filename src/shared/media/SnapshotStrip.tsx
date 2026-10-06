import { useState } from "react";

import type { Snapshot } from "@/shared/returns/types";
import { Button, cx, Dialog, Icon } from "@/shared/ui";

import { fmtDateTime } from "@/shared/format";

/** Ảnh trong dải: `url` null khi ảnh đã bị xóa (API-132 `EvidenceSnapshot` — DEC-312 e). */
export type StripSnapshot = Omit<Snapshot, "url"> & { url: string | null };

/** Một ô ảnh 96px: nền xám + icon xoay tới khi tải xong; ảnh lỗi (URL ký hết hạn — API-106 403) → `onExpired`. */
function Thumb({
  snapshot,
  index,
  onOpen,
  onExpired,
}: {
  snapshot: StripSnapshot;
  index: number;
  onOpen: () => void;
  onExpired?: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const deleted = snapshot.status === "DELETED" || !snapshot.url;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={deleted}
      aria-label={deleted ? `Ảnh ${index + 1}: Ảnh đã bị xóa` : `Ảnh ${index + 1}`}
      title={deleted ? "Ảnh đã bị xóa" : undefined}
      className="state-layer relative h-24 w-24 shrink-0 overflow-hidden rounded-md bg-surface-container-high"
    >
      {!deleted && (
        <img
          src={snapshot.url ?? undefined}
          alt=""
          loading="lazy"
          className={cx("h-full w-full object-cover", !loaded && "opacity-0")}
          onLoad={() => setLoaded(true)}
          onError={onExpired}
        />
      )}
      {!loaded && (
        <span className="absolute inset-0 flex items-center justify-center text-on-surface-variant">
          <Icon
            name={deleted ? "hide_image" : "progress_activity"}
            size={28}
            className={cx(!deleted && "animate-spin")}
          />
        </span>
      )}
    </button>
  );
}

/**
 * Dải ảnh chụp (dùng chung station R2 và dashboard D4 / D17 — 02b-station §3). Ô 96px, bấm → Dialog ảnh lớn.
 * `onCapture` có → nút chụp (khóa khi đủ `max` ảnh, chữ `limitLabel`).
 */
export function SnapshotStrip({
  snapshots,
  max = 20,
  onCapture,
  capturing = false,
  captureLabel = "Chụp ảnh",
  limitLabel = "Đã đủ ảnh",
  label = "Ảnh",
  onExpired,
}: {
  snapshots: StripSnapshot[];
  max?: number;
  onCapture?: () => void;
  capturing?: boolean;
  captureLabel?: string;
  limitLabel?: string;
  label?: string;
  /** Ảnh không tải được (URL ký hết hạn) → nơi dùng lấy lại URL (station: API-10 một lần). */
  onExpired?: () => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const full = snapshots.length >= max;
  const shown = open !== null ? snapshots[open] : undefined;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-title-md">{label}</span>
      <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-1">
        {snapshots.map((s, i) => (
          <Thumb key={s.id} snapshot={s} index={i} onOpen={() => setOpen(i)} onExpired={onExpired} />
        ))}
        {onCapture && (
          <Button
            variant="tonal"
            icon={full ? "block" : capturing ? "progress_activity" : "photo_camera"}
            className="h-14 shrink-0 px-6"
            disabled={full || capturing}
            onClick={onCapture}
          >
            {full ? limitLabel : captureLabel}
          </Button>
        )}
      </div>
      <Dialog
        open={shown !== undefined}
        title={shown ? `${label} ${open! + 1} · ${fmtDateTime(shown.taken_at)}` : ""}
        onClose={() => setOpen(null)}
        wide
      >
        {shown?.url && <img src={shown.url} alt="" className="w-full rounded-md bg-black object-contain" />}
      </Dialog>
    </div>
  );
}
