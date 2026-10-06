/** D3 Tra cứu đơn (01 §10.5, FR-07.01, 07.03) trên MSW — TC-07.01, 07.02, 07.03, 07.05, 07.13–07.16. */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { login } from "@/lib/api/auth";
import { apiError } from "@/mocks/http";
import { vnDay } from "@/shared/format";
import { renderApp } from "@/test/render";
import { hidScan } from "@/test/scan";
import { server } from "@/test/server";

beforeEach(async () => {
  await login("tst_cskh", "matkhau123", "DASHBOARD");
});

const table = () => screen.findByRole("table");
const codes = async () =>
  within(await table())
    .getAllByRole("link")
    .map((a) => a.textContent);

test("TC-07.01: ô tìm tự focus; nhập mã + Enter ra 1 kiện → mở thẳng D4", async () => {
  const user = userEvent.setup();
  const router = renderApp("/admin/packages");

  const q = await screen.findByLabelText("Mã vận đơn hoặc mã đơn");
  await waitFor(() => expect(q).toHaveFocus());
  await user.type(q, "SPXTST0000010{Enter}");

  await waitFor(() => expect(router.state.location.pathname).toBe("/admin/packages/pkg-0000010"));
});

test("TC-07.01: máy quét khi focus ngoài ô nhập vẫn tìm được", async () => {
  const router = renderApp("/admin/packages");
  const q = await screen.findByLabelText("Mã vận đơn hoặc mã đơn");
  await waitFor(() => expect(q).toHaveFocus());
  q.blur();

  await hidScan("spxtst0000001");

  await waitFor(() => expect(router.state.location.pathname).toBe("/admin/packages/pkg-0000001"));
});

test("TC-07.02: tìm theo mã đơn sàn", async () => {
  const user = userEvent.setup();
  const router = renderApp("/admin/packages");

  await user.type(await screen.findByLabelText("Mã vận đơn hoặc mã đơn"), "2410TST00010{Enter}");

  await waitFor(() => expect(router.state.location.pathname).toBe("/admin/packages/pkg-0000010"));
});

test("TC-07.05: không tìm thấy → EmptyState có mã + Xóa bộ lọc", async () => {
  const user = userEvent.setup();
  const router = renderApp("/admin/packages");

  await user.type(await screen.findByLabelText("Mã vận đơn hoặc mã đơn"), "SPXTST000XXXX{Enter}");

  expect(await screen.findByText("Không tìm thấy mã SPXTST000XXXX.")).toBeInTheDocument();
  const empty = screen.getByText("Không tìm thấy mã SPXTST000XXXX.").closest(".card") as HTMLElement;
  await user.click(within(empty).getByRole("button", { name: "Xóa bộ lọc" }));
  await waitFor(() => expect(router.state.location.search).toBe(""));
  expect(screen.getByLabelText("Mã vận đơn hoặc mã đơn")).toHaveValue("");
  expect(await table()).toBeInTheDocument();
});

