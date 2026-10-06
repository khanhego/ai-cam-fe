import { RETURN_TABS, type ReturnFilters, type ReturnTab } from "@/lib/api/returns";
import { platformToApi, platformToParams, platformUrlFields } from "@/shared/filters/platformFilterValue";
import type { Platform } from "@/shared/labels";
import type { ReturnKind } from "@/shared/returns/types";
import { RETURN_KIND } from "@/shared/returns/labels";

/**
 * Bộ lọc D14 ↔ URL (02b-admin §1: `/admin/returns?tab=&kind=&q=&from=&to=&page=`). Item 03: `platform`, `shop`
 * (DEC-488), `pending_only=true` (chip "Chỉ chưa xử lý" — chỉ tab Chỉ hoàn tiền, link D2 `REFUND_ONLY_PENDING`).
 */
export type ReturnUrlFilters = {
  tab: ReturnTab;
  kind?: ReturnKind;
  q?: string;
  from?: string;
  to?: string;
  platform?: Platform | null;
  shop?: string | null;
  pendingOnly?: boolean;
  page?: number;
};

export const PAGE_SIZE = 20;
/** Tab mặc định "Đang về" (01 §10.5 D14 — tab đầu; cũng là mặc định của API-110). */
export const DEFAULT_TAB: ReturnTab = "EXPECTED";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const oneOf = <T extends string>(v: string | null, all: readonly T[]): T | undefined =>
  v && (all as readonly string[]).includes(v) ? (v as T) : undefined;
const day = (v: string | null) => (v && DAY.test(v) ? v : undefined);

export function returnFiltersFromParams(p: URLSearchParams): ReturnUrlFilters {
  const page = Number(p.get("page"));
  const q = p.get("q")?.trim();
  return {
    ...platformUrlFields(p),
    ...(p.get("pending_only") === "true" ? { pendingOnly: true } : {}),
    tab: oneOf(p.get("tab"), RETURN_TABS) ?? DEFAULT_TAB,
    kind: oneOf(p.get("kind"), Object.keys(RETURN_KIND) as ReturnKind[]),
    q: q ? q.slice(0, 64) : undefined,
    from: day(p.get("from")),
    to: day(p.get("to")),
    page: Number.isInteger(page) && page > 1 ? page : undefined,
  };
}

export function paramsFromReturnFilters(f: ReturnUrlFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.tab !== DEFAULT_TAB) out.tab = f.tab;
  for (const k of ["kind", "q", "from", "to"] as const) if (f[k]) out[k] = f[k]!;
  Object.assign(out, platformToParams({ platform: f.platform ?? null, shopId: f.shop ?? null }));
  if (f.pendingOnly && f.tab === "NO_PARCEL") out.pending_only = "true";
  if (f.page && f.page > 1) out.page = String(f.page);
  return out;
}

export const toApiReturnFilters = (f: ReturnUrlFilters): ReturnFilters => ({
  tab: f.tab,
  kind: f.kind,
  q: f.q,
  date_from: f.from,
  date_to: f.to,
  ...platformToApi({ platform: f.platform ?? null, shopId: f.shop ?? null }),
  ...(f.pendingOnly && f.tab === "NO_PARCEL" ? { pending_only: true } : {}),
  page: f.page ?? 1,
  page_size: PAGE_SIZE,
});

export const hasReturnFilters = (f: ReturnUrlFilters) =>
  Boolean(
    f.kind || f.q || f.from || f.to || f.platform || f.shop || (f.pendingOnly && f.tab === "NO_PARCEL"),
  );
