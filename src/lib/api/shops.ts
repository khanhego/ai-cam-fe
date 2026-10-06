import type { Platform } from "@/shared/labels";

import { api } from "./client";

/**
 * API-70..73 (02 §6.2 item 01) + item 03 (02 §6.2 "API-70 mở rộng", "API-71 / API-72 / API-155 / API-154", API-156):
 * nhiều shop / nhiều sàn. `last_error` là jsonb của BE (`shop.last_error`), đọc phòng thủ.
 */
export type ShopAuthStatus = "CONNECTED" | "EXPIRED" | "DISCONNECTED";
/** `code` thêm ở item 03: AUTH_EXPIRED, REFRESH_FAILED, SYNC_FAILED, CREDENTIALS_UNREADABLE, SHOP_NOT_AUTHORIZED. */
export type ShopError = { code?: string; message?: string; at?: string } | null;

/** `sync_warnings[]` (≤ 20, mới nhất trước) — EX-T2. */
export type SyncWarning = {
  code: "TRACKING_OWNED_BY_OTHER_SHOP" | "ORDER_SKIPPED_PLATFORM_FULFILLED" | (string & {});
  message: string;
  at: string;
  tracking_number?: string | null;
};

export type Shop = {
  id: string;
  platform: Platform;
  name: string | null;
  /** item 03: null khi sàn không trả vùng. */
  region: string | null;
  auth_status: ShopAuthStatus;
  auth_expires_at: string | null;
  last_synced_at: string | null;
  today_synced_orders: number;
  last_error: ShopError;
  sync_warnings: SyncWarning[];
  disconnected_at: string | null;
  sync_in_progress: boolean;
};

/** Cấu hình từng sàn: `enabled = false` hoặc `configured = false` → D7 "Chưa cấu hình …", khóa nút kết nối (EX-T1). */
export type PlatformConfig = {
  platform: Platform;
  enabled: boolean;
  returns_enabled: boolean;
  configured: boolean;
};

export type ShopList = { platforms: PlatformConfig[]; items: Shop[] };

/** API-156: shop rút gọn cho bộ lọc sàn / shop (mọi vai dashboard — DEC-484), gồm cả shop đã ngắt. */
export type ShopBrief = { id: string; platform: Platform; name: string; auth_status: ShopAuthStatus };

/** Kết quả callback API-72 / API-155 trên URL D7 (`?platform=&result=&count=`). */
export type ConnectResult = "connected" | "denied" | "expired" | "error";

const platformPath = (p: Platform) => (p === "TIKTOK" ? "tiktok" : "shopee");

export const shopsApi = {
  list: () => api.get<ShopList>("/shops"),
  /** API-156 (ADMIN, SUPERVISOR, CSKH). */
  brief: () => api.get<{ items: ShopBrief[] }>("/shops/brief"),
  /** API-71: URL ủy quyền theo sàn (state chống CSRF, hạn 10 phút). 503 PLATFORM_NOT_CONFIGURED, 404 sàn lạ. */
  authUrl: (platform: Platform = "SHOPEE") =>
    api.post<{ url: string }>(`/shops/${platformPath(platform)}/auth-url`),
  /** API-73: 202 `{queued: true}`. 409 SYNC_IN_PROGRESS / SHOP_NOT_CONNECTED; 503 PLATFORM_NOT_CONFIGURED. */
  sync: (id: string) => api.post<{ queued: boolean }>(`/shops/${id}/sync`),
  /** API-154: ngắt (idempotent) → item `DISCONNECTED`. */
  disconnect: (id: string) => api.post<Shop>(`/shops/${id}/disconnect`),
};
