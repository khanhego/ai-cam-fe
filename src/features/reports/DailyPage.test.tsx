/** D2 Tổng quan ngày (01 §10.5, FR-09.01) — TC-09.01 (bước 5, phần UI), TC-09.02, TC-09.04 trên MSW. */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { login } from "@/lib/api/auth";
import { mockAttentionExtra } from "@/mocks/handlers/reports";
import { apiError } from "@/mocks/http";
import { vnDay } from "@/shared/format";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

const card = (name: RegExp) => screen.findByRole("link", { name });
/** `counts` đủ trường như BE M9 (API-32 Phase 1 + item 02). */
const COUNTS0 = {
  packed: 0,
  had_mismatch: 0,
  abandoned: 0,
  cancelled: 0,
  packed_not_handed_over: 0,
  cancelled_after_pack: 0,
  returns_received: 0,
  returns_received_issue: 0,
  returns_unidentified: 0,
  returns_expected: 0,
  returns_missing: 0,
  recon_open: { HIGH: 0, MEDIUM: 0, LOW: 0 },
  claims_open: 0,
  claims_due_soon: 0,
  label_on_tray: 0,
  cam2_unverified: 0,
};

test("TC-09.01: 6 thẻ số theo API-32, station và mục Cần xử lý (CSKH)", async () => {
  await login("tst_cskh", "matkhau123", "DASHBOARD");
  renderApp("/admin");

  expect(await card(/^Đã đóng gói: 8\./)).toBeInTheDocument();
  expect(await card(/^Từng lệch mã: 1\./)).toBeInTheDocument();
  expect(await card(/^Bỏ dở: 1\./)).toBeInTheDocument();
  expect(await card(/^Hủy phiên: 1\./)).toBeInTheDocument();
  // 8 kiện Phase 1 + SPXTST0000052 (dữ liệu hàng hoàn item 02 — 04 §1: PACKED 25 giờ, BR-14).
  expect(await card(/^Chưa bàn giao: 9\./)).toBeInTheDocument();
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
  // CSKH: link tới D3 / D14 / D15 / D16; không có link tới màn cấu hình hay D13 (không có quyền — DEC-51).
  const hrefs = within(attention)
    .getAllByRole("link")
    .map((a) => a.getAttribute("href"));
  expect(hrefs).toContain("/admin/packages?warehouse_status=CANCELLED_AFTER_PACK");
  expect(hrefs.some((h) => h?.startsWith("/admin/settings") || h === "/admin/approvals")).toBe(false);
  expect(screen.queryByText("Chưa có phiên đóng gói nào trong ngày.")).not.toBeInTheDocument();
});

test("ADMIN: camera mất tín hiệu có link sang D6", async () => {
  await login("tst_admin", "matkhau123", "DASHBOARD");
  renderApp("/admin");

  const attention = await screen.findByRole("region", { name: "Cần xử lý" });
  const row = within(attention).getByText("Cam 2 TST Station 01 mất tín hiệu").closest("li")!;
  expect(within(row).getByRole("link", { name: "Xem" })).toHaveAttribute("href", "/admin/settings/stations");
});

