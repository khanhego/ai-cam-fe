import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { login } from "@/lib/api/auth";
import { mockRefresh, mockUsers } from "@/mocks/db";
import { mockAudit } from "@/mocks/handlers/users";
import { renderApp } from "@/test/render";

beforeEach(async () => {
  await login("tst_admin", "matkhau123", "DASHBOARD");
});

const table = () => screen.findByRole("table", { name: "Người dùng" });
const rowOf = async (username: string) => (await within(await table()).findByText(username)).closest("tr")!;
const dialog = () => screen.getByRole("dialog");

test("D9: bảng tên, tài khoản, vai trò, station gắn với (chỉ vai Station), trạng thái", async () => {
  renderApp("/admin/settings/users");

  const st1 = await rowOf("tst_station01");
  expect(within(st1).getByText("Station")).toBeInTheDocument();
  expect(within(st1).getByText("TST Station 01", { selector: "td:nth-child(4)" })).toBeInTheDocument();
  expect(
    within(st1).getByRole("button", { name: "Thu hồi phiên đăng nhập tst_station01" }),
  ).toBeInTheDocument();
  const off = await rowOf("tst_disabled");
  expect(within(off).getByText("Đã khóa")).toBeInTheDocument();
  expect(within(off).getByRole("button", { name: "Mở khóa tst_disabled" })).toBeInTheDocument();
  const cskh = await rowOf("tst_cskh");
  expect(within(cskh).queryByRole("button", { name: /Thu hồi/ })).not.toBeInTheDocument();
});

test("FR-10.01: Thêm người dùng → Đã tạo tài khoản, dòng mới, audit USER_UPDATE", async () => {
  const user = userEvent.setup();
  renderApp("/admin/settings/users");
  await table();

  await user.click(screen.getByRole("button", { name: "Thêm người dùng" }));
  await user.type(within(dialog()).getByLabelText("Tên đăng nhập"), "qa_cskh2");
  await user.type(within(dialog()).getByLabelText("Tên hiển thị"), "Hoa");
  await user.selectOptions(within(dialog()).getByLabelText("Vai trò"), "CSKH");
  await user.type(within(dialog()).getByLabelText("Mật khẩu"), "12345678");
  await user.click(within(dialog()).getByRole("button", { name: "Tạo tài khoản" }));

  expect(await screen.findByText("Đã tạo tài khoản.")).toBeInTheDocument();
  expect(await rowOf("qa_cskh2")).toHaveTextContent("Hoa");
  expect(mockAudit[0]).toMatchObject({ action: "USER_UPDATE", object_type: "USER" });
});

test("D9: kiểm client — tên đăng nhập sai mẫu, mật khẩu < 8", async () => {
  const user = userEvent.setup();
  renderApp("/admin/settings/users");
  await table();
  await user.click(screen.getByRole("button", { name: "Thêm người dùng" }));

  await user.type(within(dialog()).getByLabelText("Tên đăng nhập"), "AB");
  await user.type(within(dialog()).getByLabelText("Tên hiển thị"), "x");
  await user.type(within(dialog()).getByLabelText("Mật khẩu"), "1234567");
  await user.click(within(dialog()).getByRole("button", { name: "Tạo tài khoản" }));

  expect(
    within(dialog()).getByText("Tên đăng nhập 3–32 ký tự, chỉ gồm chữ thường không dấu, số và . _ -"),
  ).toBeInTheDocument();
  expect(within(dialog()).getByText("Mật khẩu phải có ít nhất 8 ký tự.")).toBeInTheDocument();
});

test("TC-10.08: trùng username → lỗi dưới ô Tên đăng nhập", async () => {
  const user = userEvent.setup();
  renderApp("/admin/settings/users");
  await table();
  await user.click(screen.getByRole("button", { name: "Thêm người dùng" }));

  await user.type(within(dialog()).getByLabelText("Tên đăng nhập"), "tst_admin");
  await user.type(within(dialog()).getByLabelText("Tên hiển thị"), "x");
  await user.type(within(dialog()).getByLabelText("Mật khẩu"), "12345678");
  await user.click(within(dialog()).getByRole("button", { name: "Tạo tài khoản" }));

  expect(await within(dialog()).findByText("Tên đăng nhập đã tồn tại.")).toBeInTheDocument();
  expect(within(dialog()).getByLabelText("Tên đăng nhập")).toHaveAttribute("aria-invalid", "true");
});

test("TC-10.07: khóa Admin cuối → Phải còn ít nhất một Admin., vẫn hoạt động", async () => {
  const user = userEvent.setup();
  renderApp("/admin/settings/users");

  await user.click(
    within(await rowOf("tst_admin")).getByRole("button", { name: "Khóa tài khoản tst_admin" }),
  );
  await user.click(within(dialog()).getByRole("button", { name: "Khóa tài khoản" }));

  expect(await screen.findByText("Phải còn ít nhất một Admin.")).toBeInTheDocument();
  expect(within(await rowOf("tst_admin")).getByText("Đang hoạt động")).toBeInTheDocument();
});

