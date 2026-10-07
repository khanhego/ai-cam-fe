import { http, HttpResponse } from "msw";

import type { ConnectResult, PlatformConfig, Shop, ShopBrief } from "@/lib/api/shops";
import type { Platform } from "@/shared/labels";

import { API, apiError, json } from "../http";
import { SHOP, type MockShopRef } from "../shopsDb";
import { dashboardEvent } from "../ws";
import { DASHBOARD_ROLES, requireRole } from "./session";

/**
 * API-70..73 (T-58) + item 03 (T-251, 02b-admin §12): `platforms[]` (TikTok bật), 2 shop Shopee + 2 TikTok (TikTok B
 * `EXPIRED`) + 1 shop Shopee đã ngắt, `sync_warnings`; API-71 theo sàn trả thẳng URL callback D7
 * (`?platform=tiktok&result=connected&count=2` — như API-72 / API-155 redirect về); API-154 ngắt; API-156 rút gọn.
 * Test đổi được `mockShopee` / `mockTiktok` / `mockShops`.
 */
export const mockShops: Shop[] = [];
export const mockShopee = { configured: true, syncing: false, nextAuthResult: "connected" as string };
export const mockTiktok = { enabled: true, configured: true, nextAuthResult: "connected" as string };

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

function shopOf(ref: MockShopRef, extra: Partial<Shop> = {}): Shop {
  const now = Date.now();
  return {
    id: ref.id,
    platform: ref.platform,
    name: ref.name,
    region: ref.platform === "TIKTOK" ? "VN" : null,
    auth_status: "CONNECTED",
    auth_expires_at: iso(now + (ref.platform === "TIKTOK" ? 7 : 20) * DAY),
    last_synced_at: iso(now - 3 * 60_000),
    today_synced_orders: 0,
    last_error: null,
    sync_warnings: [],
    disconnected_at: null,
    sync_in_progress: false,
    ...extra,
  };
}

export function resetMockShops() {
  const now = Date.now();
  mockShops.splice(
    0,
    mockShops.length,
    shopOf(SHOP.A, { today_synced_orders: 140 }),
    shopOf(SHOP.B, {
      today_synced_orders: 12,
      sync_warnings: [
        {
          code: "TRACKING_OWNED_BY_OTHER_SHOP",
          tracking_number: "SPXTST0000010",
          message: "Mã vận đơn SPXTST0000010 đã thuộc đơn của shop TST Shop A (Shopee).",
          at: iso(now - 40 * 60_000),
        },
      ],
    }),
    shopOf(
      { id: "shop-old", platform: "SHOPEE", name: "TST Shop cũ" },
      {
        auth_status: "DISCONNECTED",
        auth_expires_at: null,
        last_synced_at: iso(now - 30 * DAY),
        disconnected_at: iso(now - 30 * DAY),
      },
    ),
    shopOf(SHOP.TT_A, { today_synced_orders: 58 }),
    shopOf(SHOP.TT_B, {
      auth_status: "EXPIRED",
      auth_expires_at: iso(now - DAY),
      last_synced_at: iso(now - DAY - 3600_000),
      last_error: { code: "AUTH_EXPIRED", message: "access token expired", at: iso(now - DAY) },
    }),
  );
  Object.assign(mockShopee, { configured: true, syncing: false, nextAuthResult: "connected" });
  Object.assign(mockTiktok, { enabled: true, configured: true, nextAuthResult: "connected" });
}
resetMockShops();

/** `platforms[]` của API-70 (02 §6.2): `configured` = cờ bật **và** đủ khóa ứng dụng. */
export function platformConfigs(): PlatformConfig[] {
  return [
    { platform: "SHOPEE", enabled: true, returns_enabled: false, configured: mockShopee.configured },
    {
      platform: "TIKTOK",
      enabled: mockTiktok.enabled,
      returns_enabled: false,
      configured: mockTiktok.enabled && mockTiktok.configured,
    },
  ];
}
const configured = (p: Platform) => platformConfigs().find((c) => c.platform === p)!.configured;

const NOT_CONFIGURED = (p: Platform) =>
  p === "TIKTOK"
    ? apiError(
        503,
        "PLATFORM_NOT_CONFIGURED",
        "Chưa cấu hình TikTok Shop. Liên hệ IT để bật (cần tài khoản đối tác TikTok Shop).",
      )
    : apiError(503, "PLATFORM_NOT_CONFIGURED", "Chưa cấu hình Shopee Open Platform. Dùng Nhập đơn từ file.");

