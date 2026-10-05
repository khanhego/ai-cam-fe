import { api } from "./client";

/** API-70..73 — kết nối Shopee (02 §6.2). `last_error` là jsonb của BE (`shop.last_error`), đọc phòng thủ. */
export type ShopAuthStatus = "CONNECTED" | "EXPIRED" | "DISCONNECTED";
export type ShopError = { code?: string; message?: string; at?: string } | null;
export type Shop = {
  id: string;
  platform: "SHOPEE";
  name: string | null;
  auth_status: ShopAuthStatus;
  auth_expires_at: string | null;
  last_synced_at: string | null;
  today_synced_orders: number;
  last_error: ShopError;
};

export const shopsApi = {
  list: () => api.get<{ items: Shop[] }>("/shops"),
  /** API-71: URL ủy quyền (state chống CSRF, hạn 10 phút). 503 PLATFORM_NOT_CONFIGURED. */
  authUrl: () => api.post<{ url: string }>("/shops/shopee/auth-url"),
  /** API-73: 202 `{queued: true}`. 409 SYNC_IN_PROGRESS. */
  sync: (id: string) => api.post<{ queued: boolean }>(`/shops/${id}/sync`),
};
