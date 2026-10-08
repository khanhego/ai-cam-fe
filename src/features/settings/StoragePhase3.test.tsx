import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { login } from "@/lib/api/auth";
import { mockBackup } from "@/mocks/handlers/backup";
import { mockSettings } from "@/mocks/handlers/settings";
import { renderApp } from "@/test/render";

import { backupHealth } from "./backupHealth";

/** D8 item 03 (T-259; 01 §10.5 D8): công tắc người đóng gói, hạn Chỉ hoàn tiền, dòng "Sao lưu cloud". */
beforeEach(async () => {
  await login("tst_admin", "matkhau123", "DASHBOARD");
});

test("FR-03.16 / FR-08.08: bật 'Bắt buộc tên người đóng gói' + hạn Chỉ hoàn tiền 24 → Lưu gửi cả hai", async () => {
  const user = userEvent.setup();
  renderApp("/admin/settings/storage");

  const hours = await screen.findByLabelText("Hạn mặc định Chỉ hoàn tiền (giờ)");
  expect(hours).toHaveValue("48");
  const packer = screen.getByRole("switch", { name: "Bắt buộc tên người đóng gói" });
  expect(packer).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Lưu" })).toBeDisabled();

  await user.click(packer);
  expect(screen.getByRole("button", { name: "Lưu" })).toBeEnabled();
  await user.clear(hours);
  await user.type(hours, "200");
  await user.click(screen.getByRole("button", { name: "Lưu" }));
  expect(await screen.findByText("Nhập số từ 1 đến 168.")).toBeInTheDocument();

  await user.clear(hours);
  await user.type(hours, "24");
  await user.click(screen.getByRole("button", { name: "Lưu" }));
  expect(await screen.findByText("Đã lưu.")).toBeInTheDocument();
  expect(mockSettings).toMatchObject({ packer_name_required: true, refund_only_default_hours: 24 });
  expect(screen.getByRole("switch", { name: "Bắt buộc tên người đóng gói" })).toBeChecked();
});

test("FR-02.15 (D8): dòng 'Sao lưu cloud' — Trễ khi còn lệch mã băm; link Mở Sao lưu → D23", async () => {
  const user = userEvent.setup();
  const router = renderApp("/admin/settings/storage");

  const panel = await screen.findByRole("region", { name: "Sức khỏe hệ thống" });
  expect(await within(panel).findByRole("heading", { name: "Sao lưu cloud" })).toBeInTheDocument();
  expect(
    within(panel).getByText(/^DB (\d{2}:\d{2}|\d{2}\/\d{2} \d{2}:\d{2}) · 3 tệp chờ$/),
  ).toBeInTheDocument();
  expect(within(panel).getByText("Trễ")).toBeInTheDocument();

  await user.click(within(panel).getByRole("link", { name: "Mở Sao lưu" }));
  expect(router.state.location.pathname).toBe("/admin/settings/backup");
  expect(await screen.findByRole("heading", { level: 1, name: "Sao lưu cloud" })).toBeInTheDocument();
});

test("FR-02.15 (D8): Chưa cấu hình → chip xám, không dòng DB", async () => {
  mockBackup.configured = false;
  renderApp("/admin/settings/storage");
  const panel = await screen.findByRole("region", { name: "Sức khỏe hệ thống" });
  expect(await within(panel).findByText("Chưa cấu hình")).toBeInTheDocument();
  expect(within(panel).getByText("Chưa có lần sao lưu DB thành công")).toBeInTheDocument();
});

test("backupHealth: OK / Trễ / Lỗi sau lần thành công / lỗi cũ hơn lần thành công / trạng thái khác ON", () => {
  const base = {
    state: "ON" as const,
    last_db_success_at: "2026-10-07T06:00:00Z",
    pending: 3,
    late: false,
    last_error: null,
  };
  expect(backupHealth(base)).toMatchObject({ tone: "success", chip: "Hoạt động" });
  expect(backupHealth({ ...base, late: true })).toMatchObject({ tone: "warning", chip: "Trễ" });
  const err = {
    code: "CLOUD_UNREACHABLE",
    message: "Không kết nối được kho lưu.",
    at: "2026-10-07T07:00:00Z",
  };
  expect(backupHealth({ ...base, last_error: err })).toMatchObject({
    tone: "error",
    chip: "Lỗi",
    text: "Không kết nối được kho lưu.",
  });
  expect(backupHealth({ ...base, last_error: { ...err, at: "2026-10-07T05:00:00Z" } })).toMatchObject({
    tone: "success",
  });
  expect(backupHealth({ ...base, state: "KEY_CHANGED" })).toMatchObject({
    tone: "error",
    chip: "Khóa đã đổi",
  });
  expect(backupHealth({ ...base, state: "NOT_CONFIGURED" })).toMatchObject({
    tone: "neutral",
    chip: "Chưa cấu hình",
    text: null,
  });
});
