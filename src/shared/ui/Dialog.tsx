import { useEffect, useRef, type ReactNode } from "react";

import { Button } from "./ui";

/** M3 basic dialog on <dialog>: headline, supporting content, actions aligned end. */
export function Dialog({
  open,
  title,
  onClose,
  children,
  actions,
  wide,
  dismissible = true,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  wide?: boolean;
  /** false: Esc không đóng và không có nút "Đóng" (R5 bắt buộc — 01 §10.4). */
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // jsdom has no showModal(); fall back to the open attribute.
    if (open && !el.open) {
      if (typeof el.showModal === "function") el.showModal();
      else el.setAttribute("open", "");
    }
  }, [open]);
  if (!open) return null;
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      style={{ ["--md-field-bg" as string]: "var(--md-sys-color-surface-container-high)" }}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? "max-w-2xl" : "max-w-lg"} rounded-xl bg-surface-container-high p-0 text-on-surface shadow-elevation-3 backdrop:bg-scrim/40`}
    >
      <div className="p-6">
        <h2 className="mb-4 text-headline-sm text-on-surface">{title}</h2>
        <div className="text-body-md text-on-surface-variant">{children}</div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {dismissible && (
            <Button variant="text" onClick={onClose}>
              Đóng
            </Button>
          )}
          {actions}
        </div>
      </div>
    </dialog>
  );
}
