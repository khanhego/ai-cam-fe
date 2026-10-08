import { Icon } from "@/shared/ui";

import { CLIP_COPY, STRIP_COPY } from "./copy";

/**
 * Khối xám "Thiếu tệp" (01 §10.5 "Clip / ảnh Thiếu tệp" v0.5, FR-02.16, EX-K8 / K9; 02b-admin §3 `MissingMediaBlock`):
 * clip `MISSING` thay player ("Thiếu tệp clip trên máy chủ — không phát được."), ảnh `MISSING` thay ô ảnh 96 px ("Thiếu
 * tệp ảnh"). Không có nút — nơi dùng không hiện "Cắt lại" / "Xuất" cho clip thiếu tệp. Dùng ở D4, D17, station.
 */
export function MissingMediaBlock({ kind, label }: { kind: "clip" | "snapshot"; label?: string }) {
  if (kind === "snapshot")
    return (
      <div
        role="img"
        aria-label={label ? `${label}: ${STRIP_COPY.missing}` : STRIP_COPY.missing}
        title={STRIP_COPY.missing}
        className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-md bg-surface-container-high p-1 text-center text-on-surface-variant"
      >
        <Icon name="hide_image" size={24} />
        <span className="text-label-sm leading-tight">{STRIP_COPY.missing}</span>
      </div>
    );
  return (
    <div
      role="status"
      className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-md bg-surface-container-high p-4 text-center text-on-surface-variant"
    >
      <Icon name="videocam_off" size={32} />
      <p className="text-body-md">{CLIP_COPY.missing}</p>
    </div>
  );
}