/** Mock của callback API-72 / API-155: tạo mới hoặc cập nhật token, **không** ngắt shop khác. Trả số shop đã thêm / cập nhật. */
function connect(platform: Platform): number {
  const refs: MockShopRef[] = platform === "TIKTOK" ? [SHOP.TT_A, SHOP.TT_B] : [SHOP.A];
  for (const ref of refs) {
    const fresh = {
      auth_status: "CONNECTED" as const,
      auth_expires_at: iso(Date.now() + (platform === "TIKTOK" ? 7 : 30) * DAY),
      last_error: null,
      disconnected_at: null,
    };
    const shop = mockShops.find((s) => s.id === ref.id);
    if (shop) Object.assign(shop, fresh);
    else mockShops.push(shopOf(ref, { last_synced_at: null, ...fresh }));
    dashboardEvent("shop.updated", { shop_id: ref.id, auth_status: "CONNECTED", last_synced_at: null });
  }
  return refs.length;
}

export const connectUrl = (platform: Platform, result: ConnectResult | string, count?: number) =>
  `/admin/settings/platforms?platform=${platform === "TIKTOK" ? "tiktok" : "shopee"}&result=${result}${
    result === "connected" && count ? `&count=${count}` : ""
  }`;

const byPlatform = (a: { platform: Platform }, b: { platform: Platform }) =>
  a.platform === b.platform ? 0 : a.platform === "SHOPEE" ? -1 : 1;

export const shopsHandlers = [
  http.get(`${API}/shops`, ({ request }) => {
    const [, denied] = requireRole(request, ["ADMIN"]);
    if (denied) return denied;
    // Lần đọc sau "Đồng bộ ngay": coi như job đã chạy xong.
    if (mockShopee.syncing) {
      mockShopee.syncing = false;
      const running = mockShops.filter((x) => x.sync_in_progress);
      for (const s of running.length ? running : mockShops.filter((x) => x.auth_status === "CONNECTED")) {
        s.sync_in_progress = false;
        s.last_synced_at = new Date().toISOString();
        s.today_synced_orders += 5;
        s.last_error = null;
      }
    }
    // Sắp theo sàn, rồi thứ tự tạo (02 §6.2 API-70).
    return json({ platforms: platformConfigs(), items: [...mockShops].sort(byPlatform) });
  }),

  http.get(`${API}/shops/brief`, ({ request }) => {
    const [, denied] = requireRole(request, DASHBOARD_ROLES);
    if (denied) return denied;
    const items: ShopBrief[] = mockShops
      .map((s) => ({ id: s.id, platform: s.platform, name: s.name ?? "—", auth_status: s.auth_status }))
      .sort((a, b) => byPlatform(a, b) || a.name.localeCompare(b.name, "vi"));
    return json({ items });
  }),

  http.post(`${API}/shops/:platform/auth-url`, ({ request, params }) => {
    const [, denied] = requireRole(request, ["ADMIN"]);
    if (denied) return denied;
    const platform = params.platform === "tiktok" ? "TIKTOK" : params.platform === "shopee" ? "SHOPEE" : null;
    if (!platform) return apiError(404, "NOT_FOUND", "Không tìm thấy sàn.");
    if (!configured(platform)) return NOT_CONFIGURED(platform);
    const result = platform === "TIKTOK" ? mockTiktok.nextAuthResult : mockShopee.nextAuthResult;
    const count = result === "connected" ? connect(platform) : 0;
    return HttpResponse.json({ url: connectUrl(platform, result, count) });
  }),

  http.post(`${API}/shops/:id/sync`, ({ request, params }) => {
    const [, denied] = requireRole(request, ["ADMIN"]);
    if (denied) return denied;
    const shop = mockShops.find((s) => s.id === params.id);
    if (!shop) return apiError(404, "NOT_FOUND", "Không tìm thấy shop.");
    if (!configured(shop.platform)) return NOT_CONFIGURED(shop.platform);
    if (shop.auth_status !== "CONNECTED")
      return apiError(
        409,
        "SHOP_NOT_CONNECTED",
        "Shop chưa kết nối hoặc ủy quyền đã hết hạn. Bấm Kết nối lại.",
      );
    if (mockShopee.syncing || shop.sync_in_progress)
      return apiError(409, "SYNC_IN_PROGRESS", "Đang đồng bộ, thử lại sau.");
    mockShopee.syncing = true;
    shop.sync_in_progress = true;
    return HttpResponse.json({ queued: true }, { status: 202 });
  }),

  // API-154 (02 §6.2): idempotent; đơn / kiện / hồ sơ giữ nguyên (EX-T7).
  http.post(`${API}/shops/:id/disconnect`, ({ request, params }) => {
    const [, denied] = requireRole(request, ["ADMIN"]);
    if (denied) return denied;
    const shop = mockShops.find((s) => s.id === params.id);
    if (!shop) return apiError(404, "NOT_FOUND", "Không tìm thấy shop.");
    if (shop.auth_status !== "DISCONNECTED") {
      Object.assign(shop, {
        auth_status: "DISCONNECTED",
        auth_expires_at: null,
        disconnected_at: new Date().toISOString(),
        sync_in_progress: false,
      });
      dashboardEvent("shop.updated", {
        shop_id: shop.id,
        auth_status: shop.auth_status,
        last_synced_at: shop.last_synced_at,
      });
    }
    return json(shop);
  }),
];