test("bảng kết quả: cột, chip, phân trang 20 dòng", async () => {
  const user = userEvent.setup();
  renderApp("/admin/packages");

  const t = await table();
  expect(within(t).getAllByRole("row")).toHaveLength(21);
  // 72 kiện Phase 1 + 20 kiện dữ liệu hàng hoàn item 02 (04 §1, returnsDb).
  expect(screen.getByText("92 kết quả")).toBeInTheDocument();
  const row = within(t).getByRole("link", { name: "SPXTST0000015" }).closest("tr")!;
  expect(within(row).getByText("Đã đóng gói")).toBeInTheDocument();
  expect(within(row).getByText("TST Station 02")).toBeInTheDocument();
  expect(within(row).getByText("Có clip")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Sau" }));
  expect(await screen.findByText("Trang 2 / 5")).toBeInTheDocument();
});

test("TC-07.03: lọc theo ngày hôm nay / ngày không có phiên", async () => {
  renderApp("/admin/packages");
  const today = vnDay();
  await table();

  fireEvent.change(screen.getByLabelText("Từ ngày"), { target: { value: today } });
  fireEvent.change(screen.getByLabelText("Đến ngày"), { target: { value: today } });
  await waitFor(async () => expect(await codes()).toContain("SPXTST0000010"));
  const list = await codes();
  expect(list).toEqual(expect.arrayContaining(["SPXTST0000001", "SPXTST0000002", "SPXTST0000010"]));
  expect(list).not.toContain("SPXTST0000011");

  fireEvent.change(screen.getByLabelText("Từ ngày"), { target: { value: "2026-01-01" } });
  fireEvent.change(screen.getByLabelText("Đến ngày"), { target: { value: "2026-01-01" } });
  expect(await screen.findByText("Không tìm thấy kiện nào khớp bộ lọc.")).toBeInTheDocument();
});

test("TC-07.13: lọc theo station (hôm nay)", async () => {
  const today = vnDay();
  renderApp(`/admin/packages?date_from=${today}&date_to=${today}`);
  await table();

  const select = screen.getByLabelText("Station");
  await waitFor(() =>
    expect(within(select).getByRole("option", { name: "TST Station 01" })).toBeInTheDocument(),
  );
  fireEvent.change(select, { target: { value: "st-1" } });

  await waitFor(async () => expect(await codes()).not.toContain("SPXTST0000015"));
  const list = await codes();
  expect(list).toEqual(expect.arrayContaining(["SPXTST0000001", "SPXTST0000002"]));
  expect(list).not.toContain("SPXTST0000010");
});

test("TC-07.14 + TC-07.16: lọc trạng thái kho ghi vào URL; mở lại URL giữ bộ lọc", async () => {
  const router = renderApp("/admin/packages");
  await table();

  fireEvent.change(screen.getByLabelText("Trạng thái kho"), { target: { value: "PACKED" } });
  await waitFor(() => expect(router.state.location.search).toBe("?warehouse_status=PACKED"));
  await waitFor(async () => expect(await codes()).not.toContain("SPXTST0000011"));
  expect(await codes()).toContain("SPXTST0000001");

  // "Tải lại": render lại đúng URL đó.
  document.body.innerHTML = "";
  renderApp("/admin/packages?warehouse_status=PACKED");
  expect(await screen.findByLabelText("Trạng thái kho")).toHaveValue("PACKED");
  expect(await screen.findByText("9 kết quả")).toBeInTheDocument();
});

test("TC-07.15: lọc theo nguồn File / Shopee", async () => {
  renderApp("/admin/packages");
  await table();

  fireEvent.change(screen.getByLabelText("Nguồn"), { target: { value: "CSV" } });
  expect(await screen.findByText("1 kết quả")).toBeInTheDocument();
  expect(await codes()).toEqual(["SPXTST0000015"]);

  fireEvent.change(screen.getByLabelText("Nguồn"), { target: { value: "API" } });
  expect(await screen.findByText("90 kết quả")).toBeInTheDocument();
});

test("link từ thẻ D2: lọc theo phiên hiện thành chip, bỏ được", async () => {
  const user = userEvent.setup();
  const today = vnDay();
  const router = renderApp(`/admin/packages?session_status=ABANDONED&date_from=${today}&date_to=${today}`);

  expect(await codes()).toEqual(["SPXTST0000008"]);
  await user.click(screen.getByRole("button", { name: "Bỏ lọc Bỏ dở" }));

  await waitFor(() => expect(router.state.location.search).not.toContain("session_status"));
  expect(router.state.location.search).toContain(`date_from=${today}`);
});

test("ngày đến trước ngày từ → lỗi dưới ô, không đổi URL", async () => {
  const router = renderApp("/admin/packages?date_from=2026-10-04");
  await table();

  fireEvent.change(screen.getByLabelText("Đến ngày"), { target: { value: "2026-10-03" } });

  expect(await screen.findByText("Ngày đến phải sau hoặc bằng ngày từ.")).toBeInTheDocument();
  expect(router.state.location.search).toBe("?date_from=2026-10-04");
});

test("API-30 lỗi 5xx (hết 2 lần tự thử lại) → Alert + Thử lại", async () => {
  const user = userEvent.setup();
  server.use(http.get("/api/v1/packages", () => apiError(500, "INTERNAL", "Lỗi")));
  renderApp("/admin/packages");

  expect(await screen.findByText("Không tải được danh sách kiện.")).toBeInTheDocument();
  server.resetHandlers();
  await user.click(screen.getByRole("button", { name: "Thử lại" }));
  expect(await table()).toBeInTheDocument();
});
