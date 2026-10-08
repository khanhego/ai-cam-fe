import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { login } from "@/lib/api/auth";
import { mockShopee, mockShops, mockTiktok } from "@/mocks/handlers/shops";
import { renderApp } from "@/test/render";

import { isInAppUrl } from "./copy";

/**
 * D7 Kết nối sàn (T-253; 01 §10.5 D7 item 03, 02b-admin §13). Dữ liệu mock (DEC-549): Shopee "TST Shop A" (140 đơn),
 * "TST B" (cảnh báo EX-T2), "TST Shop cũ" đã ngắt; TikTok "TST TikTok A (mock)" (58 đơn), "TST TikTok B (mock)" hết hạn.
 */
beforeEach(async () => {
  await login("tst_admin", "matkhau123", "DASHBOARD");
});

const group = (name: "Shopee" | "TikTok Shop") => screen.findByRole("region", { name });
const card = (name: string) => screen.findByRole("region", { name });

test("D7: nhóm theo sàn, thẻ mỗi shop — trạng thái, hạn ủy quyền, lần đồng bộ, số đơn hôm nay", async () => {
  renderApp("/admin/settings/platforms");

  expect(await screen.findByRole("heading", { level: 1, name: "Kết nối sàn" })).toBeInTheDocument();
  const shopee = await group("Shopee");
  const tiktok = await group("TikTok Shop");
  const a = within(shopee).getByRole("region", { name: "TST Shop A" });
  expect(within(a).getByText("Đã kết nối")).toBeInTheDocument();
  expect(within(a).getByText("Đơn đồng bộ hôm nay").nextSibling).toHaveTextContent("140");
  expect(within(a).getByRole("button", { name: "Đồng bộ ngay" })).toBeInTheDocument();
  expect(within(a).getByRole("button", { name: "Thao tác khác cho TST Shop A" })).toBeInTheDocument();
  expect(within(tiktok).getByRole("region", { name: "TST TikTok A (mock)" })).toBeInTheDocument();
  // Shop của sàn này không lọt sang nhóm sàn kia.
  expect(within(tiktok).queryByRole("region", { name: "TST Shop A" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Kết nối Shopee" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Kết nối TikTok Shop" })).toBeEnabled();
});

test("TC-05.10 (UI) item 03: TikTok hết hạn → chip Hết hạn + câu theo sàn + Kết nối lại, không có Đồng bộ ngay", async () => {
  renderApp("/admin/settings/platforms");

  const b = await card("TST TikTok B (mock)");
  expect(within(b).getByText("Hết hạn")).toBeInTheDocument();
  expect(
    within(b).getByText(/^TikTok Shop từ chối ủy quyền lúc .*\. Bấm Kết nối lại để tiếp tục đồng bộ\.$/),
  ).toBeInTheDocument();
  expect(within(b).getByRole("button", { name: "Kết nối lại" })).toBeInTheDocument();
  expect(within(b).queryByRole("button", { name: "Đồng bộ ngay" })).not.toBeInTheDocument();
});

test("EX-T2: cảnh báo đồng bộ TRACKING_OWNED_BY_OTHER_SHOP hiện message server; ORDER_SKIPPED_PLATFORM_FULFILLED không hiện", async () => {
  mockShops[1]!.sync_warnings.push({
    code: "ORDER_SKIPPED_PLATFORM_FULFILLED",
    message: "Bỏ qua đơn do sàn giao",
    at: "2026-10-06T03:00:00Z",
  });
  renderApp("/admin/settings/platforms");

  const b = await card("TST B");
  const list = within(b).getByRole("list", { name: "Cảnh báo đồng bộ" });
  expect(
    within(list).getByText(/Mã vận đơn SPXTST0000010 đã thuộc đơn của shop TST Shop A \(Shopee\)\./),
  ).toBeInTheDocument();
  expect(within(b).queryByText(/Bỏ qua đơn do sàn giao/)).not.toBeInTheDocument();
});

