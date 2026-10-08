import { SHARE_LIST_STATUSES, type ShareFilters, type ShareListStatus } from "@/lib/api/shares";

/** Bộ lọc D21 ↔ URL (02b-admin §1: `/admin/shares?status=&q=&mine=&claim_id=&package_id=&page=`). */
export type ShareUrlFilters = {
  status: ShareListStatus;
  q?: string;
  mine?: boolean;
  claim_id?: string;
  package_id?: string;
  page?: number;
};

export const PAGE_SIZE = 20;
export const DEFAULT_STATUS: ShareListStatus = "ACTIVE";

export function shareFiltersFromParams(p: URLSearchParams): ShareUrlFilters {
  const status = p.get("status");
  const page = Number(p.get("page"));
  const q = p.get("q")?.trim();
  return {
    status: (SHARE_LIST_STATUSES as readonly string[]).includes(status ?? "")
      ? (status as ShareListStatus)
      : DEFAULT_STATUS,
    q: q ? q.slice(0, 64) : undefined,
    mine: p.get("mine") === "true" || undefined,
    claim_id: p.get("claim_id") || undefined,
    package_id: p.get("package_id") || undefined,
    page: Number.isInteger(page) && page > 1 ? page : undefined,
  };
}

export function paramsFromShareFilters(f: ShareUrlFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.status !== DEFAULT_STATUS) out.status = f.status;
  if (f.q) out.q = f.q;
  if (f.mine) out.mine = "true";
  if (f.claim_id) out.claim_id = f.claim_id;
  if (f.package_id) out.package_id = f.package_id;
  if (f.page && f.page > 1) out.page = String(f.page);
  return out;
}

export const hasShareFilters = (f: ShareUrlFilters) => Boolean(f.q || f.mine || f.claim_id || f.package_id);

export const toApiShareFilters = (f: ShareUrlFilters): ShareFilters => ({
  status: f.status,
  q: f.q,
  mine: f.mine,
  claim_id: f.claim_id,
  package_id: f.package_id,
  page: f.page ?? 1,
  page_size: PAGE_SIZE,
});

/** Nguồn để "Xem tất cả" mở D21 lọc theo hồ sơ / kiện (API-161 `claim_id` / `package_id`). */
export type ShareSourceQuery = { claim_id: string } | { package_id: string };

export const sharesPath = (q: ShareSourceQuery) =>
  `/admin/shares?${new URLSearchParams({ status: "ALL", ...q }).toString()}`;
