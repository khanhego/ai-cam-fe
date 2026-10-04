import { screen, waitFor } from "@testing-library/react";

import { login } from "@/lib/api/auth";
import { renderApp } from "@/test/render";

test("gốc → /admin → chưa đăng nhập thì về màn đăng nhập dashboard, giữ next", async () => {
  const router = renderApp("/");

  expect(await screen.findByRole("heading", { name: "Đăng nhập" })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/admin/login");
  expect(router.state.location.search).toBe("?next=%2Fadmin");
});

test("chưa đăng nhập vào /station → màn đăng nhập station", async () => {
  const router = renderApp("/station");

  expect(await screen.findByRole("heading", { name: "Đăng nhập station" })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/station/login");
});

test("đã đăng nhập station vào thẳng /station", async () => {
  await login("tst_station01", "matkhau123", "STATION");

  renderApp("/station");

  expect(await screen.findByText("SẴN SÀNG")).toBeInTheDocument();
});

test("tài khoản dashboard mở /station bị chuyển sang /admin", async () => {
  await login("tst_cskh", "matkhau123", "DASHBOARD");

  const router = renderApp("/station");

  await waitFor(() => expect(router.state.location.pathname).toBe("/admin"));
});

test("tài khoản station mở /admin bị chuyển sang /station", async () => {
  await login("tst_station01", "matkhau123", "STATION");

  const router = renderApp("/admin");

  await waitFor(() => expect(router.state.location.pathname).toBe("/station"));
});

test("ADMIN vào /admin → màn đầu tiên trong menu (Station)", async () => {
  await login("tst_admin", "matkhau123", "DASHBOARD");

  const router = renderApp("/admin");

  await waitFor(() => expect(router.state.location.pathname).toBe("/admin/settings/stations"));
  expect(await screen.findByRole("link", { name: /Station/ })).toBeInTheDocument();
});

test("CSKH vào màn chỉ dành cho ADMIN → D12 không có quyền; menu không có Cài đặt", async () => {
  await login("tst_cskh", "matkhau123", "DASHBOARD");

  const router = renderApp("/admin/settings/stations");

  await waitFor(() => expect(router.state.location.pathname).toBe("/admin/forbidden"));
  expect(await screen.findByText("Tài khoản của bạn không có quyền xem trang này.")).toBeInTheDocument();
  expect(screen.queryByText("Cài đặt")).not.toBeInTheDocument();
});

test("đường dẫn không tồn tại → 404", async () => {
  await login("tst_admin", "matkhau123", "DASHBOARD");

  renderApp("/admin/khong-co");

  expect(await screen.findByText("Không tìm thấy trang.")).toBeInTheDocument();
});
