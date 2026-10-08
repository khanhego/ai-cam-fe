import { RECON_RULES, type ReconFilters, type ReconRule, type ReconSeverity } from "@/lib/api/recon";
import { platformToApi, platformToParams, platformUrlFields } from "@/shared/filters/platformFilterValue";
import type { Platform } from "@/shared/labels";

/** Bộ lọc D15 ↔ URL (02b-admin §1: `/admin/recon?status=&severity=&rule=&from=&to=&page=`). */
export type ReconTab = "OPEN" | "RESOLVED" | "ALL";
export const RECON_TABS: readonly ReconTab[] = ["OPEN", "RESOLVED", "ALL"] as const;
export const SEVERITIES: readonly ReconSeverity[] = ["HIGH", "MEDIUM", "LOW"] as const;

export type ReconUrlFilters = {
  status: ReconTab;
  severity?: ReconSeverity;
  rule?: ReconRule;
  from?: string;
  to?: string;
  /** item 03 (DEC-488): sàn / shop ở URL (`platform`, `shop`). */
  platform?: Platform | null;
  shop?: string | null;
  page?: number;
};

export const PAGE_SIZE = 20;
export const DEFAULT_TAB: ReconTab = "OPEN";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const oneOf = <T extends string>(v: string | null, all: readonly T[]): T | undefined =>
  v && (all as readonly string[]).includes(v) ? (v as T) : undefined;
const day = (v: string | null) => (v && DAY.test(v) ? v : undefined);

export function reconFiltersFromParams(p: URLSearchParams): ReconUrlFilters {
  const page = Number(p.get("page"));
  return {
    ...platformUrlFields(p),
    status: oneOf(p.get("status"), RECON_TABS) ?? DEFAULT_TAB,
    severity: oneOf(p.get("severity"), SEVERITIES),
    rule: oneOf(p.get("rule"), RECON_RULES),
    from: day(p.get("from")),
    to: day(p.get("to")),
    page: Number.isInteger(page) && page > 1 ? page : undefined,
  };
}

export function paramsFromReconFilters(f: ReconUrlFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.status !== DEFAULT_TAB) out.status = f.status;
  for (const k of ["severity", "rule", "from", "to"] as const) if (f[k]) out[k] = f[k]!;
  Object.assign(out, platformToParams({ platform: f.platform ?? null, shopId: f.shop ?? null }));
  if (f.page && f.page > 1) out.page = String(f.page);
  return out;
}

/** Tab "Đã xử lý" = `RESOLVED` (người xử lý); cảnh báo tự hết (`AUTO_RESOLVED`) xem ở "Tất cả" (DEC-349). */
export const toApiReconFilters = (f: ReconUrlFilters): ReconFilters => ({
  status: f.status,
  severity: f.severity,
  rule: f.rule,
  date_from: f.from,
  date_to: f.to,
  ...platformToApi({ platform: f.platform ?? null, shopId: f.shop ?? null }),
  page: f.page ?? 1,
  page_size: PAGE_SIZE,
});

export const hasReconFilters = (f: ReconUrlFilters) =>
  Boolean(f.severity || f.rule || f.from || f.to || f.platform || f.shop);
