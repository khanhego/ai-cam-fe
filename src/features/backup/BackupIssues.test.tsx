import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { login } from "@/lib/api/auth";
import { issue, mockBackup, OLD_FINGERPRINT } from "@/mocks/handlers/backup";
import { renderApp } from "@/test/render";

/**
 * D23 v0.2 / v0.3 (T-263; 01 §10.5 D23, EX-K6..K9, 02b-admin §3): khóa cũ + tải lại (API-187), xử lý từng tệp lệch mã
 * băm / không thấy tại kho (API-188), `RESTORE_PENDING`, `DISABLED`.
 */
async function open() {
  await login("tst_admin", "matkhau123", "DASHBOARD");
  renderApp("/admin/settings/backup");
  await screen.findByRole("button", { name: "Kiểm tra kết nối" });
  return userEvent.setup();
}

const OLD_ALERT = `812 tệp bằng chứng và 42 bản DB mã hóa bằng khóa ${OLD_FINGERPRINT} (cũ) — giữ khóa cũ để khôi phục được các bản này.`;

test("EX-K7: khóa cũ → Alert + Dialog (790 tệp, 136 GB) → Tải lại → Toast; Alert còn, hết nút; lịch sử '(khóa cũ)'", async () => {
  mockBackup.oldKeys = true;
  mockBackup.history.forEach((r, i) => (r.key_fingerprint = i > 10 ? OLD_FINGERPRINT : r.key_fingerprint));
  const user = await open();

  expect(screen.getByText(OLD_ALERT)).toBeInTheDocument();
  expect(
    within(screen.getByRole("table", { name: "Lịch sử 14 ngày" })).getAllByText("(khóa cũ)"),
  ).toHaveLength(3);

  await user.click(screen.getByRole("button", { name: "Tải lại bằng chứng bằng khóa mới" }));
  const dialog = await screen.findByRole("dialog", { name: "Tải lại bằng chứng bằng khóa mới?" });
  expect(dialog).toHaveTextContent(
    "Tải lại 790 tệp còn ở kho bằng khóa mới? Khoảng 136 GB, chạy nền theo giới hạn tốc độ.",
  );
  expect(dialog).toHaveTextContent(
    "Tệp đã bị xóa tại kho không tải lại được — vẫn cần khóa cũ để khôi phục.",
  );
  await user.click(within(dialog).getByRole("button", { name: "Tải lại" }));

  expect(await screen.findByText("Đã xếp 790 tệp vào hàng chờ.")).toBeInTheDocument();
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Tải lại bằng chứng bằng khóa mới" }),
    ).not.toBeInTheDocument(),
  );
  expect(screen.getByText(OLD_ALERT)).toBeInTheDocument();
  expect(
    screen.getByText("Không còn tệp nào ở kho để tải lại — vẫn cần khóa cũ để khôi phục các bản trên."),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole("region", { name: "Bằng chứng" })).getByText("793 tệp đang chờ"),
  ).toBeInTheDocument();
});

