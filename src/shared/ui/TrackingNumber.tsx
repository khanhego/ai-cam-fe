import { useState } from "react";

import { cx } from "./cx";
import { Icon } from "./ui";

const SIZE = {
  md: "text-body-md",
  lg: "text-title-lg",
  display: "text-display-md tracking-wide",
} as const;

/**
 * Mã vận đơn / mã đơn sàn / SHA-256: font mono, kèm nút Copy (design system §Giọng văn).
 * Station dùng `size="display"` và `copy={false}` (không có chuột).
 */
export function TrackingNumber({
  value,
  size = "md",
  copy = true,
  className,
}: {
  value: string;
  size?: keyof typeof SIZE;
  copy?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <span className={cx("inline-flex items-center gap-1", className)}>
      <span className={cx("font-mono tabular-nums break-all", SIZE[size])}>{value}</span>
      {copy && (
        <button
          type="button"
          onClick={onCopy}
          aria-label={copied ? "Đã copy" : `Copy ${value}`}
          title={copied ? "Đã copy" : "Copy"}
          className="state-layer inline-flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant"
        >
          <Icon name={copied ? "check" : "content_copy"} size={18} />
        </button>
      )}
    </span>
  );
}
