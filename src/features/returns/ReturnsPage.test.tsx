/** D14 — Hàng hoàn (T-153; 01 §10.5 D14, FR-05.05, 05.11, 05.12, 04.13). TC-07.37, 07.38, 07.33 (UI), TC-P2.05 / 06 (UI). */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { login } from "@/lib/api/auth";
import { API, apiError, json } from "@/mocks/http";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import { hidScan } from "@/test/scan";

const as = (user = "tst_cskh") => login(user, "matkhau123", "DASHBOARD");

test("TC-07.37: drawer 'Hàng hoàn'; tab Đang về mặc định có số, gồm hồ sơ Đang kiểm; cột 01 §10.5", async () => {
  await as();
  renderApp("/admin/returns");

  expect(await screen.findByRole("heading", { name: "Hàng hoàn" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Hàng hoàn/ })).toHaveAttribute("href", "/admin/returns");
  const tab = await screen.findByRole("tab", { name: /^Đang về \d+$/ });
  expect(tab).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tab", { name: "Quá hạn 1" })).toBeInTheDocument();
  // HH-000044 + HH-000061 (TikTok — dữ liệu item 03).
  expect(screen.getByRole("tab", { name: "Chỉ hoàn tiền 2" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Chưa xác định 1" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Tất cả" })).toBeInTheDocument();

  const table = await screen.findByRole("table", { name: "Danh sách hồ sơ hàng hoàn" });
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent),
  ).toEqual([
    "Mã đơn",
    "Mã kiện / chiều về",
    "Loại",
    "Lý do",
    "Sàn báo",
    "Chờ",
    "Trạng thái",
    "Hồ sơ khiếu nại",
  ]);
  const row41 = within(table).getByRole("link", { name: "Mở chi tiết kiện SPXTST0000041" }).closest("tr")!;
  expect(row41).toHaveTextContent("Khách trả hàng");
  expect(row41).toHaveTextContent("Hàng bị hư");
  expect(row41).toHaveTextContent("Chiều về SPXRTTST000041");
  expect(row41).toHaveTextContent("2 ngày");
  expect(row41).toHaveTextContent("Đang về");
  // Hồ sơ nhiều kiện ghi số kiện; hồ sơ Đang kiểm nằm trong tab Đang về.
  expect(within(table).getAllByText("(2 kiện)").length).toBeGreaterThan(0);
  expect(within(table).getByText("Đang kiểm")).toBeInTheDocument();
});

test("tab đổi URL; Quá hạn có số ngày chờ + chip cảnh báo; Đã nhận có cột Kết luận + link hồ sơ khiếu nại", async () => {
  await as();
  const user = userEvent.setup();
  const router = renderApp("/admin/returns");

  await user.click(await screen.findByRole("tab", { name: /^Quá hạn/ }));
  await waitFor(() => expect(router.state.location.search).toBe("?tab=MISSING"));
  let table = await screen.findByRole("table");
  const row = await within(table).findByText("Quá hạn chưa về");
  expect(row.closest("tr")).toHaveTextContent("Giao thất bại");
  expect(row.closest("tr")).toHaveTextContent("8 ngày");

  await user.click(screen.getByRole("tab", { name: /^Đã nhận/ }));
  await waitFor(() => expect(router.state.location.search).toBe("?tab=RECEIVED"));
  table = await screen.findByRole("table");
  await waitFor(() =>
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toContain("Kết luận"),
  );
  expect(within(table).queryByText("Chờ")).not.toBeInTheDocument();
  const empty = within(table).getByText("Hộp rỗng").closest("tr")!;
  expect(within(empty).getByRole("link", { name: /^KN-\d{6}$/ })).toHaveAttribute(
    "href",
    expect.stringMatching(/^\/admin\/claims\//),
  );
});

test("bấm dòng → D4 kiện đầu", async () => {
  await as();
  const user = userEvent.setup();
  const router = renderApp("/admin/returns?tab=MISSING");
  const cell = await within(await screen.findByRole("table")).findByText("Quá hạn chưa về");
  await user.click(cell.closest("tr")!);
  await waitFor(() => expect(router.state.location.pathname).toBe("/admin/packages/pkg-0000049"));
});

test("FR-05.12: tab Chỉ hoàn tiền → 'Tạo hồ sơ khiếu nại' mỗi dòng → Dialog → D17", async () => {
  await as();
  const user = userEvent.setup();
  const router = renderApp("/admin/returns?tab=NO_PARCEL");
  const table = await screen.findByRole("table");
  const row = (await within(table).findByRole("link", { name: /SPXTST0000044/ })).closest("tr")!;
  expect(row).toHaveTextContent("Chỉ hoàn tiền");
  expect(row).toHaveTextContent("Thiếu hàng");
  await user.click(within(row).getByRole("button", { name: "Tạo hồ sơ khiếu nại" }));
  const dialog = await screen.findByRole("dialog", { name: "Tạo hồ sơ khiếu nại" });
  await user.click(within(dialog).getByRole("button", { name: "Tạo hồ sơ" }));
  expect(await screen.findByText(/^Đã tạo hồ sơ KN-\d{6}\.$/)).toBeInTheDocument();
  await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/admin\/claims\/cl-/));
});

