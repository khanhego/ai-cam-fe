import type {
  ClaimBrief,
  Conclusion,
  InspectionCorrectionInput,
  ReturnCaseStatus,
  ReturnKind,
} from "@/shared/returns/types";
import type { WarehouseStatus } from "@/shared/labels";

import { api } from "./client";
import type { PackageSession } from "./packages";
import type { Page } from "./stations";

/** API-110..113 (02 §6.2) — hồ sơ hàng hoàn (D14, khối Hàng hoàn ở D4). */
export type ReturnTab = "EXPECTED" | "MISSING" | "RECEIVED" | "NO_PARCEL" | "UNIDENTIFIED" | "ALL";
export const RETURN_TABS: readonly ReturnTab[] = [
  "EXPECTED",
  "MISSING",
  "RECEIVED",
  "NO_PARCEL",
  "UNIDENTIFIED",
  "ALL",
] as const;

export type ReturnListItem = {
  id: string;
  code: string;
  kind: ReturnKind;
  status: ReturnCaseStatus;
  order: { id: string; platform_order_sn: string } | null;
  packages: { id: string; tracking_number: string; warehouse_status: WarehouseStatus }[];
  return_tracking_number: string | null;
  reason_label: string | null;
  reported_at: string | null;
  expected_since: string | null;
  /** Số ngày chờ (Đang về / Quá hạn). */
  waiting_days: number | null;
  received_at: string | null;
  conclusion: Conclusion | null;
  claims: ClaimBrief[];
  /** Hồ sơ đã gộp vào hồ sơ khác (API-112) — `{id, code}` hoặc null. */
  merged_into: { id: string; code: string } | null;
};

/** Tham số API-110; cũng là search params của D14 (`from`/`to` trên URL map sang `date_from`/`date_to`). */
export type ReturnFilters = {
  tab?: ReturnTab;
  kind?: ReturnKind;
  q?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
};

export type ReturnList = Page<ReturnListItem> & {
  tab_counts: Record<Exclude<ReturnTab, "ALL">, number>;
};

export type ReturnSessionBrief = {
  id: string;
  package_id: string;
  status: string;
  station_name: string;
  operator_name: string | null;
  started_at: string;
  ended_at: string | null;
  conclusion: Conclusion | null;
};

export type ReturnDetail = ReturnListItem & {
  platform_return_sn: string | null;
  platform_status: string | null;
  needs_parcel: boolean | null;
  reason: string | null;
  reason_text: string | null;
  seller_due_at: string | null;
  source: "PLATFORM" | "WAREHOUSE";
  requested_items: {
    order_item_id: string | null;
    product_name: string;
    variation: string | null;
    quantity: number;
  }[];
  sessions: ReturnSessionBrief[];
};

/** API-112: hồ sơ đích (gộp nếu đơn đã có hồ sơ mở) + hồ sơ khiếu nại bị gộp (02 §6.2, DEC-248, 260). */
export type LinkOrderResult = ReturnDetail & {
  merged_claims: { from: string; into: string }[];
};

export const returnsApi = {
  list: (filters: ReturnFilters) => api.get<ReturnList>("/returns", { query: filters }),
  get: (id: string) => api.get<ReturnDetail>(`/returns/${id}`),
  /** 409 NOT_UNIDENTIFIED / PACKAGE_ALREADY_RETURNED / NOT_ELIGIBLE. */
  linkOrder: (id: string, packageId: string) =>
    api.post<LinkOrderResult>(`/returns/${id}/link-order`, { package_id: packageId }),
  /** API-113 (≤ 7 ngày): 409 CORRECTION_WINDOW_EXPIRED / NOT_RETURN_SESSION; 422 CONCLUSION_INCONSISTENT. */
  correctInspection: (sessionId: string, body: InspectionCorrectionInput) =>
    api.put<PackageSession>(`/sessions/${sessionId}/inspection`, body),
};
