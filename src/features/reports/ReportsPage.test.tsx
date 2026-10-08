/** D20 Báo cáo — khung + bộ lọc + tab Hàng hoàn (T-254; 01 §10.5 D20, FR-09.03, 09.05, BR-41; API-150 MSW). */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { login } from "@/lib/api/auth";
import { mockReportsState } from "@/mocks/handlers/reports";
import { API, apiError, json } from "@/mocks/http";
import { vnDay } from "@/shared/format";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import { addDays } from "./reportParams";

const as = (user = "tst_cskh") => login(user, "matkhau123", "DASHBOARD");
const today = vnDay();
const from30 = addDays(today, -29);

test("drawer 'Báo cáo' → D20 tab Hàng hoàn mặc định, kỳ 30 ngày; 4 thẻ đúng số BR-41 + 4 bảng", async () => {
  await as();
  renderApp("/admin/reports");

  expect(await screen.findByRole("heading", { name: "Báo cáo" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Báo cáo/ })).toHaveAttribute("href", "/admin/reports");
  expect(screen.getByRole("tab", { name: "Hàng hoàn" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("button", { name: "30 ngày" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByLabelText("Từ ngày")).toHaveValue(from30);
  expect(screen.getByLabelText("Đến ngày")).toHaveValue(today);

  const rate = await screen.findByRole("link", { name: /^Tỷ lệ hoàn: 4,0%, 40 \/ 1\.000 kiện/ });
  expect(rate).toHaveAttribute("href", `/admin/returns?tab=ALL&from=${from30}&to=${today}`);
  expect(screen.getByRole("link", { name: /^Có vấn đề: 20,0%, 6 \/ 30 đã nhận/ })).toHaveAttribute(
    "href",
    `/admin/returns?tab=RECEIVED&from=${from30}&to=${today}`,
  );
  expect(screen.getByRole("link", { name: /^Chỉ hoàn tiền: 6, 0,6% số kiện/ })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /^Đang về: 41/ })).toHaveAttribute(
    "href",
    "/admin/returns?tab=EXPECTED",
  );

  const byKind = screen.getByRole("table", { name: "Theo loại" });
  const buyer = within(byKind).getByRole("link", { name: "Khách trả hàng" });
  expect(buyer).toHaveAttribute(
    "href",
    `/admin/returns?tab=ALL&kind=BUYER_RETURN&from=${from30}&to=${today}`,
  );
  expect(buyer.closest("tr")).toHaveTextContent("62,5%");
  expect(within(byKind).getByText("Về trước khi sàn báo").closest("tr")).toHaveTextContent(
    /^Về trước khi sàn báo2$/,
  );

  const reason = screen.getByRole("table", { name: "Lý do khách × kết luận kho" });
  expect(
    within(reason)
      .getAllByRole("columnheader")
      .map((h) => h.textContent),
  ).toEqual([
    "Lý do khách",
    "Nguyên vẹn",
    "Hư hỏng",
    "Thiếu hàng",
    "Sai hàng / bị tráo",
    "Hộp rỗng",
    "Khác",
    "Tổng",
  ]);

  const top = screen.getByRole("table", { name: "Top sản phẩm bị trả" });
  expect(within(top).getByText("Áo thun basic").closest("tr")).toHaveTextContent("Đen / L32014" + "4,4%3");

  const byShop = screen.getByRole("table", { name: "Theo sàn / shop" });
  expect(within(byShop).getAllByRole("row")).toHaveLength(5);
  expect(within(byShop).getAllByRole("link")[0]).toHaveAttribute(
    "href",
    expect.stringMatching(/^\/admin\/returns\?tab=ALL&from=.*&platform=SHOPEE&shop=/),
  );
});

test("ⓘ công thức: button có aria-describedby tới câu BR-41, bấm để hiện", async () => {
  await as();
  const user = userEvent.setup();
  renderApp("/admin/reports");
  const info = await screen.findByRole("button", { name: "Công thức: Tỷ lệ hoàn" });
  const tip = document.getElementById(info.getAttribute("aria-describedby")!)!;
  expect(tip).toHaveTextContent(/^Tỷ lệ hoàn = hồ sơ hàng hoàn có kiện về/);
  expect(tip).not.toBeVisible();
  await user.click(info);
  expect(tip).toBeVisible();
});

test("kỳ nhanh + sàn ghi URL, gọi lại API-150 với platform; số cũ giữ lại khi tải", async () => {
  await as();
  const user = userEvent.setup();
  const seen: string[] = [];
  server.events.on("request:start", ({ request }) => {
    if (request.url.includes("/reports/returns")) seen.push(new URL(request.url).search);
  });
  const router = renderApp("/admin/reports");
  await screen.findByRole("link", { name: /^Tỷ lệ hoàn: 4,0%/ });

  await user.click(screen.getByRole("button", { name: "7 ngày" }));
  await waitFor(() => expect(router.state.location.search).toBe(`?from=${addDays(today, -6)}&to=${today}`));
  await user.selectOptions(screen.getByLabelText("Sàn"), "TIKTOK");
  await waitFor(() => expect(router.state.location.search).toContain("platform=TIKTOK"));
  await waitFor(() => expect(seen.at(-1)).toContain("platform=TIKTOK"));
  expect(seen.at(-1)).toContain(`from=${addDays(today, -6)}`);
  // Chỉ shop TikTok → 1 dòng shop.
  await waitFor(() =>
    expect(within(screen.getByRole("table", { name: "Theo sàn / shop" })).getAllByRole("row")).toHaveLength(
      2,
    ),
  );
  server.events.removeAllListeners();
});

test("validate kỳ: đến < từ → lỗi dưới ô + khóa Xem; > 366 ngày; sửa đúng → Xem ghi URL", async () => {
  await as();
  const user = userEvent.setup();
  const router = renderApp("/admin/reports");
  await screen.findByRole("link", { name: /^Tỷ lệ hoàn/ });
  const fromInput = screen.getByLabelText("Từ ngày");
  const toInput = screen.getByLabelText("Đến ngày");

  await user.clear(toInput);
  await user.type(toInput, addDays(from30, -1));
  expect(screen.getByText("Ngày đến phải sau ngày từ.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Xem" })).toBeDisabled();

  await user.clear(toInput);
  await user.type(toInput, today);
  await user.clear(fromInput);
  await user.type(fromInput, addDays(today, -366));
  expect(screen.getByText("Chọn tối đa 366 ngày.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Xem" })).toBeDisabled();

  await user.clear(fromInput);
  await user.type(fromInput, addDays(today, -365));
  await user.click(screen.getByRole("button", { name: "Xem" }));
  await waitFor(() => expect(router.state.location.search).toBe(`?from=${addDays(today, -365)}&to=${today}`));
  expect(screen.getByRole("button", { name: "30 ngày" })).toHaveAttribute("aria-pressed", "false");
});