test("TC-09.02: thẻ dẫn sang D3 với bộ lọc tương ứng + ngày", async () => {
  await login("tst_sup", "matkhau123", "DASHBOARD");
  const router = renderApp("/admin");
  const today = vnDay();
  const day = `date_from=${today}&date_to=${today}`;

  const href = async (name: RegExp) => (await card(name)).getAttribute("href");
  expect(await href(/^Từng lệch mã:/)).toBe(`/admin/packages?session_flag=HAD_MISMATCH&${day}`);
  expect(await href(/^Bỏ dở:/)).toBe(`/admin/packages?session_status=ABANDONED&${day}`);
  expect(await href(/^Hủy phiên:/)).toBe(`/admin/packages?session_status=CANCELLED&${day}`);
  expect(await href(/^Chưa bàn giao:/)).toBe("/admin/packages?warehouse_status=PACKED");
  expect(await href(/^Hủy sau khi đóng:/)).toBe("/admin/packages?warehouse_status=CANCELLED_AFTER_PACK");

  await userEvent.click(await card(/^Đã đóng gói:/));
  await waitFor(() => expect(router.state.location.pathname).toBe("/admin/packages"));
  expect(Object.fromEntries(new URLSearchParams(router.state.location.search))).toEqual({
    session_status: "COMPLETED",
    date_from: today,
    date_to: today,
  });
  // D3 nhận đúng bộ lọc: số dòng = số trên thẻ "Đã đóng gói" (8).
  expect(await screen.findByText("8 kết quả")).toBeInTheDocument();
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

test("API-32 lỗi 5xx → tự thử lại 2 lần (02b §8) → Alert + Thử lại tải lại được", async () => {
  await login("tst_cskh", "matkhau123", "DASHBOARD");
  let calls = 0;
  server.use(
    http.get("/api/v1/reports/daily", () => {
      calls += 1;
      return apiError(500, "INTERNAL", "Lỗi");
    }),
  );
  renderApp("/admin");

  expect(await screen.findByText("Không tải được số liệu ngày.")).toBeInTheDocument();
  expect(calls).toBe(3);
  server.resetHandlers();
  await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
  expect(await card(/^Đã đóng gói: 8\./)).toBeInTheDocument();
});

test("Cần xử lý: lệch giờ camera và lỗi đồng bộ", async () => {
  await login("tst_cskh", "matkhau123", "DASHBOARD");
  server.use(
    http.get("/api/v1/reports/daily", () =>
      Response.json({
        date: "2026-10-04",
        counts: COUNTS0,
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

test("F12: CLIP_FAILED → '2 clip cắt lỗi — cần cắt lại' + link D3; kind lạ bị bỏ qua (không dòng trống)", async () => {
  await login("tst_cskh", "matkhau123", "DASHBOARD");
  server.use(
    http.get("/api/v1/reports/daily", () =>
      Response.json({
        date: "2026-10-04",
        counts: { ...COUNTS0, packed: 1 },
        stations: [],
        attention: [
          { kind: "CLIP_FAILED", count: 2 },
          { kind: "SOMETHING_NEW", foo: 1 },
        ],
      }),
    ),
  );
  renderApp("/admin");

  const attention = await screen.findByRole("region", { name: "Cần xử lý" });
  const row = (await within(attention).findByText("2 clip cắt lỗi — cần cắt lại")).closest("li")!;
  expect(within(row).getByRole("link", { name: "Xem" })).toHaveAttribute("href", "/admin/packages");
  expect(within(attention).getAllByRole("listitem")).toHaveLength(1);
});

test("F12: chỉ có kind lạ → câu 'Không có việc cần xử lý.'", async () => {
  await login("tst_cskh", "matkhau123", "DASHBOARD");
  server.use(
    http.get("/api/v1/reports/daily", () =>
      Response.json({
        date: "2026-10-04",
        counts: { ...COUNTS0, packed: 1 },
        stations: [],
        attention: [{ kind: "SOMETHING_NEW" }],
      }),
    ),
  );
  renderApp("/admin");

  expect(await screen.findByText("Không có việc cần xử lý.")).toBeInTheDocument();
});

test("TC-09.05 (UI): D2 Cần xử lý có dòng ổ đĩa kèm % khi API-32 trả DISK_USAGE > 80", async () => {
  mockAttentionExtra.splice(0, mockAttentionExtra.length, { kind: "DISK_USAGE", percent: 85 });
  await login("tst_admin", "matkhau123", "DASHBOARD");
  renderApp("/admin");

  const attention = await screen.findByRole("region", { name: "Cần xử lý" });
  const row = (await within(attention).findByText("Ổ lưu video đã dùng 85%")).closest("li")!;
  expect(within(row).getByRole("link", { name: "Xem" })).toHaveAttribute("href", "/admin/settings/storage");
});

test("TC-09.20 / 09.21 (UI), TC-03.74: thẻ hàng hoàn / lệch / hồ sơ + 2 cờ, Cần xử lý mới, link màn lọc sẵn", async () => {
  await login("tst_sup", "matkhau123", "DASHBOARD");
  server.use(
    http.get("/api/v1/reports/daily", () =>
      Response.json({
        date: vnDay(),
        counts: {
          ...COUNTS0,
          packed: 3,
          returns_received: 4,
          returns_received_issue: 1,
          returns_unidentified: 1,
          returns_expected: 41,
          returns_missing: 1,
          recon_open: { HIGH: 1, MEDIUM: 4, LOW: 2 },
          claims_open: 2,
          claims_due_soon: 1,
          label_on_tray: 1,
          cam2_unverified: 1,
        },
        stations: [
          {
            id: "st-3",
            name: "Station 03",
            state: "INSPECTING",
            cameras: [],
            last_scan_at: null,
            tracking_number: "SPXTST0000041",
            work_mode: "RETURN",
            operator_name: "Lan",
          },
        ],
        attention: [
          { kind: "RETURN_MISSING", count: 1 },
          { kind: "RECON_HIGH", count: 1 },
          { kind: "CLAIM_DUE_SOON", count: 1 },
          { kind: "RETURN_UNIDENTIFIED", count: 1 },
          { kind: "RETURN_SESSION_ABANDONED", count: 2 },
          { kind: "RETURN_FORCE_NEW", count: 1 },
        ],
      }),
    ),
  );
  renderApp("/admin");
  const today = vnDay();
  const href = async (name: RegExp) => (await card(name)).getAttribute("href");
  expect(await href(/^Phiếu còn trên khay: 1\./)).toBe(
    `/admin/packages?session_flag=LABEL_ON_TRAY&date_from=${today}&date_to=${today}`,
  );
  expect(await href(/^Cam 2 không xác minh: 1\./)).toBe(
    `/admin/packages?session_flag=CAM2_UNVERIFIED&date_from=${today}&date_to=${today}`,
  );
  expect(await href(/^Hoàn đã nhận: 4, 1 có vấn đề · 1 chưa xác định\./)).toBe("/admin/returns?tab=RECEIVED");
  expect(await href(/^Hoàn đang về: 41\./)).toBe("/admin/returns");
  expect(await href(/^Quá hạn chưa về: 1\./)).toBe("/admin/returns?tab=MISSING");
  expect(await href(/^Lệch: 7, 1 Cao · 6 khác\./)).toBe("/admin/recon");
  expect(await href(/^Hồ sơ mở: 2, 1 sắp hạn\./)).toBe("/admin/claims?status=ALL");

  const stations = screen.getByRole("region", { name: "Station" });
  expect(within(stations).getByText("Nhận hoàn")).toBeInTheDocument();
  expect(within(stations).getByText("Người kiểm Lan")).toBeInTheDocument();
  expect(within(stations).getByText("Đang kiểm hoàn")).toBeInTheDocument();
  expect(within(stations).getByText("SPXTST0000041")).toBeInTheDocument();

  const attention = screen.getByRole("region", { name: "Cần xử lý" });
  const linkOf = (text: string) => within(within(attention).getByText(text).closest("li")!).getByRole("link");
  expect(linkOf("1 kiện hoàn quá 7 ngày chưa về")).toHaveAttribute("href", "/admin/returns?tab=MISSING");
  expect(linkOf("1 lệch mức Cao")).toHaveAttribute("href", "/admin/recon?severity=HIGH");
  expect(linkOf("1 hồ sơ sắp hết hạn")).toHaveAttribute("href", "/admin/claims?status=ALL&due=soon");
  expect(linkOf("1 kiện hoàn chưa xác định")).toHaveTextContent("Gắn đơn");
  expect(linkOf("2 phiên mở hoàn bị bỏ dở — cần kiểm lại")).toHaveAttribute(
    "href",
    "/admin/packages?session_type=RETURN&session_status=ABANDONED",
  );
  expect(linkOf("1 kiện hoàn ghi riêng (đơn đã nhận hoàn) — cần gắn đơn")).toHaveAttribute(
    "href",
    "/admin/returns?tab=UNIDENTIFIED",
  );
});
