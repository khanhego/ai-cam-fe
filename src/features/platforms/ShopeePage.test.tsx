import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { login } from "@/lib/api/auth";
import { mockShopee, mockShops, seedLegacySingleShop } from "@/mocks/handlers/shops";
import { renderApp } from "@/test/render";

beforeEach(async () => {
  await login("tst_admin", "matkhau123", "DASHBOARD");
  // Dữ liệu một shop Shopee của Phase 1–2: D7 cũ tới khi T-253 thay bằng `PlatformsPage`.
  seedLegacySingleShop();
});

const card = () => screen.findByRole("region", { name: "Shop TST" });

test("D7: shop đã kết nối — trạng thái, hạn ủy quyền, lần đồng bộ, số đơn hôm nay", async () => {
  renderApp("/admin/settings/shopee");

  const shop = await card();
  expect(within(shop).getByText("Đã kết nối")).toBeInTheDocument();
  expect(within(shop).getByText("Đơn đồng bộ hôm nay").nextSibling).toHaveTextContent("140");
  expect(within(shop).getByRole("button", { name: "Kết nối lại" })).toBeInTheDocument();
  expect(within(shop).getByRole("button", { name: "Đồng bộ ngay" })).toBeInTheDocument();
});

test("TC-05.01 (UI): chưa kết nối → Kết nối Shopee → về D7 mới ?platform=shopee&result=connected&count=1", async () => {
  const user = userEvent.setup();
  mockShops.splice(0);
  const router = renderApp("/admin/settings/shopee");

  expect(await screen.findByText("Chưa kết nối shop Shopee nào.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Kết nối Shopee" }));

  // item 03 (API-72): callback về `/admin/settings/platforms` — route + Alert kiểm ở T-252 / T-253.
  await waitFor(() => expect(router.state.location.pathname).toBe("/admin/settings/platforms"));
  expect(router.state.location.search).toBe("?platform=shopee&result=connected&count=1");
});

test("TC-05.02 (UI): ?result=denied / error → Alert lỗi đúng chữ", async () => {
  renderApp("/admin/settings/shopee?result=denied");
  expect(
    await screen.findByText("Shopee từ chối ủy quyền. Bấm Kết nối lại để thử lần nữa."),
  ).toBeInTheDocument();
});

test("D7: ?result=error → Kết nối Shopee thất bại", async () => {
  renderApp("/admin/settings/shopee?result=error");
  expect(await screen.findByText("Kết nối Shopee thất bại. Thử lại sau ít phút.")).toBeInTheDocument();
});

