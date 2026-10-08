/** D16 — Hồ sơ khiếu nại (T-157; 01 §10.5 D16, FR-08.01, 08.03, 08.04). TC-P2.09 (UI), TC-08.12 (UI D16 hạn đỏ). */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { login } from "@/lib/api/auth";
import { apiError } from "@/mocks/http";
import { mockClaims } from "@/mocks/returnsDb";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import { hidScan } from "@/test/scan";

const as = (user = "tst_cskh") => login(user, "matkhau123", "DASHBOARD");

test("drawer có 'Hồ sơ khiếu nại'; tab Mới mặc định có số, bảng cột 01 §10.5, hạn đỏ ≤ 48 giờ", async () => {
  await as();
  renderApp("/admin/claims");

  expect(await screen.findByRole("heading", { name: "Hồ sơ khiếu nại" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Hồ sơ khiếu nại/ })).toHaveAttribute("href", "/admin/claims");
  const tab = await screen.findByRole("tab", { name: /^Mới \d+$/ });
  expect(tab).toHaveAttribute("aria-selected", "true");
  const table = await screen.findByRole("table", { name: "Danh sách hồ sơ khiếu nại" });
  const header = within(table)
    .getAllByRole("columnheader")
    .map((h) => h.textContent);
  expect(header).toEqual([
    "Mã hồ sơ",
    "Mã kiện",
    "Sàn · Shop",
    "Loại",
    "Bên nhận",
    "Trạng thái",
    "Phụ trách",
    "Hạn",
    "Tạo lúc",
    "Nguồn",
  ]);
  const row = within(table).getByRole("link", { name: "KN-000124" }).closest("tr")!;
  expect(row).toHaveTextContent("Hộp rỗng");
  expect(row).toHaveTextContent("Tự động");
  expect(row).toHaveTextContent("(chưa có)");
  // KN-000124: hạn = hạn người bán, còn ~1 ngày → đỏ.
  expect(within(row).getByText(/còn \d+ (giờ|ngày)/)).toHaveClass("text-error");
  expect(within(table).getByText("KN-000122").closest("tr")).toHaveTextContent("Chuyển từ cờ giữ");
});

test("tab đổi URL; lọc Quá hạn / Của tôi / loại; Xóa bộ lọc; tab Tất cả", async () => {
  await as("tst_sup");
  const user = userEvent.setup();
  const router = renderApp("/admin/claims");

  await user.click(await screen.findByRole("tab", { name: /^Đã gửi/ }));
  await waitFor(() => expect(router.state.location.search).toBe("?status=SUBMITTED"));
  const table = await screen.findByRole("table");
  expect(within(table).getByText("KN-000121")).toBeInTheDocument();
  expect(within(table).getByText(/Quá hạn \d+ giờ/)).toHaveClass("text-error");

  await user.selectOptions(screen.getByLabelText("Hạn"), "overdue");
  await waitFor(() => expect(router.state.location.search).toContain("due=overdue"));
  await user.click(screen.getByRole("checkbox", { name: "Của tôi" }));
  await waitFor(() => expect(router.state.location.search).toContain("owner=me"));
  expect(await within(await screen.findByRole("table")).findByText("KN-000121")).toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText("Loại"), "EMPTY_BOX");
  expect(await screen.findByText("Không có hồ sơ nào khớp bộ lọc.")).toBeInTheDocument();
  await user.click(screen.getAllByRole("button", { name: "Xóa bộ lọc" })[0]!);
  await waitFor(() => expect(router.state.location.search).toBe("?status=SUBMITTED"));

  await user.click(screen.getByRole("tab", { name: "Tất cả" }));
  expect(await within(await screen.findByRole("table")).findByText("KN-000117")).toBeInTheDocument();
});

test("tìm theo mã (ô tìm + máy quét) → đúng hồ sơ", async () => {
  await as();
  const user = userEvent.setup();
  const router = renderApp("/admin/claims?status=ALL");
  await screen.findByRole("table");

  await user.type(screen.getByLabelText("Mã hồ sơ, mã vận đơn hoặc mã đơn"), "SPXTST0000002{Enter}");
  await waitFor(() => expect(router.state.location.search).toContain("q=SPXTST0000002"));
  const table = await screen.findByRole("table");
  await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(2));
  expect(within(table).getByText("KN-000118")).toBeInTheDocument();

  (document.activeElement as HTMLElement).blur();
  await hidScan("KN-000119");
  await waitFor(() => expect(router.state.location.search).toContain("q=KN-000119"));
  expect(screen.getByLabelText("Mã hồ sơ, mã vận đơn hoặc mã đơn")).toHaveValue("KN-000119");
});

test("trống → 'Chưa có hồ sơ khiếu nại.' + Tạo hồ sơ; lỗi → Alert + Thử lại", async () => {
  await as();
  mockClaims.splice(0, mockClaims.length);
  const user = userEvent.setup();
  renderApp("/admin/claims");
  expect(await screen.findByText("Chưa có hồ sơ khiếu nại.")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Tạo hồ sơ" })).toHaveLength(2);

  server.use(http.get("/api/v1/claims", () => apiError(500, "INTERNAL", "x")));
  await user.click(screen.getByRole("tab", { name: /^Đóng/ }));
  expect(await screen.findByText("Không tải được danh sách hồ sơ.")).toBeInTheDocument();
  server.resetHandlers();
  await user.click(screen.getByRole("button", { name: "Thử lại" }));
  expect(await screen.findByText("Chưa có hồ sơ khiếu nại.")).toBeInTheDocument();
});

test("FR-08.01: Tạo hồ sơ từ D16 — nhập mã kiện → chọn kiện → tạo → mở D17 hồ sơ mới", async () => {
  await as();
  const user = userEvent.setup();
  const router = renderApp("/admin/claims");

  await user.click(await screen.findByRole("button", { name: "Tạo hồ sơ" }));
  const dialog = screen.getByRole("dialog", { name: "Tạo hồ sơ khiếu nại" });
  expect(within(dialog).getByRole("button", { name: "Tạo hồ sơ" })).toBeDisabled();
  await user.type(within(dialog).getByLabelText("Mã vận đơn hoặc mã đơn"), "spxtst0000010{Enter}");
  await user.click(await within(dialog).findByRole("radio"));
  await user.click(within(dialog).getByRole("button", { name: "Tạo hồ sơ" }));

  expect(await screen.findByText(/^Đã tạo hồ sơ KN-\d{6}\.$/)).toBeInTheDocument();
  const created = mockClaims.at(-1)!;
  expect(created.package_id).toBe("pkg-0000010");
  await waitFor(() => expect(router.state.location.pathname).toBe(`/admin/claims/${created.id}`));
});

test("dưới md: danh sách card (bảng ẩn bằng CSS)", async () => {
  await as();
  renderApp("/admin/claims?status=ALL");
  const list = await screen.findByRole("list", { name: "Kết quả" });
  expect(within(list).getAllByRole("listitem").length).toBeGreaterThan(3);
});

test("STATION không vào được D16 (D12)", async () => {
  await login("tst_station01", "matkhau123", "STATION");
  const router = renderApp("/admin/claims");
  await waitFor(() => expect(router.state.location.pathname).not.toBe("/admin/claims"));
});