test("TC-05.09 (UI): lỗi đồng bộ → câu theo code + sàn; chi tiết kỹ thuật trong details", async () => {
  mockShops[3]!.last_error = {
    code: "SYNC_FAILED",
    message: "HTTPStatusError 503 /api/order/202309/orders/search",
    at: "2026-10-05T02:30:00Z",
  };
  renderApp("/admin/settings/platforms");

  const tt = await card("TST TikTok A (mock)");
  expect(
    within(tt).getByText(
      "Đồng bộ lỗi lúc 05/10/2026 09:30:00: TikTok Shop không phản hồi sau nhiều lần thử. Bấm Đồng bộ ngay để thử lại.",
    ),
  ).toBeInTheDocument();
  const tech = within(tt).getByText("Chi tiết kỹ thuật").closest("details")!;
  expect(tech).not.toHaveAttribute("open");
  expect(tech).toHaveTextContent("SYNC_FAILED: HTTPStatusError 503");
});

test("UC-10 / AC-40: Kết nối TikTok Shop → ?result=connected&count=2 → Toast, query bị xóa, TikTok B hết hạn thành Đã kết nối, shop khác không bị ngắt", async () => {
  const user = userEvent.setup();
  const router = renderApp("/admin/settings/platforms");

  await user.click(await screen.findByRole("button", { name: "Kết nối TikTok Shop" }));

  expect(
    await screen.findByText("Đã kết nối 2 shop TikTok Shop. Lần đồng bộ đầu tiên chạy trong vài phút."),
  ).toBeInTheDocument();
  await waitFor(() => expect(router.state.location.search).toBe(""));
  const b = await card("TST TikTok B (mock)");
  await waitFor(() => expect(within(b).getByText("Đã kết nối")).toBeInTheDocument());
  expect(within(await card("TST Shop A")).getByText("Đã kết nối")).toBeInTheDocument();
});

test("TC-05.01 (UI): chưa có shop → EmptyState + Mở Nhập đơn; Kết nối Shopee → ?platform=shopee&result=connected&count=1", async () => {
  const user = userEvent.setup();
  mockShops.splice(0);
  renderApp("/admin/settings/platforms");

  expect(await screen.findByText("Chưa kết nối shop nào.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Mở Nhập đơn" })).toHaveAttribute("href", "/admin/imports");
  await user.click(screen.getByRole("button", { name: "Kết nối Shopee" }));

  expect(
    await screen.findByText("Đã kết nối 1 shop Shopee. Lần đồng bộ đầu tiên chạy trong vài phút."),
  ).toBeInTheDocument();
  expect(await card("TST Shop A")).toBeInTheDocument();
  expect(screen.queryByText("Chưa kết nối shop nào.")).not.toBeInTheDocument();
});

test.each([
  ["denied", "TikTok Shop từ chối ủy quyền. Bấm Kết nối lại để thử lần nữa."],
  ["expired", "Phiên kết nối đã hết hạn. Bấm Kết nối TikTok Shop để làm lại."],
  ["error", "Kết nối TikTok Shop thất bại. Thử lại sau ít phút."],
])(
  "UC-10 ngoại lệ: ?platform=tiktok&result=%s → Alert trong nhóm TikTok Shop, query bị xóa",
  async (r, text) => {
    const router = renderApp(`/admin/settings/platforms?platform=tiktok&result=${r}`);

    const tiktok = await group("TikTok Shop");
    expect(await within(tiktok).findByText(text)).toBeInTheDocument();
    expect(within(await group("Shopee")).queryByText(text)).not.toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toBe(""));
    expect(within(tiktok).getByText(text)).toBeInTheDocument();
  },
);

test("02b-admin §2: /admin/settings/shopee?result=denied (link cũ, không platform) → D7 mới, Alert Shopee", async () => {
  const router = renderApp("/admin/settings/shopee?result=denied");
  await waitFor(() => expect(router.state.location.pathname).toBe("/admin/settings/platforms"));
  expect(
    await within(await group("Shopee")).findByText(
      "Shopee từ chối ủy quyền. Bấm Kết nối lại để thử lần nữa.",
    ),
  ).toBeInTheDocument();
});

