import { useEffect } from "react";

import { TOAST_MS, useToastStore, type ToastItem } from "./toastStore";

function ToastRow({ item }: { item: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss);
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(item.id), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [item.id, dismiss]);
  return (
    <div className="pointer-events-auto rounded-xs bg-inverse-surface px-4 py-3 text-body-md text-inverse-on-surface shadow-elevation-3">
      {item.message}
    </div>
  );
}

/** Đặt một lần ở gốc app. */
export function Toaster() {
  const items = useToastStore((s) => s.items);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
    >
      {items.map((item) => (
        <ToastRow key={item.id} item={item} />
      ))}
    </div>
  );
}
