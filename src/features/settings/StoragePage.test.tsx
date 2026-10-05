import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { login } from "@/lib/api/auth";
import { mockHealth, mockSettings } from "@/mocks/handlers/settings";
import { renderApp } from "@/test/render";

import { fmtBytes, validateSettings } from "./rules";

beforeEach(async () => {
  await login("tst_admin", "matkhau123", "DASHBOARD");
});

async function setField(label: string, value: string) {
  const user = userEvent.setup();
  const input = await screen.findByLabelText(label);
  await user.clear(input);
  if (value) await user.type(input, value);
  return user;
}

test("D8: hiện cài đặt hiện tại; Lưu khóa khi chưa đổi", async () => {
  renderApp("/admin/settings/storage");

  expect(await screen.findByLabelText("Số ngày giữ video thô")).toHaveValue("30");
  expect(screen.getByLabelText("Số ngày giữ clip")).toHaveValue("90");
  expect(screen.getByLabelText("Cảnh báo khi phiên quá (phút)")).toHaveValue("15");
  expect(screen.getByLabelText("Bỏ dở phiên sau (phút)")).toHaveValue("30");
  expect(screen.getByRole("button", { name: "Lưu" })).toBeDisabled();
});

test("FR-02.06 / TC-02.07 (UI): đổi số ngày giữ clip → Lưu → Đã lưu, server nhận đủ 4 trường", async () => {
  renderApp("/admin/settings/storage");
  const user = await setField("Số ngày giữ clip", "180");

  await user.click(screen.getByRole("button", { name: "Lưu" }));

  expect(await screen.findByText("Đã lưu.")).toBeInTheDocument();
  expect(mockSettings).toMatchObject({
    retention_raw_days: 30,
    retention_clip_days: 180,
    session_warn_minutes: 15,
    session_abandon_minutes: 30,
  });
});

test("TC-02.09: clip < video thô → lỗi dưới ô clip, không gửi", async () => {
  renderApp("/admin/settings/storage");
  const user = await setField("Số ngày giữ clip", "20");

  await user.click(screen.getByRole("button", { name: "Lưu" }));

  expect(await screen.findByText("Số ngày giữ clip phải lớn hơn hoặc bằng video thô.")).toBeInTheDocument();
  expect(mockSettings.retention_clip_days).toBe(90);
});

test("TC-02.17 / 02.18: 0 và 366 ngày → lỗi khoảng 1–365", async () => {
  renderApp("/admin/settings/storage");
  await setField("Số ngày giữ video thô", "0");
  const user = await setField("Số ngày giữ clip", "366");

  await user.click(screen.getByRole("button", { name: "Lưu" }));

  expect(await screen.findAllByText("Nhập số ngày từ 1 đến 365.")).toHaveLength(2);
});

test("TC-02.16 (UI): bỏ dở ≤ cảnh báo → lỗi dưới ô bỏ dở", async () => {
  renderApp("/admin/settings/storage");
  const user = await setField("Bỏ dở phiên sau (phút)", "15");

  await user.click(screen.getByRole("button", { name: "Lưu" }));

  expect(await screen.findByText("Thời gian bỏ dở phải lớn hơn thời gian cảnh báo.")).toBeInTheDocument();
});

test("D8: lỗi field từ server (VALIDATION_ERROR) hiện dưới ô", async () => {
  // Client cho qua (abandon 1440 > warn 1439) — giả lập server từ chối khác client.
  const { server } = await import("@/test/server");
  const { http } = await import("msw");
  const { apiError } = await import("@/mocks/http");
  server.use(
    http.put("/api/v1/settings", () =>
      apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", {
        fields: { retention_raw_days: "Máy chủ từ chối giá trị này." },
      }),
    ),
  );
  renderApp("/admin/settings/storage");
  const user = await setField("Số ngày giữ video thô", "31");

  await user.click(screen.getByRole("button", { name: "Lưu" }));

  expect(await screen.findByText("Máy chủ từ chối giá trị này.")).toBeInTheDocument();
});

test("API-81: ổ ≥ 80% → cảnh báo; dịch vụ lỗi; camera mất tín hiệu", async () => {
  mockHealth.redis = "ERROR";
  renderApp("/admin/settings/storage");

  const panel = await screen.findByRole("region", { name: "Sức khỏe hệ thống" });
  expect(
    await within(panel).findByText(
      "Ổ lưu video đã dùng 83%. Giảm số ngày giữ video thô hoặc thêm ổ trước khi đầy.",
    ),
  ).toBeInTheDocument();
  expect(within(panel).getByText("Đã dùng 6,6 TB / 8 TB (83%)")).toBeInTheDocument();
  const redis = within(panel).getByText("Redis").closest("li")!;
  expect(within(redis).getByText("Lỗi")).toBeInTheDocument();
  const cam2 = within(panel).getByText("TST Station 01 · Cam 2").closest("li")!;
  expect(within(cam2).getByText("Mất tín hiệu")).toBeInTheDocument();
});

test("TC-09.05 (UI): D8 ổ 85% → LinearProgress màu cảnh báo + Alert kèm %", async () => {
  mockHealth.diskPercent = 85;
  renderApp("/admin/settings/storage");

  const panel = await screen.findByRole("region", { name: "Sức khỏe hệ thống" });
  expect(await within(panel).findByText(/Ổ lưu video đã dùng 85%/)).toBeInTheDocument();
  const bar = within(panel).getByRole("progressbar", { name: "Ổ lưu video" });
  expect(bar).toHaveAttribute("aria-valuenow", "85");
  expect(bar.firstElementChild).toHaveClass("bg-error");
});

test("API-81: ổ dưới 80% → không cảnh báo", async () => {
  mockHealth.diskPercent = 30;
  renderApp("/admin/settings/storage");

  const panel = await screen.findByRole("region", { name: "Sức khỏe hệ thống" });
  await within(panel).findByText("Đã dùng 2,4 TB / 8 TB (30%)");
  expect(within(panel).queryByText(/Giảm số ngày giữ video thô/)).not.toBeInTheDocument();
});

test("rules: validateSettings + fmtBytes", () => {
  const ok = validateSettings({
    retention_raw_days: "30",
    retention_clip_days: "30",
    session_warn_minutes: "1",
    session_abandon_minutes: "1440",
  });
  expect(ok.value).toEqual({
    retention_raw_days: 30,
    retention_clip_days: 30,
    session_warn_minutes: 1,
    session_abandon_minutes: 1440,
  });
  const bad = validateSettings({
    retention_raw_days: "1.5",
    retention_clip_days: "abc",
    session_warn_minutes: "1441",
    session_abandon_minutes: "",
  });
  expect(bad.value).toBeNull();
  expect(Object.keys(bad.errors)).toHaveLength(4);
  expect(fmtBytes(999)).toBe("999 B");
  expect(fmtBytes(1_500_000_000)).toBe("1,5 GB");
});

test("D2: Cần xử lý ổ đầy → link Xem tới D8 (Admin)", async () => {
  const user = userEvent.setup();
  const router = renderApp("/admin");
  const attention = await screen.findByRole("region", { name: "Cần xử lý" });
  const row = (await within(attention).findByText(/Ổ lưu video đã dùng 83%/)).closest("li")!;

  await user.click(within(row).getByRole("link", { name: "Xem" }));

  await waitFor(() => expect(router.state.location.pathname).toBe("/admin/settings/storage"));
});
