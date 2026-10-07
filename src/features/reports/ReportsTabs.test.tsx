/**
 * D20 tab Khiếu nại + Năng suất (quyền) + CSV + biểu đồ (T-255; 01 §10.5 D20, FR-09.02, 09.04, 09.06, 09.07, BR-41;
 * API-151..153 MSW).
 */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { login } from "@/lib/api/auth";
import { API, apiError } from "@/mocks/http";
import { vnDay } from "@/shared/format";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import { addDays } from "./reportParams";

const as = (user: string) => login(user, "matkhau123", "DASHBOARD");
const today = vnDay();
const from30 = addDays(today, -29);

test("tab Khiếu nại: 5 thẻ (75,0%, 2.350.000 đ, quá hạn đỏ → D16 due=overdue) + 4 bảng; tab ghi URL", async () => {
  await as("tst_cskh");
  const user = userEvent.setup();
  const router = renderApp("/admin/reports");
  await user.click(await screen.findByRole("tab", { name: "Khiếu nại" }));
  await waitFor(() => expect(router.state.location.search).toContain("tab=claims"));

  expect(
    await screen.findByRole("link", { name: /^Tỷ lệ thắng: 75,0%, 12 \/ 16 có kết quả/ }),
  ).toHaveAttribute("href", "/admin/claims?status=WON");
  expect(screen.getByText("2.350.000 đ")).toBeInTheDocument();
  expect(screen.getByText("87,5%")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /^Quá hạn chưa gửi: 2/ })).toHaveAttribute(
    "href",
    "/admin/claims?status=NEW&due=overdue",
  );
  expect(screen.getByRole("link", { name: /^Hồ sơ tạo trong kỳ: 21/ })).toBeInTheDocument();

  const byStatus = screen.getByRole("table", { name: "Theo trạng thái" });
  expect(within(byStatus).getAllByRole("row")).toHaveLength(7);
  const byCp = screen.getByRole("table", { name: "Theo bên nhận" });
  expect(within(byCp).getByRole("link", { name: "Sàn" })).toHaveAttribute(
    "href",
    "/admin/claims?status=ALL&counterparty=PLATFORM",
  );
  expect(within(byCp).getByText("Sàn").closest("tr")).toHaveTextContent("2.000.000 đ");
  expect(screen.getByRole("table", { name: "Theo loại × kết quả" })).toBeInTheDocument();
  expect(screen.getByRole("table", { name: "Theo sàn / shop" })).toBeInTheDocument();
  // FR-09.07 (C): biểu đồ + bảng dữ liệu ẩn cho trình đọc màn hình.
  expect(screen.getByRole("region", { name: "Hồ sơ khiếu nại theo thời gian" })).toBeInTheDocument();
  expect(screen.getByRole("table", { name: "Hồ sơ khiếu nại theo thời gian" })).toBeInTheDocument();
});

test("CSKH: không có tab Năng suất; mở URL tab=productivity → tab Hàng hoàn + Alert, không gọi API-152", async () => {
  await as("tst_cskh");
  let productivityCalls = 0;
  server.events.on("request:start", ({ request }) => {
    if (request.url.includes("/reports/productivity")) productivityCalls++;
  });
  const router = renderApp(`/admin/reports?tab=productivity&from=${from30}&to=${today}`);

  expect(await screen.findByText("Bạn không có quyền xem báo cáo năng suất.")).toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: "Năng suất" })).not.toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Hàng hoàn" })).toHaveAttribute("aria-selected", "true");
  expect(router.state.location.search).toBe(`?from=${from30}&to=${today}`);
  expect(await screen.findByRole("link", { name: /^Tỷ lệ hoàn: 4,0%/ })).toBeInTheDocument();
  expect(productivityCalls).toBe(0);
  server.events.removeAllListeners();
});

