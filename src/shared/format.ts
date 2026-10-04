/** Định dạng hiển thị (02b-admin §9): giờ Việt Nam, số vi-VN, thời lượng mm:ss. */
const TZ = "Asia/Ho_Chi_Minh";

const DATE_TIME = new Intl.DateTimeFormat("vi-VN", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
const DATE = new Intl.DateTimeFormat("vi-VN", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const TIME = new Intl.DateTimeFormat("vi-VN", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
const SHORT = new Intl.DateTimeFormat("vi-VN", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
/** en-CA cho ra `YYYY-MM-DD` — dạng API nhận cho tham số ngày (02 §6 API-30, 32). */
const ISO_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const NUMBER = new Intl.NumberFormat("vi-VN");

const parts = (fmt: Intl.DateTimeFormat, d: Date) =>
  Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value])) as Record<string, string>;

/** `04/10/2026 14:27:05` (01 §10.5). Ghép tay để không phụ thuộc dấu phẩy của từng trình duyệt. */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const p = parts(DATE_TIME, new Date(iso));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

/** `04/10/2026`. Nhận ISO đầy đủ hoặc `YYYY-MM-DD` (ngày lịch, không đổi múi). */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}/${m}/${y}`;
  }
  const p = parts(DATE, new Date(value));
  return `${p.day}/${p.month}/${p.year}`;
}

/** `14:27:05`. */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const p = parts(TIME, new Date(iso));
  return `${p.hour}:${p.minute}:${p.second}`;
}

/** `04/10 14:27` cho danh sách dày. */
export function fmtShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const p = parts(SHORT, new Date(iso));
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`;
}

export const fmtNumber = (n: number) => NUMBER.format(n);

/** Thời lượng `mm:ss` (≥ 1 giờ: `h:mm:ss`). */
export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/** Ngày lịch Việt Nam `YYYY-MM-DD` của một thời điểm (mặc định: bây giờ). */
export function vnDay(at: Date | string = new Date()): string {
  return ISO_DAY.format(typeof at === "string" ? new Date(at) : at);
}

/** Số ngày giữa hai ngày lịch `YYYY-MM-DD` (to − from). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** SHA-256 rút gọn `9f2c…e1a0` (01 §10.5 D4). */
export const shortHash = (hash: string) =>
  hash.length > 12 ? `${hash.slice(0, 4)}…${hash.slice(-4)}` : hash;