test("AC-44 / EX-T1: TikTok tắt trên máy chủ → Alert trong nhóm + nút Kết nối TikTok Shop khóa; Shopee vẫn kết nối được", async () => {
  mockTiktok.enabled = false;
  renderApp("/admin/settings/platforms");

  const tiktok = await group("TikTok Shop");
  expect(
    within(tiktok).getByText(
      "Chưa cấu hình TikTok Shop. Liên hệ IT để bật (cần tài khoản đối tác TikTok Shop).",
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Kết nối TikTok Shop" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Kết nối Shopee" })).toBeEnabled();
  expect(
    within(await card("TST TikTok B (mock)")).getByRole("button", { name: "Kết nối lại" }),
  ).toBeDisabled();
});

test("TC-05.03 (UI): Shopee chưa cấu hình → Alert + Mở Nhập đơn trong nhóm Shopee", async () => {
  mockShopee.configured = false;
  renderApp("/admin/settings/platforms");

  const shopee = await group("Shopee");
  expect(
    within(shopee).getByText("Chưa cấu hình Shopee Open Platform. Dùng Nhập đơn từ file."),
  ).toBeInTheDocument();
  expect(within(shopee).getByRole("link", { name: "Mở Nhập đơn" })).toHaveAttribute("href", "/admin/imports");
  expect(screen.getByRole("button", { name: "Kết nối Shopee" })).toBeDisabled();
});

test("EX-T7: ⋮ → Ngắt kết nối → Dialog xác nhận → Toast, shop vào 'Shop đã ngắt (n)' với Kết nối lại", async () => {
  const user = userEvent.setup();
  renderApp("/admin/settings/platforms");

  const tt = await card("TST TikTok A (mock)");
  await user.click(within(tt).getByRole("button", { name: "Thao tác khác cho TST TikTok A (mock)" }));
  await user.click(screen.getByRole("menuitem", { name: "Ngắt kết nối" }));

  const dialog = await screen.findByRole("dialog", { name: "Ngắt kết nối TST TikTok A (mock)?" });
  expect(
    within(dialog).getByText(/Hệ thống ngừng đồng bộ đơn, trạng thái và hàng hoàn của shop này\./),
  ).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Ngắt kết nối" }));

  expect(await screen.findByText("Đã ngắt kết nối TST TikTok A (mock).")).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.queryByRole("region", { name: "TST TikTok A (mock)" })).not.toBeInTheDocument(),
  );
  const tiktok = await group("TikTok Shop");
  const gone = within(tiktok).getByRole("list", { name: "Shop đã ngắt (1)" });
  expect(within(gone).getByText("TST TikTok A (mock)")).toBeInTheDocument();
  expect(within(gone).getByRole("button", { name: "Kết nối lại TST TikTok A (mock)" })).toBeEnabled();
  expect(mockShops.find((s) => s.id === "shop-tt-a")!.auth_status).toBe("DISCONNECTED");
});

test("Ngắt kết nối: Hủy → không gọi API, shop giữ nguyên", async () => {
  const user = userEvent.setup();
  renderApp("/admin/settings/platforms");

  const a = await card("TST Shop A");
  await user.click(within(a).getByRole("button", { name: "Thao tác khác cho TST Shop A" }));
  await user.click(screen.getByRole("menuitem", { name: "Ngắt kết nối" }));
  await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Hủy" }));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(mockShops[0]!.auth_status).toBe("CONNECTED");
});

test("Shop đã ngắt sẵn (Shopee 'TST Shop cũ') nằm trong mục thu gọn, không thành thẻ", async () => {
  renderApp("/admin/settings/platforms");

  const shopee = await group("Shopee");
  expect(within(shopee).queryByRole("region", { name: "TST Shop cũ" })).not.toBeInTheDocument();
  const details = within(shopee).getByText("Shop đã ngắt (1)").closest("details")!;
  expect(details).not.toHaveAttribute("open");
  expect(within(details).getByText("TST Shop cũ")).toBeInTheDocument();
});

