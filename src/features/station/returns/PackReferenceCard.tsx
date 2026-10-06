import { useState } from "react";

import type { PackReference } from "@/lib/api/station";
import { fmtShort } from "@/shared/format";
import { ClipPlayer } from "@/shared/media/ClipPlayer";
import { Button, Dialog, Icon } from "@/shared/ui";

import { COPY } from "../copy";

const C = COPY.returns.inspecting;

/**
 * Cột "Lúc đóng gói" R2 (01 §10.4, FR-04.12, FR-02.11): ảnh Cam 1 lúc đóng gói + "Xem clip đóng gói" (Dialog Cam 1 /
 * Cam 2 / Ghép — REUSE `ClipPlayer`). Không có phiên PACK hiệu lực → nút khóa + chữ. API-40 403 → chữ trong Dialog.
 */
export function PackReferenceCard({
  reference,
  onImageExpired,
}: {
  reference: PackReference | null;
  onImageExpired?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section
      aria-label={C.packRef}
      className="flex flex-col gap-3 rounded-md bg-surface-container-lowest p-4 text-on-surface"
    >
      <h2 className="text-title-lg">
        {C.packRef}
        {reference?.ended_at && <span className="ml-2 tabular-nums">{fmtShort(reference.ended_at)}</span>}
      </h2>
      {reference ? (
        <>
          {reference.snapshot?.url ? (
            <img
              src={reference.snapshot.url}
              alt={C.packRef}
              loading="lazy"
              className="aspect-video w-full max-w-40 rounded-md bg-surface-container-high object-cover lg:max-w-full"
              onError={onImageExpired}
            />
          ) : (
            <span className="flex aspect-video w-full items-center justify-center rounded-md bg-surface-container-high text-on-surface-variant">
              <Icon name="image_not_supported" size={32} />
            </span>
          )}
          <Button
            variant="tonal"
            icon="play_circle"
            className="h-14"
            disabled={reference.clips.length === 0}
            onClick={() => setOpen(true)}
          >
            {C.viewPackClip}
          </Button>
          <Dialog open={open} title={C.viewPackClip} onClose={() => setOpen(false)} wide>
            {open && <ClipPlayer clips={reference.clips} sideBySide forbiddenText={C.packClipForbidden} />}
          </Dialog>
        </>
      ) : (
        <>
          <Button variant="tonal" icon="play_circle" className="h-14" disabled>
            {C.viewPackClip}
          </Button>
          <p className="text-title-md">{C.noPackClip}</p>
        </>
      )}
    </section>
  );
}
