/** D2 Tổng quan ngày (01 §10.5, FR-09.01) — TC-09.01 (bước 5, phần UI), TC-09.02, TC-09.04 trên MSW. */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { login } from "@/lib/api/auth";
import { apiError } from "@/mocks/http";
import { vnDay } from "@/shared/format";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

const card = (name: RegExp) => screen.findByRole("link", { name });

test("TC-09.01: 6 thẻ số theo API-32, station và mục Cần xử lý (CSKH)", async () => {
  await login("tst_cskh", "matkhau123", "DASHBOARD");
  renderApp("/admin");

  expect(await card(/^Đã đóng gói: 8\./)).toBeInTheDocument();
  expect(await card(/^Từng lệch mã: 1\./)).toBeInTheDocument();
  expect(await card(/^Bỏ dở: 1\./)).toBeInTheDocument();
  expect(await card(/^Hủy phiên: 1\./)).toBeInTheDocument();
  expect(await card(/^Chưa bàn giao: 8\./)).toBeInTheDocument();
  expect(await card(/^Hủy sau khi đóng: 1\./)).toBeInTheDocument();
  expect(screen.getByText(/^Hôm nay \d{2}\/\d{2}\/\d{4}$/)).toBeInTheDocument();

  const stations = screen.getByRole("region", { name: "Station" });
  expect(within(stations).getByText("TST Station 01")).toBeInTheDocument();
  expect(within(stations).getByText("Cam 2 mất tín hiệu")).toBeInTheDocument();
  expect(within(stations).getAllByText("Rảnh")).toHaveLength(2);

  const attention = screen.getByRole("region", { name: "Cần xử lý" });
  expect(within(attention).getByText("1 đơn bị hủy sau khi đóng")).toBeInTheDocument();
  expect(within(attention).getByText("Cam 2 TST Station 01 mất tín hiệu")).toBeInTheDocument();
  expect(within(attention).getByText("1 yêu cầu duyệt đang chờ")).toBeInTheDocument();
  expect(within(attention).getByText("Ổ lưu video đã dùng 83%")).toBeInTheDocument();
  // CSKH: không có link tới màn cấu hình hay D13 (không có quyền / chưa có màn — DEC-51).
  expect(within(attention).queryAllByRole("link")).toHaveLength(0);
  expect(screen.queryByText("Chưa có phiên đóng gói nào trong ngày.")).not.toBeInTheDocument();
});

test("ADMIN: camera mất tín hiệu có link sang D6", async () => {
  await login("tst_admin", "matkhau123", "DASHBOARD");
  renderApp("/admin");

  const attention = await screen.findByRole("region", { name: "Cần xử lý" });
  const row = within(attention).getByText("Cam 2 TST Station 01 mất tín hiệu").closest("li")!;
  expect(within(row).getByRole("link", { name: "Xem" })).toHaveAttribute("href", "/admin/settings/stations");
});

test("TC-09.02: bấm thẻ → D3 với bộ lọc tương ứng + ngày", async () => {
  await login("tst_sup", "matkhau123", "DASHBOARD");
  const router = renderApp("/admin");
  const today = vnDay();

  await userEvent.click(await card(/^Đã đóng gói:/));
  await waitFor(() => expect(router.state.location.pathname).toBe("/admin/packages"));
  expect(Object.fromEntries(new URLSearchParams(router.state.location.search))).toEqual({
    session_status: "COMPLETED",
    date_from: today,
    date_to: today,
  });

  await router.navigate("/admin");
  await userEvent.click(await card(/^Chưa bàn giao:/));
  await waitFor(() => expect(router.state.location.search).toBe("?warehouse_status=PACKED"));

  await router.navigate("/admin");
  await userEvent.click(await card(/^Từng lệch mã:/));
  await waitFor(() => expect(router.state.location.search).toContain("session_flag=HAD_MISMATCH"));
});

test("TC-09.04: ngày không có phiên → thẻ theo ngày = 0 và câu trống", async () => {
  await login("tst_cskh", "matkhau123", "DASHBOARD");
  const router = renderApp("/admin");
  await card(/^Đã đóng gói: 8\./);

  fireEvent.change(screen.getByLabelText("Đổi ngày"), { target: { value: "2026-01-01" } });

  expect(await screen.findByText("Chưa có phiên đóng gói nào trong ngày.")).toBeInTheDocument();
  expect(await card(/^Đã đóng gói: 0\./)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /^Từng lệch mã: 0\./ })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /^Bỏ dở: 0\./ })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /^Hủy phiên: 0\./ })).toBeInTheDocument();
  expect(screen.getByText("Ngày 01/01/2026")).toBeInTheDocument();
  expect(router.state.location.search).toBe("?date=2026-01-01");
});

test("API-32 lỗi → Alert + Thử lại tải lại được", async () => {
  await login("tst_cskh", "matkhau123", "DASHBOARD");
  server.use(http.get("/api/v1/reports/daily", () => apiError(500, "INTERNAL", "Lỗi"), { once: true }));
  renderApp("/admin");

  expect(await screen.findByText("Không tải được số liệu ngày.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
  expect(await card(/^Đã đóng gói: 8\./)).toBeInTheDocument();
});

test("Cần xử lý: lệch giờ camera và lỗi đồng bộ", async () => {
  await login("tst_cskh", "matkhau123", "DASHBOARD");
  server.use(
    http.get("/api/v1/reports/daily", () =>
      Response.json({
        date: "2026-10-04",
        counts: {
          packed: 0,
          had_mismatch: 0,
          abandoned: 0,
          cancelled: 0,
          packed_not_handed_over: 0,
          cancelled_after_pack: 0,
        },
        stations: [],
        attention: [
          { kind: "CLOCK_DRIFT", camera_id: "c", offset_ms: 1400 },
          { kind: "SYNC_ERROR", shop_id: "s", at: "2026-10-04T07:27:05Z" },
        ],
      }),
    ),
  );
  renderApp("/admin");

  expect(await screen.findByText("Camera lệch giờ 1,4 giây")).toBeInTheDocument();
  expect(screen.getByText("Đồng bộ Shopee lỗi lúc 04/10 14:27")).toBeInTheDocument();
  expect(screen.getByText("Chưa có station nào.")).toBeInTheDocument();
});
