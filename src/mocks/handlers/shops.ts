import { http, HttpResponse } from "msw";

import type { Shop } from "@/lib/api/shops";

import { API, apiError } from "../http";
import { requireRole } from "./session";

/**
 * API-70..73 theo 02 §6.2 (T-58; BE T-16/T-22 làm song song). Mock không có Shopee thật: API-71 trả thẳng URL
 * callback `?result=connected` (như API-72 redirect về) và đánh dấu shop đã kết nối. Test đổi được `mockShopee`.
 */
export const mockShops: Shop[] = [];
export const mockShopee = { configured: true, syncing: false, nextAuthResult: "connected" as string };

export function resetMockShops() {
  const now = Date.now();
  mockShops.splice(0, mockShops.length, {
    id: "shop-1",
    platform: "SHOPEE",
    name: "Shop TST",
    auth_status: "CONNECTED",
    auth_expires_at: new Date(now + 20 * 86_400_000).toISOString(),
    last_synced_at: new Date(now - 3 * 60_000).toISOString(),
    today_synced_orders: 140,
    last_error: null,
  });
  Object.assign(mockShopee, { configured: true, syncing: false, nextAuthResult: "connected" });
}
resetMockShops();

const NOT_CONFIGURED = () =>
  apiError(503, "PLATFORM_NOT_CONFIGURED", "Chưa cấu hình Shopee Open Platform. Dùng Nhập đơn từ file.");

export const shopsHandlers = [
  http.get(`${API}/shops`, ({ request }) => {
    const [, denied] = requireRole(request, ["ADMIN"]);
    if (denied) return denied;
    // Lần đọc sau "Đồng bộ ngay": coi như job đã chạy xong.
    if (mockShopee.syncing) {
      mockShopee.syncing = false;
      for (const s of mockShops) {
        s.last_synced_at = new Date().toISOString();
        s.today_synced_orders += 5;
        s.last_error = null;
      }
    }
    return HttpResponse.json({ items: mockShops });
  }),

  http.post(`${API}/shops/shopee/auth-url`, ({ request }) => {
    const [, denied] = requireRole(request, ["ADMIN"]);
    if (denied) return denied;
    if (!mockShopee.configured) return NOT_CONFIGURED();
    const result = mockShopee.nextAuthResult;
    if (result === "connected") {
      const shop = mockShops[0];
      const fresh = {
        auth_status: "CONNECTED" as const,
        auth_expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        last_error: null,
      };
      if (shop) Object.assign(shop, fresh);
      else
        mockShops.push({
          id: "shop-1",
          platform: "SHOPEE",
          name: "Shop TST",
          last_synced_at: null,
          today_synced_orders: 0,
          ...fresh,
        });
    }
    return HttpResponse.json({ url: `/admin/settings/shopee?result=${result}` });
  }),

  http.post(`${API}/shops/:id/sync`, ({ request, params }) => {
    const [, denied] = requireRole(request, ["ADMIN"]);
    if (denied) return denied;
    if (!mockShopee.configured) return NOT_CONFIGURED();
    const shop = mockShops.find((s) => s.id === params.id);
    if (!shop) return apiError(404, "NOT_FOUND", "Không tìm thấy shop.");
    if (mockShopee.syncing) return apiError(409, "SYNC_IN_PROGRESS", "Đang đồng bộ, thử lại sau.");
    mockShopee.syncing = true;
    return HttpResponse.json({ queued: true }, { status: 202 });
  }),
];
