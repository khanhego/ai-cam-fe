import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { login } from "@/lib/api/auth";
import { mockHealth, mockSettings } from "@/mocks/handlers/settings";
import { renderApp } from "@/test/render";

import { fmtBytes, isReduction, validateSettings } from "./rules";

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

const THRESHOLDS_FORM = {
  return_missing_days: "7",
  handover_warn_hours: "24",
  claim_deadline_days: "7",
  claim_due_soon_hours: "48",
  return_warn_minutes: "20",
  return_abandon_minutes: "45",
};

test("rules: validateSettings (10 ô, sàn clip, phiên hoàn) + isReduction + fmtBytes", () => {
  const ok = validateSettings({
    retention_raw_days: "30",
    retention_clip_days: "30",
    session_warn_minutes: "1",
    session_abandon_minutes: "1440",
    ...THRESHOLDS_FORM,
  });
  expect(ok.value).toMatchObject({
    retention_raw_days: 30,
    retention_clip_days: 30,
    session_warn_minutes: 1,
    session_abandon_minutes: 1440,
    return_missing_days: 7,
    return_abandon_minutes: 45,
  });
  const bad = validateSettings({
    retention_raw_days: "1.5",
    retention_clip_days: "abc",
    session_warn_minutes: "1441",
    session_abandon_minutes: "",
    ...THRESHOLDS_FORM,
    return_missing_days: "61",
    claim_deadline_days: "0",
    return_abandon_minutes: "20",
  });
  expect(bad.value).toBeNull();
  expect(bad.errors).toMatchObject({
    return_missing_days: "Nhập số từ 1 đến 60.",
    claim_deadline_days: "Nhập số từ 1 đến 90.",
    return_abandon_minutes: "Thời gian tự đóng phải lớn hơn thời gian cảnh báo.",
  });
  expect(Object.keys(bad.errors)).toHaveLength(7);
  // Sàn chỉ báo khi ràng buộc chéo đã qua (như BE).
  const floor = (clip: string) =>
    validateSettings(
      {
        retention_raw_days: "30",
        retention_clip_days: clip,
        session_warn_minutes: "15",
        session_abandon_minutes: "30",
        ...THRESHOLDS_FORM,
      },
      60,
    ).errors.retention_clip_days;
  expect(floor("45")).toBe("Số ngày giữ clip không được thấp hơn 60.");
  expect(floor("20")).toBe("Số ngày giữ clip phải lớn hơn hoặc bằng video thô.");
  expect(floor("60")).toBeUndefined();
  const cur = { retention_raw_days: 30, retention_clip_days: 90 };
  expect(isReduction({ retention_raw_days: 30, retention_clip_days: 70 }, cur)).toBe(true);
  expect(isReduction({ retention_raw_days: 20, retention_clip_days: 120 }, cur)).toBe(true);
  expect(isReduction({ retention_raw_days: 30, retention_clip_days: 120 }, cur)).toBe(false);
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

test("TC-02.37 (UI): chữ sàn 'Tối thiểu 60 ngày'; clip 45 → lỗi dưới ô, không gửi; server RETENTION_BELOW_MINIMUM → lỗi theo details.min", async () => {
  renderApp("/admin/settings/storage");
  expect(await screen.findByText(/Tối thiểu 60 ngày \(cấu hình máy chủ\)\./)).toBeInTheDocument();
  let user = await setField("Số ngày giữ clip", "45");
  await user.click(screen.getByRole("button", { name: "Lưu" }));
  expect(await screen.findByText("Số ngày giữ clip không được thấp hơn 60.")).toBeInTheDocument();
  expect(mockSettings.retention_clip_days).toBe(90);

  const { server } = await import("@/test/server");
  const { http } = await import("msw");
  const { apiError } = await import("@/mocks/http");
  server.use(
    http.put("/api/v1/settings", () =>
      apiError(422, "RETENTION_BELOW_MINIMUM", "Số ngày giữ clip không được thấp hơn 75.", {
        min: 75,
        fields: { retention_clip_days: "Số ngày giữ clip không được thấp hơn 75." },
      }),
    ),
  );
  user = await setField("Số ngày giữ clip", "100");
  await user.click(screen.getByRole("button", { name: "Lưu" }));
  expect(await screen.findByText("Số ngày giữ clip không được thấp hơn 75.")).toBeInTheDocument();
});

test("TC-02.38 (UI): 90 → 70 → Dialog 'Giảm thời gian lưu?' (API-82: 312 clip, 02:00) → Giảm và lưu; Hủy không lưu", async () => {
  renderApp("/admin/settings/storage");
  const user = await setField("Số ngày giữ clip", "70");
  await user.click(screen.getByRole("button", { name: "Lưu" }));
  let dialog = await screen.findByRole("dialog", { name: "Giảm thời gian lưu?" });
  expect(
    await within(dialog).findByText(
      "Lần dọn tự động lúc 02:00 sẽ xóa 312 clip (≈ 51,5 GB) và 0 giờ video thô.",
    ),
  ).toBeInTheDocument();
  expect(within(dialog).getByText(/Clip gắn hồ sơ khiếu nại đang mở không bị xóa\./)).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Hủy" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(mockSettings.retention_clip_days).toBe(90);

  await user.click(screen.getByRole("button", { name: "Lưu" }));
  dialog = await screen.findByRole("dialog", { name: "Giảm thời gian lưu?" });
  await within(dialog).findByText(/sẽ xóa 312 clip/);
  await user.click(within(dialog).getByRole("button", { name: "Giảm và lưu" }));
  expect(await screen.findByText("Đã lưu.")).toBeInTheDocument();
  expect(mockSettings.retention_clip_days).toBe(70);
});

test("TC-02.39 (UI): máy chủ trả 409 RETENTION_REDUCTION_UNCONFIRMED → Dialog dùng details.impact → gửi lại confirm_reduction", async () => {
  renderApp("/admin/settings/storage");
  await screen.findByLabelText("Số ngày giữ clip");
  // Người khác vừa nâng lên 150 → FE (còn 90) thấy 100 là tăng, máy chủ thấy là giảm.
  mockSettings.retention_clip_days = 150;
  const user = await setField("Số ngày giữ clip", "100");
  await user.click(screen.getByRole("button", { name: "Lưu" }));
  const dialog = await screen.findByRole("dialog", { name: "Giảm thời gian lưu?" });
  expect(within(dialog).getByText(/sẽ xóa 762 clip/)).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Giảm và lưu" }));
  expect(await screen.findByText("Đã lưu.")).toBeInTheDocument();
  expect(mockSettings.retention_clip_days).toBe(100);
});

test("D8 Dialog: API-82 lỗi → 'Không tính được số clip bị ảnh hưởng. Thử lại.', khóa Giảm và lưu", async () => {
  const { server } = await import("@/test/server");
  const { http } = await import("msw");
  const { apiError } = await import("@/mocks/http");
  server.use(http.get("/api/v1/settings/retention-impact", () => apiError(500, "INTERNAL", "Lỗi")));
  renderApp("/admin/settings/storage");
  const user = await setField("Số ngày giữ video thô", "20");
  await user.click(screen.getByRole("button", { name: "Lưu" }));
  const dialog = await screen.findByRole("dialog", { name: "Giảm thời gian lưu?" });
  expect(
    await within(dialog).findByText("Không tính được số clip bị ảnh hưởng. Thử lại."),
  ).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Giảm và lưu" })).toBeDisabled();
});

test("FR-02.10: 6 ngưỡng mới — hiện giá trị, kiểm khoảng / tự đóng > cảnh báo, lưu gửi đủ trường", async () => {
  renderApp("/admin/settings/storage");
  expect(await screen.findByLabelText("Hàng hoàn chưa về sau (ngày)")).toHaveValue("7");
  expect(screen.getByLabelText("Kiện đóng xong chưa bàn giao sau (giờ)")).toHaveValue("24");
  expect(screen.getByLabelText("Hạn khiếu nại mặc định (ngày)")).toHaveValue("7");
  expect(screen.getByLabelText("Báo sắp hết hạn trước (giờ)")).toHaveValue("48");
  expect(screen.getByLabelText("Phiên hoàn: cảnh báo sau (phút)")).toHaveValue("20");
  expect(screen.getByLabelText("Phiên hoàn: tự đóng sau (phút)")).toHaveValue("45");

  await setField("Hàng hoàn chưa về sau (ngày)", "61");
  let user = await setField("Phiên hoàn: tự đóng sau (phút)", "20");
  await user.click(screen.getByRole("button", { name: "Lưu" }));
  expect(await screen.findByText("Nhập số từ 1 đến 60.")).toBeInTheDocument();
  expect(screen.getByText("Thời gian tự đóng phải lớn hơn thời gian cảnh báo.")).toBeInTheDocument();

  await setField("Hàng hoàn chưa về sau (ngày)", "10");
  user = await setField("Phiên hoàn: tự đóng sau (phút)", "60");
  await user.click(screen.getByRole("button", { name: "Lưu" }));
  expect(await screen.findByText("Đã lưu.")).toBeInTheDocument();
  expect(mockSettings).toMatchObject({ return_missing_days: 10, return_abandon_minutes: 60 });
});
