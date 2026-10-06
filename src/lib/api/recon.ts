import type { WarehouseStatus } from "@/shared/labels";

import { api } from "./client";
import type { Page } from "./stations";

/** API-120, 121, 123 (02 §6.2) — đối soát (D15). API-122 ở `packages.ts`. */
export type ReconRule =
  | "SHIPPED_NOT_PACKED"
  | "CANCELLED_AFTER_PACK"
  | "RETURN_OVERDUE"
  | "RETURN_UNANNOUNCED"
  | "PACKED_NOT_HANDED_OVER"
  | "RETURN_DONE_NOT_RECEIVED"
  | "UNVERIFIED_STALE";
export const RECON_RULES: readonly ReconRule[] = [
  "SHIPPED_NOT_PACKED",
  "CANCELLED_AFTER_PACK",
  "RETURN_OVERDUE",
  "RETURN_UNANNOUNCED",
  "PACKED_NOT_HANDED_OVER",
  "RETURN_DONE_NOT_RECEIVED",
  "UNVERIFIED_STALE",
] as const;
export type ReconSeverity = "HIGH" | "MEDIUM" | "LOW";
export type ReconStatus = "OPEN" | "RESOLVED" | "AUTO_RESOLVED";

export type ReconResolution = {
  action: "RESOLVE" | "ADJUST_STATUS" | "OPEN_CLAIM";
  note: string | null;
  by: { id: string; display_name: string } | null;
  at: string;
  to_status?: WarehouseStatus | null;
  claim_id?: string | null;
};

export type ReconAlert = {
  id: string;
  rule: ReconRule;
  br: string;
  severity: ReconSeverity;
  status: ReconStatus;
  package: {
    id: string;
    tracking_number: string;
    warehouse_status: WarehouseStatus;
    platform_status: string | null;
  };
  context: { since?: string; days?: number; hours?: number; [k: string]: unknown };
  detected_at: string;
  closed_at: string | null;
  resolution: ReconResolution | null;
  /** Đích hợp lệ cho "Điều chỉnh trạng thái kho" (API-122). */
  allowed_status_targets: WarehouseStatus[];
};

export type ReconFilters = {
  status?: ReconStatus | "ALL";
  severity?: ReconSeverity;
  rule?: ReconRule;
  package_id?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
};

export type ReconSummary = { open: Record<ReconSeverity, number> };
export type ReconList = Page<ReconAlert> & { summary: ReconSummary };

/** `details` của 409 ALREADY_RESOLVED (02 §6.2 API-121). */
export type ReconAlreadyResolved = {
  status?: ReconStatus;
  closed_at?: string | null;
  resolved_by?: { id: string; display_name: string } | null;
};

export const reconApi = {
  list: (filters: ReconFilters) =>
    api.get<ReconList>("/recon-alerts", {
      query: { ...filters, status: filters.status === "ALL" ? undefined : filters.status },
    }),
  /** API-121: ghi chú 1–500. 409 ALREADY_RESOLVED. */
  resolve: (id: string, note: string) => api.post<ReconAlert>(`/recon-alerts/${id}/resolve`, { note }),
  /** API-123: 202; 409 RECON_IN_PROGRESS. */
  run: () => api.post<{ queued: boolean }>("/recon/run"),
};
