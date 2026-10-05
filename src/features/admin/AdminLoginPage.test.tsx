import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderApp } from "@/test/render";

async function submit(username: string, password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Tên đăng nhập"), username);
  await user.type(screen.getByLabelText("Mật khẩu"), password);
  await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
}

test("đăng nhập đúng → quay lại trang `next`", async () => {
  const router = renderApp("/admin/login?next=%2Fadmin%2Fsettings%2Fstations");

  await submit("tst_admin", "matkhau123");

  await waitFor(() => expect(router.state.location.pathname).toBe("/admin/settings/stations"));
});

test("next ngoài /admin bị bỏ qua (chống chuyển hướng ra ngoài)", async () => {
  const router = renderApp("/admin/login?next=https%3A%2F%2Fevil.example");

  await submit("tst_admin", "matkhau123");

  await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/admin/));
});

test.each([
  ["tst_admin", "sai", "Sai tài khoản hoặc mật khẩu."],
  ["tst_station01", "matkhau123", "Tài khoản station chỉ đăng nhập tại màn station."],
])("%s / %s → %s", async (username, password, message) => {
  renderApp("/admin/login");

  await submit(username, password);

  expect(await screen.findByRole("alert")).toHaveTextContent(message);
});