test("Supervisor: tab Năng suất — 4 thẻ (TB 1 phút 30 giây), 3 bảng, '(Không ghi tên)' cuối, lọc Station, dòng → D3", async () => {
  await as("tst_sup");
  const user = userEvent.setup();
  const router = renderApp("/admin/reports?tab=productivity");

  expect(await screen.findByRole("link", { name: /^Kiện đã đóng gói: 1\.234/ })).toHaveAttribute(
    "href",
    `/admin/packages?session_type=PACK&session_status=COMPLETED&date_from=${from30}&date_to=${today}`,
  );
  expect(screen.getByText("1 phút 30 giây")).toBeInTheDocument();
  expect(screen.getByText("3 phút 30 giây")).toBeInTheDocument();

  const ops = screen.getByRole("table", { name: "Theo người đứng bàn" });
  const names = within(ops)
    .getAllByRole("rowheader")
    .map((c) => c.textContent);
  expect(names.at(-1)).toBe("(Không ghi tên)");
  const ret = screen.getByRole("table", { name: "Bàn hoàn theo người kiểm" });
  expect(within(ret).getByText("Lan").closest("tr")).toHaveTextContent("20,0% (6 / 30)");

  const stations = screen.getByRole("table", { name: "Theo station" });
  const first = within(stations).getAllByRole("link")[0]!;
  expect(first.getAttribute("href")).toMatch(
    /^\/admin\/packages\?session_type=PACK&station_id=.+&date_from=/,
  );

  const select = await screen.findByLabelText("Station");
  await waitFor(() => expect(within(select).getAllByRole("option").length).toBeGreaterThan(1));
  const option = within(select).getAllByRole("option")[1] as HTMLOptionElement;
  await user.selectOptions(select, option.value);
  await waitFor(() => expect(router.state.location.search).toContain(`station=${option.value}`));
  await waitFor(() =>
    expect(within(screen.getByRole("table", { name: "Theo station" })).getAllByRole("row")).toHaveLength(2),
  );
  // Chuyển sang tab khác → bỏ station khỏi URL.
  await user.click(screen.getByRole("tab", { name: "Hàng hoàn" }));
  await waitFor(() => expect(router.state.location.search).not.toContain("station="));
});

test("Xuất CSV: gọi API-153 đúng tab + bộ lọc, lưu file tên theo kỳ, Toast 'Đã tải file CSV.'; lỗi → Toast message", async () => {
  await as("tst_admin");
  const user = userEvent.setup();
  const create = vi.fn(() => "blob:mock");
  Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
  const names: string[] = [];
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download);
  });
  const urls: string[] = [];
  server.events.on("request:start", ({ request }) => {
    if (request.url.includes("/export")) urls.push(request.url);
  });
  renderApp("/admin/reports?tab=claims&platform=SHOPEE");
  await screen.findByRole("link", { name: /^Tỷ lệ thắng/ });

  await user.click(screen.getByRole("button", { name: "Xuất CSV" }));
  expect(await screen.findByText("Đã tải file CSV.")).toBeInTheDocument();
  expect(names).toEqual([`bao-cao-khieu-nai-${from30}_${today}.csv`]);
  expect(urls[0]).toContain("/reports/claims/export?");
  expect(urls[0]).toContain("platform=SHOPEE");
  const blob = (create.mock.calls[0] as unknown as [Blob])[0];
  expect(await blob.text()).toContain("Theo shop");

  server.use(
    http.get(`${API}/reports/:tab/export`, () => apiError(503, "REPORT_TIMEOUT", "Không tải được báo cáo.")),
  );
  await user.click(screen.getByRole("button", { name: "Xuất CSV" }));
  expect(await screen.findByText("Không tải được báo cáo.")).toBeInTheDocument();
  click.mockRestore();
  server.events.removeAllListeners();
});

test("API-152 trả 403 (server chặn) → D12", async () => {
  await as("tst_sup");
  server.use(
    http.get(`${API}/reports/productivity`, () =>
      apiError(403, "FORBIDDEN", "Tài khoản không có quyền thực hiện thao tác này."),
    ),
  );
  const router = renderApp("/admin/reports?tab=productivity");
  await waitFor(() => expect(router.state.location.pathname).toBe("/admin/forbidden"));
});