test("TC-07.33 (UI) / TC-P2.06: tab Chưa xác định — Supervisor có 'Gắn đơn' mở Dialog; CSKH không có nút", async () => {
  await as("tst_sup");
  const user = userEvent.setup();
  renderApp("/admin/returns?tab=UNIDENTIFIED");
  const table = await screen.findByRole("table");
  const row = (await within(table).findByRole("link", { name: "Mở chi tiết kiện TAM-000001" })).closest(
    "tr",
  )!;
  expect(row).toHaveTextContent("Chưa xác định");
  expect(row).toHaveTextContent("Hư hỏng");
  await user.click(within(row).getByRole("button", { name: "Gắn đơn" }));
  const dialog = await screen.findByRole("dialog", { name: "Gắn đơn" });
  expect(within(dialog).getByLabelText("Mã đơn sàn hoặc mã vận đơn gốc")).toBeInTheDocument();
});

test("TC-P2.06: CSKH không thấy 'Gắn đơn'", async () => {
  await as();
  renderApp("/admin/returns?tab=UNIDENTIFIED");
  const table = await screen.findByRole("table");
  await within(table).findByRole("link", { name: "Mở chi tiết kiện TAM-000001" });
  expect(screen.queryByRole("button", { name: "Gắn đơn" })).not.toBeInTheDocument();
});

test("lọc loại + máy quét mã → URL; không khớp → 'Không có hồ sơ nào khớp bộ lọc.' + Xóa bộ lọc", async () => {
  await as();
  const user = userEvent.setup();
  const router = renderApp("/admin/returns");
  await screen.findByRole("table");

  await hidScan("SPXRTTST000045");
  await waitFor(() => expect(router.state.location.search).toBe("?q=SPXRTTST000045"));
  await waitFor(() => expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2));
  expect(screen.getByLabelText("Mã vận đơn / mã đơn")).toHaveValue("SPXRTTST000045");

  await user.selectOptions(screen.getByLabelText("Loại"), "FAILED_DELIVERY");
  await waitFor(() => expect(router.state.location.search).toContain("kind=FAILED_DELIVERY"));
  expect(await screen.findByText("Không có hồ sơ nào khớp bộ lọc.")).toBeInTheDocument();
  await user.click(screen.getAllByRole("button", { name: "Xóa bộ lọc" })[0]!);
  await waitFor(() => expect(router.state.location.search).toBe(""));
});

test("TC-07.38: tab Quá hạn trống → 'Không có kiện hoàn quá hạn.'", async () => {
  server.use(
    http.get(`${API}/returns`, () =>
      json({
        items: [],
        page: 1,
        page_size: 20,
        total: 0,
        tab_counts: { EXPECTED: 0, MISSING: 0, RECEIVED: 0, NO_PARCEL: 0, UNIDENTIFIED: 0 },
      }),
    ),
  );
  await as();
  renderApp("/admin/returns?tab=MISSING");
  expect(await screen.findByText("Không có kiện hoàn quá hạn.")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Quá hạn 0" })).toBeInTheDocument();
});

test("lỗi tải → Alert + Thử lại; khoảng ngày sai (422) → chữ riêng", async () => {
  let fail = true;
  server.use(
    http.get(`${API}/returns`, ({ request }) => {
      if (new URL(request.url).searchParams.get("date_from"))
        return apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", {
          fields: { date_to: "Khoảng ngày tối đa 92 ngày" },
        });
      if (fail) return apiError(500, "INTERNAL", "Lỗi");
      return undefined;
    }),
  );
  await as();
  const user = userEvent.setup();
  renderApp("/admin/returns");
  expect(await screen.findByText("Không tải được danh sách hàng hoàn.")).toBeInTheDocument();
  fail = false;
  await user.click(screen.getByRole("button", { name: "Thử lại" }));
  expect(await screen.findByRole("table")).toBeInTheDocument();

  renderApp("/admin/returns?from=2026-01-01&to=2026-10-01");
  expect(await screen.findByText("Khoảng ngày không hợp lệ (tối đa 92 ngày).")).toBeInTheDocument();
});