test("TC-05.03 (UI): chưa cấu hình partner → Alert hướng dẫn dùng Nhập đơn từ file", async () => {
  const user = userEvent.setup();
  mockShopee.configured = false;
  mockShops.splice(0);
  renderApp("/admin/settings/shopee");

  await user.click(await screen.findByRole("button", { name: "Kết nối Shopee" }));

  expect(
    await screen.findByText("Chưa cấu hình Shopee Open Platform. Dùng Nhập đơn từ file."),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Mở Nhập đơn" })).toHaveAttribute("href", "/admin/imports");
});

test("TC-05.10 (UI): ủy quyền hết hạn → chip Hết hạn + Kết nối lại, không có Đồng bộ ngay", async () => {
  mockShops[0]!.auth_status = "EXPIRED";
  renderApp("/admin/settings/shopee");

  const shop = await card();
  expect(within(shop).getByText("Hết hạn")).toBeInTheDocument();
  expect(within(shop).getByRole("button", { name: "Kết nối lại" })).toBeInTheDocument();
  expect(within(shop).queryByRole("button", { name: "Đồng bộ ngay" })).not.toBeInTheDocument();
});

test("TC-05.09 (UI): lỗi đồng bộ gần nhất → câu thân thiện theo code + thời gian; chi tiết kỹ thuật trong details", async () => {
  mockShops[0]!.last_error = {
    code: "SYNC_FAILED",
    message: "HTTPStatusError 503 /api/v2/order/get_order_list",
    at: "2026-10-05T03:00:00Z",
  };
  renderApp("/admin/settings/shopee");

  const shop = await card();
  expect(
    await within(shop).findByText(
      "Đồng bộ lỗi lúc 05/10/2026 10:00:00: Shopee không phản hồi sau nhiều lần thử. Bấm Đồng bộ ngay để thử lại.",
    ),
  ).toBeInTheDocument();
  const tech = within(shop).getByText("Chi tiết kỹ thuật").closest("details")!;
  expect(tech).not.toHaveAttribute("open");
  expect(tech).toHaveTextContent("SYNC_FAILED: HTTPStatusError 503 /api/v2/order/get_order_list");
});

test("P2-17: shop cũ DISCONNECTED (đã thay) không thành thẻ 'Chưa kết nối' — chỉ thẻ shop hiện hành + danh sách gọn", async () => {
  mockShops.push({
    id: "shop-0",
    platform: "SHOPEE",
    name: "Shop Cũ",
    auth_status: "DISCONNECTED",
    auth_expires_at: null,
    last_synced_at: "2026-09-01T03:00:00Z",
    today_synced_orders: 0,
    last_error: null,
    region: null,
    sync_warnings: [],
    disconnected_at: "2026-09-01T03:00:00Z",
    sync_in_progress: false,
  });
  mockShops.reverse(); // shop cũ đứng trước trong danh sách API
  renderApp("/admin/settings/shopee");

  expect(await card()).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Shop Cũ" })).not.toBeInTheDocument();
  expect(screen.queryByText("Chưa kết nối")).not.toBeInTheDocument();
  expect(screen.getByText("Shop đã thay (1)")).toBeInTheDocument();
  expect(within(screen.getByRole("list", { name: "Shop đã thay" })).getByText(/Shop Cũ/)).toBeInTheDocument();
});

test("F34a: Đồng bộ ngay gặp 409 SHOP_NOT_CONNECTED → Alert + tải lại danh sách (thẻ về Hết hạn)", async () => {
  const user = userEvent.setup();
  renderApp("/admin/settings/shopee");
  const shop = await card();
  mockShops[0]!.auth_status = "EXPIRED"; // hết hạn sau khi trang đã tải

  await user.click(within(shop).getByRole("button", { name: "Đồng bộ ngay" }));

  expect(
    await screen.findByText("Shop chưa kết nối hoặc ủy quyền đã hết hạn. Bấm Kết nối lại."),
  ).toBeInTheDocument();
  expect(await within(await card()).findByText("Hết hạn")).toBeInTheDocument();
  expect(within(await card()).queryByRole("button", { name: "Đồng bộ ngay" })).not.toBeInTheDocument();
});

test("D7: Đồng bộ ngay → toast, số liệu làm mới; bấm lại khi đang chạy → Đang đồng bộ", async () => {
  const user = userEvent.setup();
  renderApp("/admin/settings/shopee");
  const shop = await card();

  await user.click(within(shop).getByRole("button", { name: "Đồng bộ ngay" }));
  expect(await screen.findByText("Đã bắt đầu đồng bộ. Số liệu sẽ tự cập nhật.")).toBeInTheDocument();
  await waitFor(() =>
    expect(within(shop).getByText("Đơn đồng bộ hôm nay").nextSibling).toHaveTextContent("145"),
  );

  mockShopee.syncing = true;
  await user.click(within(shop).getByRole("button", { name: "Đồng bộ ngay" }));
  expect(await screen.findByText("Đang đồng bộ, thử lại sau.")).toBeInTheDocument();
});

test("TC-P.08 (UI): Supervisor không vào được D7 / D8, menu không có", async () => {
  await login("tst_sup", "matkhau123", "DASHBOARD");
  const router = renderApp("/admin/settings/shopee");

  await waitFor(() => expect(router.state.location.pathname).toBe("/admin/forbidden"));
  const nav = screen.getByRole("navigation", { name: "Điều hướng chính" });
  expect(within(nav).queryByRole("link", { name: /Kết nối Shopee/ })).not.toBeInTheDocument();
  expect(within(nav).queryByRole("link", { name: /Lưu trữ video/ })).not.toBeInTheDocument();
});
