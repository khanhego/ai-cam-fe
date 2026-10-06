/**
 * UI kit Hệ thống X — component Material 3 (sao từ livesstream-ai-fe, API theo docs/design-system/components/index.d.ts).
 * Token: src/design/system.css. Hướng dẫn: docs/design-system/README.md.
 */
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { cx } from "./cx";

/* ---------------------------------------------------------------- Icon */

/** Material Symbols Rounded glyph. Decorative (aria-hidden): the control around it carries the label. */
export function Icon({
  name,
  filled,
  size = 20,
  className,
}: {
  name: string;
  filled?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx("icon", filled && "icon-filled", className)}
      style={{ fontSize: size }}
    >
      {name}
    </span>
  );
}

/* ---------------------------------------------------------------- Buttons */

export type ButtonVariant =
  "filled" | "tonal" | "outlined" | "text" | "elevated" | "danger" | "outlined-danger" | "text-danger";

const BUTTON: Record<ButtonVariant, string> = {
  filled: "bg-primary text-on-primary hover:shadow-elevation-1",
  tonal: "bg-secondary-container text-on-secondary-container hover:shadow-elevation-1",
  outlined: "border border-outline text-primary",
  text: "text-primary px-3",
  elevated: "bg-surface-container-low text-primary shadow-elevation-1 hover:shadow-elevation-2",
  danger: "bg-error text-on-error hover:shadow-elevation-1",
  "outlined-danger": "border border-outline text-error",
  "text-danger": "text-error px-3",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** React 19: ref là prop thường, chuyển xuống <button> qua `...rest`. */
  ref?: Ref<HTMLButtonElement>;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  icon?: string;
  trailingIcon?: string;
  fullWidth?: boolean;
};

/** M3 common button: filled (primary action), tonal, outlined, text, elevated; danger for destructive confirms. */
export function Button({
  variant = "filled",
  size = "md",
  icon,
  trailingIcon,
  fullWidth,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "state-layer inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-shadow duration-150",
        "disabled:pointer-events-none disabled:opacity-38 disabled:shadow-none",
        size === "sm" ? "h-8 px-4 text-label-md" : "h-10 px-6 text-label-lg",
        icon && size === "md" && "pl-4",
        BUTTON[variant],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={18} />}
      {children}
      {trailingIcon && <Icon name={trailingIcon} size={18} />}
    </button>
  );
}

/** M3 standard icon button; ``label`` is its accessible name (and tooltip). */
export function IconButton({
  icon,
  label,
  variant = "standard",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: string;
  label: string;
  variant?: "standard" | "tonal" | "filled" | "danger";
}) {
  const tone = {
    standard: "text-on-surface-variant",
    tonal: "bg-secondary-container text-on-secondary-container",
    filled: "bg-primary text-on-primary",
    danger: "text-error",
  }[variant];
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "state-layer inline-flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-38",
        tone,
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={22} />
    </button>
  );
}

/* ---------------------------------------------------------------- Text fields */

type FieldChrome = { label: string; error?: string; hint?: string; name: string; className?: string };