test("URL kỳ sai → không gọi API, báo kỳ chưa hợp lệ; 422 server → lỗi dưới ô ngày", async () => {
  await as();
  renderApp(`/admin/reports?from=${today}&to=${addDays(today, -3)}`);
  expect(await screen.findByText("Kỳ báo cáo chưa hợp lệ — sửa ngày rồi bấm Xem.")).toBeInTheDocument();
  expect(screen.getByText("Ngày đến phải sau ngày từ.")).toBeInTheDocument();

  server.use(
    http.get(`${API}/reports/returns`, () =>
      apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", {
        fields: { to: "Không chọn ngày trong tương lai." },
      }),
    ),
  );
  renderApp("/admin/reports");
  expect(await screen.findAllByText("Không chọn ngày trong tương lai.")).not.toHaveLength(0);
});

test("REPORT_TIMEOUT → Alert 'Không tải được báo cáo.' + Thử lại (không tự thử lại)", async () => {
  await as();
  const user = userEvent.setup();
  mockReportsState.timeout = true;
  let calls = 0;
  server.events.on("request:start", ({ request }) => {
    if (request.url.includes("/reports/returns")) calls++;
  });
  renderApp("/admin/reports");
  expect(await screen.findByText("Không tải được báo cáo.")).toBeInTheDocument();
  expect(calls).toBe(1);
  mockReportsState.timeout = false;
  await user.click(screen.getByRole("button", { name: "Thử lại" }));
  expect(await screen.findByRole("link", { name: /^Tỷ lệ hoàn: 4,0%/ })).toBeInTheDocument();
  server.events.removeAllListeners();
});

test("mẫu số 0 → '—' + chú thích; bảng rỗng → 'Không có dữ liệu trong kỳ này.'", async () => {
  await as();
  server.use(
    http.get(`${API}/reports/returns`, () =>
      json({
        period: { from: from30, to: today },
        filters: { platform: null, shop_id: null },
        generated_at: new Date().toISOString(),
        cards: {
          return_rate: { numerator: 0, denominator: 0, value: null },
          issue_rate: { numerator: 0, denominator: 0, value: null },
          refund_only: { count: 0, rate_of_handed_over: null },
          expected_now: 0,
        },
        by_kind: [],
        reason_by_conclusion: { conclusions: [], rows: [] },
        top_products: [],
        by_shop: [],
        series: [],
        series_granularity: "day",
      }),
    ),
  );
  renderApp("/admin/reports");
  expect(
    await screen.findByRole("link", { name: /^Tỷ lệ hoàn: —, Chưa có kiện bàn giao trong kỳ/ }),
  ).toBeInTheDocument();
  expect(screen.getAllByText("Không có dữ liệu trong kỳ này.")).toHaveLength(4);
});

test("BUG-G5-P3-1: dòng shop null (đơn nhập CSV) → '(Không có shop)', không link, không 'undefined · null'", async () => {
  await as();
  renderApp("/admin/reports");
  const byShop = await screen.findByRole("table", { name: "Theo sàn / shop" });
  expect(byShop).not.toHaveTextContent(/undefined|null/);
  const row = within(byShop).getByText("(Không có shop)").closest("tr")!;
  expect(row).toHaveTextContent(/^\(Không có shop\)152/);
  expect(within(row).queryByRole("link")).toBeNull();
});
