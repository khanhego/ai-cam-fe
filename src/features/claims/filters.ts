import {
  CLAIM_STATUSES,
  type ClaimFilters,
  type ClaimStatus,
  type ClaimType,
  type Counterparty,
} from "@/lib/api/claims";
import { CLAIM_TYPE, COUNTERPARTY } from "@/shared/returns/labels";

/** Bộ lọc D16 ↔ URL (02b-admin §1: `/admin/claims?status=&type=&counterparty=&owner=&due=&q=&page=`). */
export type ClaimTab = ClaimStatus | "ALL";
export type ClaimUrlFilters = {
  status: ClaimTab;
  type?: ClaimType;
  counterparty?: Counterparty;
  /** "Của tôi" (01 §10.5 D16) → `owner=me`. */
  owner?: "me";
  due?: "soon" | "overdue";
  q?: string;
  page?: number;
};

export const PAGE_SIZE = 20;
/** Tab mặc định "Mới" (tab đầu — như D14 mở tab đầu "Đang về"). */
export const DEFAULT_TAB: ClaimTab = "NEW";

const oneOf = <T extends string>(v: string | null, all: readonly T[]): T | undefined =>
  v && (all as readonly string[]).includes(v) ? (v as T) : undefined;

export function claimFiltersFromParams(p: URLSearchParams): ClaimUrlFilters {
  const page = Number(p.get("page"));
  const q = p.get("q")?.trim();
  return {
    status: oneOf(p.get("status"), [...CLAIM_STATUSES, "ALL"] as const) ?? DEFAULT_TAB,
    type: oneOf(p.get("type"), Object.keys(CLAIM_TYPE) as ClaimType[]),
    counterparty: oneOf(p.get("counterparty"), Object.keys(COUNTERPARTY) as Counterparty[]),
    owner: p.get("owner") === "me" ? "me" : undefined,
    due: oneOf(p.get("due"), ["soon", "overdue"] as const),
    q: q ? q.slice(0, 64) : undefined,
    page: Number.isInteger(page) && page > 1 ? page : undefined,
  };
}

export function paramsFromClaimFilters(f: ClaimUrlFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.status !== DEFAULT_TAB) out.status = f.status;
  for (const k of ["type", "counterparty", "owner", "due", "q"] as const) if (f[k]) out[k] = f[k]!;
  if (f.page && f.page > 1) out.page = String(f.page);
  return out;
}

export const toApiClaimFilters = (f: ClaimUrlFilters): ClaimFilters => ({
  status: f.status === "ALL" ? undefined : f.status,
  type: f.type,
  counterparty: f.counterparty,
  owner: f.owner,
  due: f.due,
  q: f.q,
  page: f.page ?? 1,
  page_size: PAGE_SIZE,
});

export const hasClaimFilters = (f: ClaimUrlFilters) =>
  Boolean(f.type || f.counterparty || f.owner || f.due || f.q);
