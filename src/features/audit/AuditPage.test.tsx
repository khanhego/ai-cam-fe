import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { http, HttpResponse } from "msw";

import { login } from "@/lib/api/auth";
import { server } from "@/test/server";
import { mockAudit, resetMockAudit } from "@/mocks/handlers/users";
import { vnDay } from "@/shared/format";
import { renderApp } from "@/test/render";

beforeEach(async () => {
  await login("tst_admin", "matkhau123", "DASHBOARD");
});

const table = () => screen.findByRole("table", { name: "Nhật ký thao tác" });
const dataRows = async () =>
  within(await table())
    .getAllByRole("row")
    .slice(1);

test("FR-10.03: D10 bảng chỉ đọc (thời gian, người, hành động, đối tượng), 20 dòng / trang", async () => {
  renderApp("/admin/settings/audit");

  expect(await dataRows()).toHaveLength(20);
  expect(screen.getByText("26 kết quả")).toBeInTheDocument();
  expect(within(await table()).getAllByText("Đăng nhập").length).toBeGreaterThan(0);
  expect(within(await table()).queryByRole("button")).not.toBeInTheDocument();
});

test("D10: dòng của hệ thống (J-02 xóa clip) hiện người = Hệ thống", async () => {
  const user = userEvent.setup();
  renderApp("/admin/settings/audit");
  await table();

  await user.selectOptions(screen.getByLabelText("Hành động"), "DELETE_CLIP");

  await waitFor(async () => expect(await dataRows()).toHaveLength(1));
  const cells = within((await dataRows())[0]!).getAllByRole("cell");
  expect(cells[1]).toHaveTextContent("Hệ thống");
  expect(cells[2]).toHaveTextContent("Xóa clip");
  expect(cells[3]).toHaveTextContent("Clip clip-old-1");
});

test("D10: lọc theo người → chỉ dòng của người đó, lọc lưu ở URL", async () => {
  const user = userEvent.setup();
  const router = renderApp("/admin/settings/audit");
  const select = await screen.findByLabelText("Người");
  await waitFor(() =>
    expect(within(select).getByRole("option", { name: "Lan (tst_cskh)" })).toBeInTheDocument(),
  );

  await user.selectOptions(select, "u-cskh");

  await waitFor(() => expect(router.state.location.search).toContain("user_id=u-cskh"));
  await waitFor(async () => {
    const rows = await dataRows();
    expect(rows.length).toBe(mockAudit.filter((r) => r.user?.id === "u-cskh").length);
    rows.forEach((r) => expect(within(r).getAllByRole("cell")[1]).toHaveTextContent("Lan"));
  });
});

test("D10: lọc theo ngày; từ > đến → lỗi dưới ô, không gọi API", async () => {
  const today = vnDay();
  renderApp(`/admin/settings/audit?date_from=${today}&date_to=2020-01-01`);

  expect(await screen.findByText("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.")).toBeInTheDocument();
  expect(screen.queryByRole("table", { name: "Nhật ký thao tác" })).not.toBeInTheDocument();
});

test("D10: không có dòng khớp → Không có thao tác nào khớp bộ lọc. + Xóa bộ lọc", async () => {
  const user = userEvent.setup();
  renderApp("/admin/settings/audit?action=SHOP_CONNECT");

  expect(await screen.findByText("Không có thao tác nào khớp bộ lọc.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));
  expect(await dataRows()).toHaveLength(20);
});

test("D10: nhật ký trống → Chưa có thao tác nào.", async () => {
  resetMockAudit();
  mockAudit.splice(0);
  renderApp("/admin/settings/audit");

  expect(await screen.findByText("Chưa có thao tác nào.")).toBeInTheDocument();
});

test("D10: sang trang 2", async () => {
  const user = userEvent.setup();
  const router = renderApp("/admin/settings/audit");
  await table();

  await user.click(screen.getByRole("button", { name: "Sau" }));

  await waitFor(() => expect(router.state.location.search).toContain("page=2"));
  await waitFor(async () => expect(await dataRows()).toHaveLength(6));
});

test("F36: đổi sang khoảng ngày sai sau khi đã có kết quả → xóa bảng cũ, chỉ hiện lỗi dưới ô", async () => {
  const router = renderApp("/admin/settings/audit");
  expect(await dataRows()).toHaveLength(20);

  await router.navigate(`/admin/settings/audit?date_from=${vnDay()}&date_to=2020-01-01`);

  expect(await screen.findByText("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.")).toBeInTheDocument();
  expect(screen.queryByRole("table", { name: "Nhật ký thao tác" })).not.toBeInTheDocument();
  expect(screen.queryByText("26 kết quả")).not.toBeInTheDocument();
});

test("F36: bộ lọc Người tải đủ mọi trang tài khoản (> 100)", async () => {
  const mk = (i: number) => ({
    id: `u-${i}`,
    username: `user${i}`,
    display_name: `Người ${i}`,
    role: "CSKH",
    is_active: true,
    station: null,
    created_at: "2026-10-01T00:00:00Z",
  });
  server.use(
    http.get("/api/v1/users", ({ request }) => {
      const page = Number(new URL(request.url).searchParams.get("page"));
      const items = Array.from({ length: page === 1 ? 100 : 30 }, (_, i) => mk((page - 1) * 100 + i + 1));
      return HttpResponse.json({ items, page, page_size: 100, total: 130 });
    }),
  );
  renderApp("/admin/settings/audit");

  const select = await screen.findByLabelText("Người");
  expect(await within(select).findByRole("option", { name: "Người 130 (user130)" })).toBeInTheDocument();
  expect(within(select).getAllByRole("option")).toHaveLength(131);
});