test("TC-10.07 (đổi vai): hạ vai Admin cuối trong dialog Sửa → Alert trong dialog", async () => {
  const user = userEvent.setup();
  renderApp("/admin/settings/users");

  await user.click(within(await rowOf("tst_admin")).getByRole("button", { name: "Sửa tst_admin" }));
  await user.selectOptions(within(dialog()).getByLabelText("Vai trò"), "CSKH");
  expect(
    within(dialog()).getByText("Đổi vai trò sẽ đăng xuất tài khoản này khỏi mọi thiết bị."),
  ).toBeInTheDocument();
  await user.click(within(dialog()).getByRole("button", { name: "Lưu" }));

  expect(await within(dialog()).findByText("Phải còn ít nhất một Admin.")).toBeInTheDocument();
});

test("D9: khóa rồi mở khóa tài khoản CSKH; tài khoản bị khóa không đăng nhập được", async () => {
  const user = userEvent.setup();
  renderApp("/admin/settings/users");

  await user.click(within(await rowOf("tst_cskh")).getByRole("button", { name: "Khóa tài khoản tst_cskh" }));
  await user.click(within(dialog()).getByRole("button", { name: "Khóa tài khoản" }));
  expect(await screen.findByText("Đã khóa tài khoản.")).toBeInTheDocument();
  await waitFor(async () => expect(within(await rowOf("tst_cskh")).getByText("Đã khóa")).toBeInTheDocument());
  await expect(login("tst_cskh", "matkhau123", "DASHBOARD")).rejects.toMatchObject({
    code: "ACCOUNT_DISABLED",
  });

  await user.click(within(await rowOf("tst_cskh")).getByRole("button", { name: "Mở khóa tst_cskh" }));
  expect(await screen.findByText("Đã mở khóa tài khoản.")).toBeInTheDocument();
});

test("D9: đặt lại mật khẩu → mật khẩu mới đăng nhập được", async () => {
  const user = userEvent.setup();
  renderApp("/admin/settings/users");

  await user.click(within(await rowOf("tst_sup")).getByRole("button", { name: "Đặt lại mật khẩu tst_sup" }));
  await user.type(within(dialog()).getByLabelText("Mật khẩu mới"), "short");
  await user.click(within(dialog()).getByRole("button", { name: "Đặt mật khẩu" }));
  expect(within(dialog()).getByText("Mật khẩu phải có ít nhất 8 ký tự.")).toBeInTheDocument();
  await user.type(within(dialog()).getByLabelText("Mật khẩu mới"), "-moi-123");
  await user.click(within(dialog()).getByRole("button", { name: "Đặt mật khẩu" }));

  expect(await screen.findByText("Đã đặt lại mật khẩu. Tài khoản phải đăng nhập lại.")).toBeInTheDocument();
  expect(mockUsers.find((u) => u.username === "tst_sup")?.password).toBe("short-moi-123");
});

test("TC-10.06 (UI): Thu hồi phiên đăng nhập station → xác nhận nêu ≤ 15 phút, phiên refresh bị xóa", async () => {
  const user = userEvent.setup();
  mockRefresh.set("STATION", "u-st1");
  renderApp("/admin/settings/users");

  await user.click(
    within(await rowOf("tst_station01")).getByRole("button", {
      name: "Thu hồi phiên đăng nhập tst_station01",
    }),
  );
  expect(within(dialog()).getByText(/tối đa 15 phút/)).toBeInTheDocument();
  await user.click(within(dialog()).getByRole("button", { name: "Thu hồi" }));

  expect(
    await screen.findByText("Đã thu hồi phiên đăng nhập. Station về màn đăng nhập trong tối đa 15 phút."),
  ).toBeInTheDocument();
  expect(mockRefresh.has("STATION")).toBe(false);
  expect(mockAudit[0]).toMatchObject({ action: "SESSIONS_REVOKED", object_id: "u-st1" });
});

test("D9: lọc theo vai trò Station", async () => {
  const user = userEvent.setup();
  renderApp("/admin/settings/users");
  await table();

  await user.selectOptions(screen.getByLabelText("Vai trò"), "STATION");

  await waitFor(async () => expect(within(await table()).queryByText("tst_admin")).not.toBeInTheDocument());
  expect(within(await table()).getByText("tst_station02")).toBeInTheDocument();
});

test("TC-P.09 (UI): Supervisor không vào D9 / D10, menu không có", async () => {
  await login("tst_sup", "matkhau123", "DASHBOARD");
  const router = renderApp("/admin/settings/users");

  await waitFor(() => expect(router.state.location.pathname).toBe("/admin/forbidden"));
  const nav = screen.getByRole("navigation", { name: "Điều hướng chính" });
  expect(within(nav).queryByRole("link", { name: /Người dùng/ })).not.toBeInTheDocument();
  expect(within(nav).queryByRole("link", { name: /Nhật ký/ })).not.toBeInTheDocument();
});
