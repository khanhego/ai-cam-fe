import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderApp } from "@/test/render";
import { hidScan } from "@/test/scan";

async function submit(username: string, password: string) {
  const user = userEvent.setup();
  if (username) await user.type(await screen.findByLabelText("Tài khoản station"), username);
  if (password) await user.type(screen.getByLabelText("Mật khẩu"), password);
  await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
}

test("đăng nhập đúng → vào station", async () => {
  const router = renderApp("/station/login");

  await submit("tst_station01", "matkhau123");

  await waitFor(() => expect(router.state.location.pathname).toBe("/station"));
  expect(await screen.findByText("SẴN SÀNG")).toBeInTheDocument();
});

test("bỏ trống → lỗi dưới ô, không gọi API", async () => {
  renderApp("/station/login");

  await submit("", "");

  expect(await screen.findByText("Nhập tài khoản station.")).toBeInTheDocument();
  expect(screen.getByText("Nhập mật khẩu.")).toBeInTheDocument();
});

test.each([
  ["tst_station01", "sai", "Sai tài khoản hoặc mật khẩu. Kiểm tra lại hoặc hỏi Admin."],
  ["tst_cskh", "matkhau123", "Tài khoản này không dùng cho station. Đăng nhập dashboard tại /admin."],
  ["tst_disabled", "matkhau123", "Tài khoản đã bị khóa. Liên hệ Admin."],
])("%s / %s → %s", async (username, password, message) => {
  renderApp("/station/login");

  await submit(username, password);

  expect(await screen.findByRole("alert")).toHaveTextContent(message);
});

test("tài khoản bị khóa tạm hiện giờ mở khóa", async () => {
  renderApp("/station/login");

  await submit("tst_locked", "matkhau123");

  expect(await screen.findByRole("alert")).toHaveTextContent(
    /Đăng nhập sai quá nhiều lần\. Thử lại sau \d{2}:\d{2}\./,
  );
});

test("EX-P9: quét mã khi chưa đăng nhập → nhắc đăng nhập, không gọi API", async () => {
  renderApp("/station/login");
  await screen.findByRole("heading", { name: "Đăng nhập station" });

  await hidScan("SPXTST0000001");

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Station chưa đăng nhập. Đăng nhập rồi quét lại.",
  );
});
