/**
 * D15 — Lệch trạng thái + Dialog "Xử lý cảnh báo" (T-156; 01 §10.5 D15, FR-06.01..03, 05, UC-06). TC-06.02 (UI),
 * 06.12, 06.13, 06.16, 06.17 (UI), 06.18 (UI), TC-P2.07 / 08 (UI).
 */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { login } from "@/lib/api/auth";
import { API, apiError, json } from "@/mocks/http";
import { findPackage, mockReconAlerts } from "@/mocks/returnsDb";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

const as = (user = "tst_sup") => login(user, "matkhau123", "DASHBOARD");
const rowOf = (table: HTMLElement, code: string) =>
  within(table).getByRole("link", { name: code }).closest("tr")!;

test("TC-P2.07 / 08: CSKH xem bảng (Đang mở có số, mức Cao trước), không có 'Xử lý' / 'Chạy đối soát ngay'", async () => {
  await as("tst_cskh");
  renderApp("/admin/recon");
  expect(await screen.findByRole("heading", { name: "Lệch trạng thái" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Lệch trạng thái/ })).toHaveAttribute("href", "/admin/recon");
  expect(await screen.findByRole("tab", { name: "Đang mở 7" })).toHaveAttribute("aria-selected", "true");
  const table = await screen.findByRole("table", { name: "Danh sách cảnh báo lệch trạng thái" });
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent),
  ).toEqual(["Mức", "Quy tắc", "Mã kiện", "Kho", "Sàn", "Từ lúc"]);
  const rows = within(table).getAllByRole("row").slice(1);
  expect(rows).toHaveLength(7);
  expect(rows[0]).toHaveTextContent("Cao");
  expect(rows[6]).toHaveTextContent("Thấp");
  // CSKH: tên quy tắc dùng mặc định 7 ngày (không đọc được API-80).
  expect(rowOf(table, "SPXTST0000049")).toHaveTextContent("Hàng hoàn quá 7 ngày chưa về");
  expect(rowOf(table, "SPXTST0000049")).toHaveTextContent("Hoàn quá hạn");
  expect(screen.queryByRole("button", { name: /^Xử lý/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Chạy đối soát ngay" })).not.toBeInTheDocument();
});

test("TC-06.02 (UI): lọc mức Cao → URL; tab Đã xử lý / Tất cả có cột kết quả", async () => {
  await as();
  const user = userEvent.setup();
  const router = renderApp("/admin/recon");
  await screen.findByRole("table");
  await user.selectOptions(screen.getByLabelText("Mức"), "HIGH");
  await waitFor(() => expect(router.state.location.search).toBe("?severity=HIGH"));
  await waitFor(() => expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(4));
  expect(within(screen.getByRole("table")).getByText("Hàng hoàn quá 7 ngày chưa về")).toBeInTheDocument();

  await user.click(screen.getAllByRole("button", { name: "Xóa bộ lọc" })[0]!);
  await user.click(screen.getByRole("tab", { name: "Đã xử lý" }));
  await waitFor(() => expect(router.state.location.search).toBe("?status=RESOLVED"));
  const table = await screen.findByRole("table");
  await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(2));
  const row = rowOf(table, "SPXTST0000011");
  expect(row).toHaveTextContent("Đánh dấu đã xử lý");
  expect(row).toHaveTextContent("Nguyễn B");
  expect(row).toHaveTextContent("ĐVVC đã lấy hàng chiều qua");

  await user.click(screen.getByRole("tab", { name: "Tất cả" }));
  expect(await within(await screen.findByRole("table")).findByText(/^Tự hết/)).toBeInTheDocument();
});

test("TC-06.12: Xử lý → Đánh dấu đã xử lý (ghi chú bắt buộc, lịch sử 5 dòng) → toast, dòng sang Đã xử lý", async () => {
  await as();
  const user = userEvent.setup();
  renderApp("/admin/recon");
  const table = await screen.findByRole("table");
  await user.click(within(rowOf(table, "SPXTST0000052")).getByRole("button", { name: /Xử lý/ }));
  const dialog = await screen.findByRole("dialog", { name: "Xử lý cảnh báo" });
  expect(dialog).toHaveTextContent("BR-14 Đóng xong 24 giờ chưa bàn giao");
  expect(dialog).toHaveTextContent("Đã đóng gói");
  expect(within(dialog).getByRole("link", { name: "Mở chi tiết kiện" })).toHaveAttribute(
    "href",
    "/admin/packages/pkg-0000052",
  );
  expect(await within(dialog).findByText(/Kho: Đã đóng gói/)).toBeInTheDocument();
  expect(within(dialog).getByRole("group", { name: "Hành động" })).toHaveTextContent(
    "Đánh dấu đã xử lý" + "Điều chỉnh trạng thái kho" + "Tạo hồ sơ khiếu nại",
  );

  await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
  expect(within(dialog).getByText("Nhập ghi chú 1–500 ký tự.")).toBeInTheDocument();
  await user.type(within(dialog).getByLabelText("Ghi chú"), "Đã kiểm kệ");
  await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
  expect(await screen.findByText("Đã xử lý cảnh báo.")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(await screen.findByRole("tab", { name: "Đang mở 6" })).toBeInTheDocument();
  expect(mockReconAlerts.find((a) => a.id === "ra-05")!.resolution).toMatchObject({
    action: "RESOLVE",
    note: "Đã kiểm kệ",
  });
});

test("TC-06.17 (UI): người khác đã xử lý → 'Cảnh báo này đã được Trần C xử lý lúc 14:31.'; tự hết → chữ tự hết", async () => {
  let status = "RESOLVED";
  server.use(
    http.post(`${API}/recon-alerts/:id/resolve`, () =>
      apiError(409, "ALREADY_RESOLVED", "Cảnh báo này đã được xử lý.", {
        status,
        closed_at: "2026-10-06T07:31:00Z",
        resolved_by: status === "RESOLVED" ? { id: "u-x", display_name: "Trần C" } : null,
      }),
    ),
  );
  await as();
  const user = userEvent.setup();
  renderApp("/admin/recon");
  const table = await screen.findByRole("table");
  await user.click(within(rowOf(table, "SPXTST0000052")).getByRole("button", { name: /Xử lý/ }));
  let dialog = await screen.findByRole("dialog", { name: "Xử lý cảnh báo" });
  await user.type(within(dialog).getByLabelText("Ghi chú"), "Đã kiểm kệ");
  await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
  expect(await within(dialog).findByText("Cảnh báo này đã được Trần C xử lý lúc 14:31.")).toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: "Xác nhận" })).not.toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Đóng" }));

  status = "AUTO_RESOLVED";
  await user.click(within(rowOf(table, "SPXTST0000052")).getByRole("button", { name: /Xử lý/ }));
  dialog = await screen.findByRole("dialog", { name: "Xử lý cảnh báo" });
  await user.type(within(dialog).getByLabelText("Ghi chú"), "Đã kiểm kệ");
  await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
  expect(await within(dialog).findByText("Cảnh báo này đã tự hết lúc 14:31.")).toBeInTheDocument();
});

