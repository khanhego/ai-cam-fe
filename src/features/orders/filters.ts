import type { PackageFilters } from "@/lib/api/packages";
import { daysBetween } from "@/shared/format";

import { COPY } from "./copy";

/** Bộ lọc D3 ↔ URL search params (02b-admin §3 `PackageFilters`, phương án "lọc ở URL"). */
export const FILTER_KEYS = [
  "q",
  "date_from",
  "date_to",
  "station_id",
  "warehouse_status",
  "session_status",
  "session_flag",
  // item 02 (01 §10.5 D3 EXTEND): loại phiên Đóng gói / Mở hoàn.
  "session_type",
  "source",
] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export type Filters = Partial<Record<FilterKey, string>> & { page?: number };

export const PAGE_SIZE = 20;
export const MAX_RANGE_DAYS = 92;

export function filtersFromParams(params: URLSearchParams): Filters {
  const f: Filters = {};
  for (const k of FILTER_KEYS) {
    const v = params.get(k)?.trim();
    if (v) f[k] = v;
  }
  const page = Number(params.get("page"));
  if (Number.isInteger(page) && page > 1) f.page = page;
  return f;
}

export function paramsFromFilters(f: Filters): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of FILTER_KEYS) {
    const v = f[k]?.trim();
    if (v) out[k] = v;
  }
  if (f.page && f.page > 1) out.page = String(f.page);
  return out;
}

export const toApiFilters = (f: Filters): PackageFilters => ({
  ...f,
  page: f.page ?? 1,
  page_size: PAGE_SIZE,
});

/** Rule client 02b-admin §5 D3: q ≤ 64; from ≤ to; khoảng ≤ 92 ngày (to − from, như TC-07.04: 01/07 → 02/10 = 93). */
export function validateFilters(f: Filters): Partial<Record<FilterKey, string>> {
  const errors: Partial<Record<FilterKey, string>> = {};
  if ((f.q ?? "").length > 64) errors.q = COPY.validate.q;
  if (f.date_from && f.date_to) {
    if (f.date_from > f.date_to) errors.date_to = COPY.validate.range;
    else if (daysBetween(f.date_from, f.date_to) > MAX_RANGE_DAYS) errors.date_to = COPY.validate.max;
  }
  return errors;
}

export const hasFilters = (f: Filters) => FILTER_KEYS.some((k) => Boolean(f[k]));