test("T-262 (02b §13 OldKeysAlert): `key.old_keys` rỗng → không Alert, không nút tải lại, lịch sử không '(khóa cũ)'", async () => {
  mockBackup.oldKeys = false;
  await open();
  expect(screen.queryByText(/mã hóa bằng khóa .* \(cũ\)/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Tải lại bằng chứng bằng khóa mới" })).not.toBeInTheDocument();
  expect(within(screen.getByRole("table", { name: "Lịch sử 14 ngày" })).queryByText("(khóa cũ)")).toBeNull();
});

test("EX-K7: khóa mới chưa xác nhận → chưa hiện Alert khóa cũ", async () => {
  mockBackup.oldKeys = true;
  mockBackup.confirmedFingerprint = OLD_FINGERPRINT;
  await open();
  expect(screen.queryByText(OLD_ALERT)).not.toBeInTheDocument();
});

test("G2R2-9: sao lưu tắt → 'Tải lại…' khóa + tooltip; tab cũ gọi được → 409 BACKUP_DISABLED → Toast", async () => {
  mockBackup.oldKeys = true;
  const user = await open();

  await user.click(screen.getByRole("button", { name: "Tải lại bằng chứng bằng khóa mới" }));
  const dialog = await screen.findByRole("dialog", { name: "Tải lại bằng chứng bằng khóa mới?" });
  mockBackup.enabled = false; // tab khác vừa tắt
  await user.click(within(dialog).getByRole("button", { name: "Tải lại" }));
  expect(await screen.findByText("Sao lưu đang tắt. Bật sao lưu rồi thử lại.")).toBeInTheDocument();

  const btn = await screen.findByRole("button", { name: "Tải lại bằng chứng bằng khóa mới" });
  await waitFor(() => expect(btn).toBeDisabled());
  expect(btn.parentElement).toHaveAttribute("title", "Sao lưu đang tắt. Bật sao lưu trước.");
  expect(screen.getByRole("button", { name: "Sao lưu DB ngay" }).parentElement).toHaveAttribute(
    "title",
    "Sao lưu đang tắt. Bật sao lưu trước.",
  );
});

test("EX-K8: RESTORE_PENDING → banner vàng, công tắc khóa, nút ghi khóa 'Sao lưu đang tạm dừng.'", async () => {
  mockBackup.restorePending = true;
  mockBackup.enabled = false;
  mockBackup.oldKeys = true;
  await open();

  expect(
    screen.getByText(
      "Hệ thống vừa được khôi phục. Sao lưu tạm dừng tới khi IT chạy lệnh kiểm khôi phục đạt (tài liệu vận hành, mục Khôi phục).",
    ),
  ).toBeInTheDocument();
  expect(screen.getByText("Chờ kiểm khôi phục")).toBeInTheDocument();
  const sw = screen.getByRole("switch", { name: "Bật sao lưu tự động" });
  expect(sw).toBeDisabled();
  expect(sw).not.toBeChecked();
  for (const name of ["Sao lưu DB ngay", "Tải lại bằng chứng bằng khóa mới"]) {
    const b = screen.getByRole("button", { name });
    expect(b).toBeDisabled();
    expect(b.parentElement).toHaveAttribute("title", "Sao lưu đang tạm dừng.");
  }
  expect(screen.getByRole("button", { name: "Kiểm tra kết nối" })).toBeEnabled();
});

test("EX-K6: Vẫn sao lưu (lý do 5–500) → Đã ghi nhận, Alert còn 1; Bỏ qua → hết Alert", async () => {
  const user = await open();

  await user.click(screen.getByRole("button", { name: "Xem danh sách" }));
  const list = await screen.findByRole("list", { name: "Danh sách tệp: Lệch mã băm" });
  await user.click(within(list).getByRole("button", { name: "Vẫn sao lưu — SPXTST0000004" }));
  let dialog = await screen.findByRole("dialog", { name: "Vẫn sao lưu bản hiện có?" });
  expect(dialog).toHaveTextContent("Bản trên cloud sẽ ghi chú lệch mã băm.");
  await user.type(within(dialog).getByLabelText("Lý do*"), "abc");
  await user.click(within(dialog).getByRole("button", { name: "Vẫn sao lưu" }));
  expect(within(dialog).getByText("Nhập lý do (5–500 ký tự).")).toBeInTheDocument();
  await user.type(within(dialog).getByLabelText("Lý do*"), " — đã xem tay video, đúng kiện");
  await user.click(within(dialog).getByRole("button", { name: "Vẫn sao lưu" }));

  expect(await screen.findByText("Đã ghi nhận.")).toBeInTheDocument();
  expect(await screen.findByText("1 clip có mã băm khác lúc tạo — không được sao lưu.")).toBeInTheDocument();
  expect(mockBackup.issues[0]!.resolution).toMatchObject({ action: "UPLOAD_ANYWAY" });

  const list2 = await screen.findByRole("list", { name: "Danh sách tệp: Lệch mã băm" });
  await waitFor(() => expect(within(list2).getAllByRole("listitem")).toHaveLength(1));
  await user.click(within(list2).getByRole("button", { name: "Bỏ qua — SPXTST0000005" }));
  dialog = await screen.findByRole("dialog", { name: "Bỏ qua tệp này?" });
  expect(dialog).toHaveTextContent("Tệp này sẽ không có bản sao ngoài kho.");
  expect(dialog).not.toHaveTextContent("Thiếu tệp");
  await user.type(within(dialog).getByLabelText("Lý do*"), "Clip hỏng do ổ lỗi");
  await user.click(within(dialog).getByRole("button", { name: "Bỏ qua" }));
  await waitFor(() => expect(screen.queryByText(/clip có mã băm khác lúc tạo/)).not.toBeInTheDocument());
});

test("API-188 409 BACKUP_ISSUE_RESOLVED (người khác vừa xử lý) → Toast message, đóng Dialog, tải lại", async () => {
  const user = await open();
  await user.click(screen.getByRole("button", { name: "Xem danh sách" }));
  const list = await screen.findByRole("list", { name: "Danh sách tệp: Lệch mã băm" });
  await user.click(within(list).getByRole("button", { name: "Bỏ qua — SPXTST0000004" }));
  const dialog = await screen.findByRole("dialog", { name: "Bỏ qua tệp này?" });
  mockBackup.issues[0]!.resolution = {
    action: "IGNORE",
    note: "khác",
    by: null,
    at: new Date().toISOString(),
  };
  await user.type(within(dialog).getByLabelText("Lý do*"), "Bỏ qua tệp hỏng");
  await user.click(within(dialog).getByRole("button", { name: "Bỏ qua" }));

  expect(await screen.findByText("Tệp này đã được xử lý. Tải lại danh sách.")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(await screen.findByText("1 clip có mã băm khác lúc tạo — không được sao lưu.")).toBeInTheDocument();
});

test("EX-K9: không thấy tệp tại kho → Alert + danh sách; Thử lại ngay → 'Đã xếp thử lại.'; Bỏ qua tệp đã có lại → 409", async () => {
  mockBackup.issues.push(issue(3, "SOURCE_MISSING", "SPXTST0000006"), {
    ...issue(4, "SOURCE_MISSING", "SPXTST0000007"),
    kind: "SNAPSHOT",
    sourceBack: true,
  });
  const user = await open();

  const alert = screen
    .getByText(
      "2 tệp bằng chứng không thấy trên ổ của máy chủ — chưa được sao lưu. Hệ thống tự thử lại mỗi giờ.",
    )
    .closest("[role=alert]") as HTMLElement;
  await user.click(within(alert).getByRole("button", { name: "Xem danh sách" }));
  const list = await screen.findByRole("list", { name: "Danh sách tệp: Không thấy tệp tại kho" });
  const rows = within(list).getAllByRole("listitem");
  expect(rows[1]).toHaveTextContent("Ảnh");
  expect(within(list).queryByRole("button", { name: /^Vẫn sao lưu/ })).not.toBeInTheDocument();

  await user.click(within(list).getByRole("button", { name: "Thử lại ngay — SPXTST0000006" }));
  let dialog = await screen.findByRole("dialog", { name: "Thử lại ngay?" });
  expect(dialog).toHaveTextContent("Dùng sau khi IT đã chép lại tệp vào máy chủ.");
  await user.type(within(dialog).getByLabelText("Lý do*"), "IT đã chép lại từ ổ cũ");
  await user.click(within(dialog).getByRole("button", { name: "Thử lại ngay" }));
  expect(await screen.findByText("Đã xếp thử lại.")).toBeInTheDocument();

  const list2 = await screen.findByRole("list", { name: "Danh sách tệp: Không thấy tệp tại kho" });
  await user.click(within(list2).getByRole("button", { name: "Bỏ qua — SPXTST0000007" }));
  dialog = await screen.findByRole("dialog", { name: "Bỏ qua tệp này?" });
  expect(dialog).toHaveTextContent(
    'Clip / ảnh này sẽ hiện "Thiếu tệp" ở mọi màn (không phát, không cắt lại, không vào link).',
  );
  await user.type(within(dialog).getByLabelText("Lý do*"), "Ổ hỏng, không còn bản");
  await user.click(within(dialog).getByRole("button", { name: "Bỏ qua" }));
  expect(await screen.findByText("Tệp đã có lại tại kho — bấm Thử lại ngay.")).toBeInTheDocument();
});