test("TC-06.13: Điều chỉnh trạng thái kho (đích từ cảnh báo) → kiện đổi, cảnh báo ADJUST_STATUS", async () => {
  await as();
  const user = userEvent.setup();
  renderApp("/admin/recon");
  const table = await screen.findByRole("table");
  await user.click(within(rowOf(table, "SPXTST0000049")).getByRole("button", { name: /Xử lý/ }));
  const dialog = await screen.findByRole("dialog", { name: "Xử lý cảnh báo" });
  await user.click(within(dialog).getByRole("button", { name: "Điều chỉnh trạng thái kho" }));
  expect(within(dialog).getByRole("radio", { name: "Hoàn đang về" })).toBeInTheDocument();
  await user.click(within(dialog).getByRole("radio", { name: "Đã giao" }));
  await user.type(within(dialog).getByLabelText("Lý do"), "Khách nhận lại hàng");
  await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
  expect(await screen.findByText("Đã xử lý cảnh báo.")).toBeInTheDocument();
  expect(findPackage("pkg-0000049")!.warehouse_status).toBe("DELIVERED");
  expect(mockReconAlerts.find((a) => a.id === "ra-03")!.resolution).toMatchObject({
    action: "ADJUST_STATUS",
    to_status: "DELIVERED",
  });
});

test("TC-06.16: BR-19 → Tạo hồ sơ khiếu nại mặc định Thất lạc + ĐVVC → D17; cảnh báo OPEN_CLAIM", async () => {
  await as();
  const user = userEvent.setup();
  const router = renderApp("/admin/recon");
  const table = await screen.findByRole("table");
  await user.click(within(rowOf(table, "SPXTST0000051")).getByRole("button", { name: /Xử lý/ }));
  const dialog = await screen.findByRole("dialog", { name: "Xử lý cảnh báo" });
  await user.click(within(dialog).getByRole("button", { name: "Tạo hồ sơ khiếu nại" }));
  expect(within(dialog).getByLabelText("Loại")).toHaveValue("LOST_IN_TRANSIT");
  expect(within(dialog).getByRole("button", { name: "Đơn vị vận chuyển" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
  expect(await screen.findByText(/^Đã tạo hồ sơ KN-\d{6}\.$/)).toBeInTheDocument();
  await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/admin\/claims\/cl-/));
  expect(mockReconAlerts.find((a) => a.id === "ra-06")!.resolution?.action).toBe("OPEN_CLAIM");
});

test("TC-06.18 (UI): Chạy đối soát ngay → đã yêu cầu; đang chạy → 'Đối soát đang chạy.'", async () => {
  await as();
  const user = userEvent.setup();
  renderApp("/admin/recon");
  await screen.findByRole("table");
  await user.click(screen.getByRole("button", { name: "Chạy đối soát ngay" }));
  expect(
    await screen.findByText("Đã yêu cầu chạy đối soát. Danh sách tự cập nhật khi xong."),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Chạy đối soát ngay" }));
  expect(await screen.findByText("Đối soát đang chạy.")).toBeInTheDocument();
});

test("trống → 'Không có lệch trạng thái nào đang mở.'; lỗi → Alert + Thử lại", async () => {
  let fail = false;
  server.use(
    http.get(`${API}/recon-alerts`, () =>
      fail
        ? apiError(500, "INTERNAL", "Lỗi")
        : json({
            items: [],
            page: 1,
            page_size: 20,
            total: 0,
            summary: { open: { HIGH: 0, MEDIUM: 0, LOW: 0 } },
          }),
    ),
  );
  await as();
  renderApp("/admin/recon");
  expect(await screen.findByText("Không có lệch trạng thái nào đang mở.")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Đang mở 0" })).toBeInTheDocument();

  fail = true;
  renderApp("/admin/recon?status=ALL");
  expect(await screen.findByText("Không tải được danh sách cảnh báo.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Thử lại" })).toBeInTheDocument();
});
