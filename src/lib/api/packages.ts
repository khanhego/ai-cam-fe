import type { SessionStatus, WarehouseStatus } from "@/shared/labels";

import { api } from "./client";
import type { SessionFlag } from "./station";
import type { Page } from "./stations";

/** API-30, API-31 (02 §6.2). */
export type PackageListItem = {
  id: string;
  tracking_number: string;
  platform_order_sn: string | null;
  warehouse_status: WarehouseStatus;
  platform_status: string | null;
  source: "API" | "CSV";
  last_session: { station_name: string; ended_at: string | null } | null;
  has_clip: boolean;
};

/** Tham số API-30; cũng là search params của D3 (02b-admin §3 `PackageFilters`). */
export type PackageFilters = {
  q?: string;
  date_from?: string;
  date_to?: string;
  station_id?: string;
  warehouse_status?: string;
  session_status?: string;
  session_flag?: string;
  source?: string;
  page?: number;
  page_size?: number;
};

export type ClipStatus = "PENDING" | "READY" | "FAILED" | "DELETED";

export type Clip = {
  id: string;
  camera_role: "CAM1" | "CAM2";
  status: ClipStatus;
  sha256: string | null;
  duration_s: number | null;
  held: boolean;
  /** READY không giữ → ngày sẽ xóa; giữ → null; DELETED → ngày đã xóa (02 v0.3 DEC-57). */
  retention_until: string | null;
  /** Lúc xóa theo lưu trữ (clip DELETED), v0.3. */
  deleted_at: string | null;
  /** Cờ của clip (vd. `VIDEO_INCOMPLETE`), v0.3. */
  flags: string[];
};

/** Lý do hủy phiên (02 §5 `session.cancel_reason`). */
export type CancelReason = "OUT_OF_STOCK" | "WRONG_SCAN" | "OTHER" | "SUPERVISOR";

export type PackageSession = {
  id: string;
  status: SessionStatus;
  station_name: string;
  started_at: string;
  ended_at: string | null;
  duration_s: number | null;
  flags: SessionFlag[];
  /** v0.3 (DEC-57): chỉ có khi phiên bị hủy. */
  cancel_reason: CancelReason | null;
  note: string | null;
  clips: Clip[];
};

export type PackageDetail = {
  id: string;
  tracking_number: string;
  warehouse_status: WarehouseStatus;
  platform_logistics_status: string | null;
  verified: boolean;
  order: {
    id: string;
    platform: string;
    platform_order_sn: string;
    platform_status: string | null;
    buyer_note: string | null;
    source: "API" | "CSV";
    items: { product_name: string; variation: string | null; quantity: number; image_url: string | null }[];
  } | null;
  sessions: PackageSession[];
  timeline: {
    at: string;
    source: "PLATFORM" | "WAREHOUSE" | "MANUAL";
    /** v0.3 (DEC-57). */
    from_status: string | null;
    to_status: string;
    actor: string | null;
  }[];
};

export const packagesApi = {
  search: (filters: PackageFilters) => api.get<Page<PackageListItem>>("/packages", { query: filters }),
  get: (id: string) => api.get<PackageDetail>(`/packages/${id}`),
};
