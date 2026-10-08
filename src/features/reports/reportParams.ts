import type { ReportQuery, ReportTab } from "@/lib/api/reports";
import { platformFromParams, platformToApi, platformToParams } from "@/shared/filters/platformFilterValue";
import { daysBetween, vnDay } from "@/shared/format";
import type { Platform } from "@/shared/labels";

import { REPORT_COPY } from "./reportCopy";

/**
 * Bộ lọc D20 ↔ URL (02b-admin §1: `/admin/reports?tab=&from=&to=&platform=&shop=&station=`). Kỳ là ngày lịch giờ VN
 * gồm 2 đầu; mặc định 30 ngày tới hôm nay (01 §10.5 D20 "Kỳ [30 ngày ▼]"). `station` chỉ có nghĩa ở tab Năng suất.
 */
export type ReportUrlFilters = {
  tab: ReportTab;
  from: string;
  to: string;
  platform: Platform | null;
  shop: string | null;
  station: string | null;
};

export const REPORT_TABS: readonly ReportTab[] = ["returns", "claims", "productivity"] as const;
export const DEFAULT_REPORT_TAB: ReportTab = "returns";
export const PRESETS = [7, 30, 90] as const;
export type Preset = (typeof PRESETS)[number];
export const DEFAULT_PRESET: Preset = 30;
/** 02 §6.2 API-150: tối đa 366 ngày (tính cả 2 đầu). */
export const MAX_REPORT_DAYS = 366;
/** D3 chỉ nhận khoảng ≤ 92 ngày (02b-admin §5 D3) — link bấm số sang D3 cắt về 92 ngày cuối kỳ (DEC-612). */
export const D3_MAX_RANGE_DAYS = 92;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (v: string | null | undefined): v is string =>
  Boolean(v && DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)));

/** Ngày `YYYY-MM-DD` cộng / trừ `n` ngày (lịch, không phụ thuộc múi giờ máy). */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Kỳ nhanh: `n` ngày kết thúc hôm nay (gồm hôm nay). */
export const presetRange = (n: Preset, today = vnDay()) => ({ from: addDays(today, -(n - 1)), to: today });

/** Kỳ đang chọn có trùng một kỳ nhanh không (để sáng nút). */
export function presetOf(from: string, to: string, today = vnDay()): Preset | null {
  if (to !== today) return null;
  return PRESETS.find((n) => presetRange(n, today).from === from) ?? null;
}

const isTab = (v: string | null): v is ReportTab => (REPORT_TABS as readonly string[]).includes(v ?? "");

/** URL → bộ lọc. Ngày sai định dạng / thiếu → kỳ mặc định (giữ ngày hợp lệ định dạng để báo lỗi kỳ ở form). */
export function reportFiltersFromParams(p: URLSearchParams, today = vnDay()): ReportUrlFilters {
  const def = presetRange(DEFAULT_PRESET, today);
  const from = p.get("from");
  const to = p.get("to");
  const both = isDay(from) && isDay(to);
  const pf = platformFromParams(p);
  return {
    tab: isTab(p.get("tab")) ? (p.get("tab") as ReportTab) : DEFAULT_REPORT_TAB,
    from: both ? from : def.from,
    to: both ? to : def.to,
    platform: pf.platform,
    shop: pf.shopId,
    station: p.get("station")?.trim() || null,
  };
}

export function paramsFromReportFilters(f: ReportUrlFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.tab !== DEFAULT_REPORT_TAB) out.tab = f.tab;
  out.from = f.from;
  out.to = f.to;
  Object.assign(out, platformToParams({ platform: f.platform, shopId: f.shop }));
  if (f.station && f.tab === "productivity") out.station = f.station;
  return out;
}

export function toReportQuery(f: ReportUrlFilters): ReportQuery {
  return {
    from: f.from,
    to: f.to,
    ...platformToApi({ platform: f.platform, shopId: f.shop }),
    ...(f.tab === "productivity" && f.station ? { station_id: f.station } : {}),
  };
}

export type PeriodErrors = { from?: string; to?: string };

/** Rule client 02b-admin §5 ReportFilters — cùng chữ với 422 API-150 `fields.from` / `fields.to`. */
export function validatePeriod(from: string, to: string, today = vnDay()): PeriodErrors {
  const V = REPORT_COPY.validate;
  const errors: PeriodErrors = {};
  if (!isDay(from)) errors.from = V.fromRequired;
  if (!isDay(to)) errors.to = V.toRequired;
  if (errors.from || errors.to) return errors;
  if (to < from) errors.to = V.range;
  else if (to > today) errors.to = V.future;
  else if (daysBetween(from, to) + 1 > MAX_REPORT_DAYS) errors.from = V.max;
  return errors;
}

export const hasErrors = (e: PeriodErrors) => Boolean(e.from || e.to);

// ───────────── Bấm số → màn chi tiết đã lọc (01 §10.5 D20 "Bấm số", DEC-488) ─────────────

const qs = (params: Record<string, string | null | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  return p.toString();
};
const shopParams = (f: Pick<ReportUrlFilters, "platform" | "shop">) =>
  platformToParams({ platform: f.platform, shopId: f.shop });

/** D14 `/admin/returns?tab=&kind=&from=&to=&platform=&shop=`; `period: false` cho số "hiện tại". */
export function returnsLink(
  f: ReportUrlFilters,
  opts: { tab: string; kind?: string; period?: boolean; platform?: Platform; shop?: string },
): string {
  const period = opts.period !== false;
  return `/admin/returns?${qs({
    tab: opts.tab,
    kind: opts.kind,
    from: period ? f.from : null,
    to: period ? f.to : null,
    ...shopParams({ platform: opts.platform ?? f.platform, shop: opts.shop ?? f.shop }),
  })}`;
}

/** D16 `/admin/claims?status=&type=&counterparty=&due=&platform=&shop=` (D16 không có lọc ngày). */
export function claimsLink(
  f: ReportUrlFilters,
  opts: {
    status: string;
    type?: string;
    counterparty?: string;
    due?: string;
    platform?: Platform;
    shop?: string;
  },
): string {
  return `/admin/claims?${qs({
    status: opts.status,
    type: opts.type,
    counterparty: opts.counterparty,
    due: opts.due,
    ...shopParams({ platform: opts.platform ?? f.platform, shop: opts.shop ?? f.shop }),
  })}`;
}

/** D3 `/admin/packages?…&date_from=&date_to=` — kỳ cắt còn ≤ 92 ngày cuối (DEC-612). */
export function packagesLink(f: ReportUrlFilters, extra: Record<string, string | undefined>): string {
  const minFrom = addDays(f.to, -D3_MAX_RANGE_DAYS);
  return `/admin/packages?${qs({
    ...extra,
    date_from: f.from < minFrom ? minFrom : f.from,
    date_to: f.to,
    ...shopParams(f),
  })}`;
}

/** Tên file theo 02 §6.2 API-153 (`Content-Disposition` cùng mẫu — FE tự đặt vì `api.blob` không đọc header). */
export const CSV_FILE: Record<ReportTab, string> = {
  returns: "bao-cao-hang-hoan",
  claims: "bao-cao-khieu-nai",
  productivity: "bao-cao-nang-suat",
};
export const csvFileName = (tab: ReportTab, q: Pick<ReportQuery, "from" | "to">) =>
  `${CSV_FILE[tab]}-${q.from}_${q.to}.csv`;