test("F34a: Đồng bộ ngay gặp 409 SHOP_NOT_CONNECTED → Toast + tải lại (thẻ về Hết hạn)", async () => {
  const user = userEvent.setup();
  renderApp("/admin/settings/platforms");
  const a = await card("TST Shop A");
  mockShops[0]!.auth_status = "EXPIRED"; // hết hạn sau khi trang đã tải

  await user.click(within(a).getByRole("button", { name: "Đồng bộ ngay" }));

  expect(
    await screen.findByText("Shop chưa kết nối hoặc ủy quyền đã hết hạn. Bấm Kết nối lại."),
  ).toBeInTheDocument();
  expect(await within(await card("TST Shop A")).findByText("Hết hạn")).toBeInTheDocument();
  expect(
    within(await card("TST Shop A")).queryByRole("button", { name: "Đồng bộ ngay" }),
  ).not.toBeInTheDocument();
});

test("D7: Đồng bộ ngay → toast, số liệu làm mới; 409 SYNC_IN_PROGRESS → nút khóa + Đang đồng bộ", async () => {
  const user = userEvent.setup();
  renderApp("/admin/settings/platforms");
  const a = await card("TST Shop A");

  await user.click(within(a).getByRole("button", { name: "Đồng bộ ngay" }));
  expect(await screen.findByText("Đã bắt đầu đồng bộ. Số liệu sẽ tự cập nhật.")).toBeInTheDocument();
  await waitFor(() =>
    expect(within(a).getByText("Đơn đồng bộ hôm nay").nextSibling).toHaveTextContent("145"),
  );

  mockShopee.syncing = true;
  const tt = await card("TST TikTok A (mock)");
  await user.click(within(tt).getByRole("button", { name: "Đồng bộ ngay" }));
  expect(await within(tt).findByText("Đang đồng bộ, thử lại sau.")).toBeInTheDocument();
  expect(within(tt).getByRole("button", { name: "Đồng bộ ngay" })).toBeDisabled();
});

test("API-70 sync_in_progress = true → nút Đồng bộ ngay khóa + 'Đang đồng bộ, thử lại sau.'", async () => {
  mockShops[0]!.sync_in_progress = true;
  renderApp("/admin/settings/platforms");

  const a = await card("TST Shop A");
  expect(within(a).getByRole("button", { name: "Đồng bộ ngay" })).toBeDisabled();
  expect(within(a).getByText("Đang đồng bộ, thử lại sau.")).toBeInTheDocument();
});

test("TC-P.08 (UI): Supervisor không vào được D7, menu không có", async () => {
  await login("tst_sup", "matkhau123", "DASHBOARD");
  const router = renderApp("/admin/settings/platforms");

  await waitFor(() => expect(router.state.location.pathname).toBe("/admin/forbidden"));
  const nav = screen.getByRole("navigation", { name: "Điều hướng chính" });
  expect(within(nav).queryByRole("link", { name: /Kết nối sàn/ })).not.toBeInTheDocument();
  expect(within(nav).queryByRole("link", { name: /Lưu trữ video/ })).not.toBeInTheDocument();
});

test("DEC-803: URL API-71 — kết quả D7 (MSW) đi router; callback API của adapter mock BE / URL sàn rời trang", () => {
  expect(isInAppUrl("/admin/settings/platforms?platform=tiktok&result=connected&count=2")).toBe(true);
  expect(isInAppUrl("/api/v1/shops/tiktok/callback?code=MOCK&state=abc")).toBe(false);
  expect(isInAppUrl("/api/v1/shops/shopee/callback?state=abc&code=x&shop_id=1")).toBe(false);
  expect(isInAppUrl("https://services.tiktokshop.com/open/authorize?service_id=1&state=abc")).toBe(false);
});