function FieldFrame({
  id,
  label,
  error,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("md-field mb-5", className)} data-invalid={error ? "true" : undefined}>
      <label htmlFor={id} className="md-field-label">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1 px-4 text-body-sm text-error">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 px-4 text-body-sm text-on-surface-variant">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const describedBy = (id: string, error?: string, hint?: string) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

/** M3 outlined text field. The label sits on the outline (populated state) so it never hides the value. */
export function TextField({
  label,
  error,
  hint,
  name,
  id,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & FieldChrome) {
  const inputId = id ?? name;
  return (
    <FieldFrame id={inputId} label={label} error={error} hint={hint} className={className}>
      <input
        id={inputId}
        name={name}
        aria-invalid={!!error}
        aria-describedby={describedBy(inputId, error, hint)}
        className="md-input"
        {...rest}
      />
    </FieldFrame>
  );
}

/** Outlined select with the same frame as TextField. */
export function SelectField({
  label,
  error,
  hint,
  name,
  id,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & FieldChrome) {
  const inputId = id ?? name;
  return (
    <FieldFrame id={inputId} label={label} error={error} hint={hint} className={className}>
      <select
        id={inputId}
        name={name}
        aria-invalid={!!error}
        aria-describedby={describedBy(inputId, error, hint)}
        className="md-input"
        {...rest}
      >
        {children}
      </select>
    </FieldFrame>
  );
}

export function TextAreaField({
  label,
  error,
  hint,
  name,
  id,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldChrome) {
  const inputId = id ?? name;
  return (
    <FieldFrame id={inputId} label={label} error={error} hint={hint} className={className}>
      <textarea
        id={inputId}
        name={name}
        aria-invalid={!!error}
        aria-describedby={describedBy(inputId, error, hint)}
        className="md-input"
        {...rest}
      />
    </FieldFrame>
  );
}

/* ---------------------------------------------------------------- Feedback */

type Tone = "error" | "success" | "info" | "warning";
const ALERT: Record<Tone, [string, string]> = {
  error: ["bg-error-container text-on-error-container", "error"],
  success: ["bg-success-container text-on-success-container", "check_circle"],
  info: ["bg-secondary-container text-on-secondary-container", "info"],
  warning: ["bg-warning-container text-on-warning-container", "warning"],
};

/** Thông báo trong trang / form. Lỗi nói chuyện gì đã xảy ra và cần làm gì tiếp (design system §Giọng văn). */
export function Alert({
  kind = "error",
  children,
  action,
}: {
  kind?: Tone;
  children: ReactNode;
  action?: ReactNode;
}) {
  const [tone, icon] = ALERT[kind];
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cx("mb-4 flex items-start gap-3 rounded-md px-4 py-3 text-body-md", tone)}
    >
      <Icon name={icon} size={20} className="mt-px" />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export type ChipTone = "neutral" | "primary" | "success" | "warning" | "error" | "live" | "info";
const CHIP: Record<ChipTone, string> = {
  neutral: "bg-surface-container-high text-on-surface-variant",
  primary: "bg-primary-container text-on-primary-container",
  success: "bg-success-container text-on-success-container",
  warning: "bg-warning-container text-on-warning-container",
  error: "bg-error-container text-on-error-container",
  live: "bg-live text-on-live",
  info: "bg-secondary-container text-on-secondary-container",
};

/** Chip trạng thái chỉ để đọc: kiện, phiên, camera, clip. Tone `live` chỉ cho REC. */
export function StatusChip({
  tone = "neutral",
  icon,
  title,
  children,
  className,
}: {
  tone?: ChipTone;
  icon?: string;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex h-6 items-center gap-1 rounded-sm px-2 text-label-md whitespace-nowrap",
        CHIP[tone],
        className,
      )}
    >
      {icon && <Icon name={icon} size={14} />}
      <span>{children}</span>
    </span>
  );
}

/**
 * Thanh tiến độ. Có `value` → xác định (nhập CSV, xuất clip, dung lượng ổ).
 * Không có `value` → không xác định (đang chờ API-11 trên station) — EXTEND so với design system (T-32).
 */
export function LinearProgress({
  value,
  label,
  tone = "primary",
}: {
  value?: number;
  label: string;
  tone?: "primary" | "error";
}) {
  const bar = tone === "error" ? "bg-error" : "bg-primary";
  if (value === undefined) {
    return (
      <div
        role="progressbar"
        aria-label={label}
        className="relative h-1 w-full overflow-hidden rounded-full bg-surface-container-highest"
      >
        <div className={cx("md-progress-indeterminate absolute inset-y-0 rounded-full", bar)} />
      </div>
    );
  }
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1 w-full overflow-hidden rounded-full bg-surface-container-highest"
    >
      <div
        className={cx("h-full rounded-full transition-[width] duration-300", bar)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- Layout pieces */

/** Page title row: headline + supporting text on the left, primary actions on the right. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-headline-sm text-on-surface">{title}</h1>
        {subtitle && <div className="mt-1 text-body-md text-on-surface-variant">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Empty or zero-results state: what is missing and the one action that fixes it. */
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
        <Icon name={icon} size={28} />
      </span>
      <p className="text-title-md text-on-surface">{title}</p>
      {children && <div className="max-w-md text-body-md text-on-surface-variant">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** M3 primary tabs. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: [T, ReactNode][];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="mb-4 flex gap-1 overflow-x-auto border-b border-outline-variant"
    >
      {items.map(([k, text]) => (
        <button
          key={k}
          role="tab"
          type="button"
          aria-selected={value === k}
          onClick={() => onChange(k)}
          className={cx(
            "state-layer relative h-12 shrink-0 px-4 text-title-sm",
            value === k ? "text-primary" : "text-on-surface-variant",
          )}
        >
          {text}
          {value === k && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-primary" />}
        </button>
      ))}
    </div>
  );
}

/** M3 segmented buttons (single select): list/grid views, filters with 2–5 options. */
export function SegmentedButtons<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: [T, string, string?][];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex h-10 overflow-hidden rounded-full border border-outline"
    >
      {options.map(([k, text, icon], i) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className={cx(
            "state-layer inline-flex items-center gap-1.5 px-4 text-label-lg",
            i > 0 && "border-l border-outline",
            value === k ? "bg-secondary-container text-on-secondary-container" : "text-on-surface",
          )}
        >
          {value === k ? <Icon name="check" size={18} /> : icon ? <Icon name={icon} size={18} /> : null}
          {text}
        </button>
      ))}
    </div>
  );
}

/** Khung trang đăng nhập (S0, D1). */
export function AuthCard({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-container-low px-4 py-10">
      <div className="w-full max-w-md">
        <p className="mb-6 flex items-center justify-center gap-2 text-title-lg text-primary">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-on-primary">
            <Icon name="videocam" size={22} />
          </span>
          Hệ thống X
        </p>
        <div className="card p-6 shadow-elevation-1 sm:p-8">
          <h1 className="mb-6 text-headline-sm text-on-surface">{title}</h1>
          {children}
        </div>
        {footer && <div className="mt-4 text-center text-body-md text-on-surface-variant">{footer}</div>}
      </div>
    </main>
  );
}
