import type { ReactNode } from "react";

import { cx, Icon } from "@/shared/ui";

export type PanelTone = "success" | "primary" | "secondary" | "warning" | "error";

const TONE: Record<PanelTone, string> = {
  success: "bg-success-container text-on-success-container",
  primary: "bg-primary-container text-on-primary-container",
  /** R2 Đang kiểm hàng hoàn (01 §10.4). */
  secondary: "bg-secondary-container text-on-secondary-container",
  warning: "bg-warning-container text-on-warning-container",
  error: "bg-error-container text-on-error-container",
};

/** Vùng nội dung station đổi nền theo trạng thái (design system "Station kiosk"); không animation. */
export function StationStatePanel({
  tone,
  icon,
  title,
  aside,
  children,
}: {
  tone: PanelTone;
  icon: string;
  title: string;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      role="status"
      aria-live="assertive"
      data-tone={tone}
      className={cx("flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-8", TONE[tone])}
    >
      <div className="flex items-center justify-between gap-4">
        <h1 className="flex items-center gap-3 text-headline-lg">
          <Icon name={icon} filled size={40} />
          {title}
        </h1>
        {aside}
      </div>
      {children}
    </section>
  );
}
