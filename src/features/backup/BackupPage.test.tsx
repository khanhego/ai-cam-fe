import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { login } from "@/lib/api/auth";
import { FINGERPRINT, mockBackup, OLD_FINGERPRINT } from "@/mocks/handlers/backup";
import { renderApp } from "@/test/render";

import { parseUploadMbps } from "./rules";
import { fmtSize, fmtWhen, shortFp } from "./format";

/**
 * D23 Sao lưu cloud (T-259; 01 §10.5 D23, 02b-admin §3 / §13). Mock mặc định (`resetMockBackup`): `ON`, khóa đã xác
 * nhận, 14 lượt DB thành công, 2 tệp `HASH_MISMATCH`.
 */
const HOUR = 3_600_000;

async function asAdmin(ready = true) {
  await login("tst_admin", "matkhau123", "DASHBOARD");
  const router = renderApp("/admin/settings/backup");
  await screen.findByRole("heading", { level: 1, name: "Sao lưu cloud" });
  if (ready) await screen.findByRole("button", { name: "Kiểm tra kết nối" });
  return router;
}

test("UC-20 / FR-02.15: Đang bật — kho lưu, dấu vân tay, 3 thẻ, lịch sử 14 ngày, mục drawer 'Sao lưu'", async () => {
  await asAdmin();

  const head = await screen.findByRole("region", { name: "Sao lưu cloud" });
  expect(within(head).getByText("Đang bật")).toBeInTheDocument();
  expect(within(head).getByText("Kho lưu: s3.example.vn / aicam-backup")).toBeInTheDocument();
  expect(within(head).getByText(`Khóa giải mã: dấu vân tay ${FINGERPRINT}`)).toBeInTheDocument();
  expect(within(head).getByText(/^Đã xác nhận cất \d{2}\/\d{2}\/\d{4} \(Quản trị\)$/)).toBeInTheDocument();
  expect(within(head).getByRole("switch", { name: "Bật sao lưu tự động" })).toBeChecked();

  const db = screen.getByRole("region", { name: "Cơ sở dữ liệu" });
  expect(within(db).getByText(/ · 182 MB$/)).toBeInTheDocument();
  expect(within(db).getByText(/^Lần kế /)).toBeInTheDocument();
  const ev = screen.getByRole("region", { name: "Bằng chứng" });
  expect(within(ev).getByText("1.204 tệp đã sao lưu")).toBeInTheDocument();
  expect(within(ev).getByText("3 tệp đang chờ")).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Trên cloud" })).getByText("151 GB")).toBeInTheDocument();

  const table = screen.getByRole("table", { name: "Lịch sử 14 ngày" });
  expect(within(table).getAllByRole("row")).toHaveLength(15);
  expect(within(table).getAllByText("Thành công")).toHaveLength(14);
  expect(within(table).getAllByText(shortFp(FINGERPRINT))[0]).toHaveAttribute("title", FINGERPRINT);

  expect(screen.getByRole("link", { name: /^(cloud_upload)?Sao lưu$/ })).toHaveAttribute(
    "href",
    "/admin/settings/backup",
  );
});

test("EX-K1: chưa cấu hình → EmptyState hướng dẫn IT, không có nút", async () => {
  mockBackup.configured = false;
  await asAdmin(false);
  expect(await screen.findByText("Chưa cấu hình kho lưu cloud.")).toBeInTheDocument();
  expect(
    screen.getByText(
      "IT điền thông tin kho lưu và khóa sao lưu trong cấu hình máy chủ (xem tài liệu vận hành, mục Sao lưu cloud).",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Sao lưu DB ngay" })).not.toBeInTheDocument();
});

test("EX-K2 / FR-02.17: chưa xác nhận khóa → banner vàng → Dialog, tick mới bật được → Đang bật", async () => {
  mockBackup.confirmedFingerprint = null;
  const user = userEvent.setup();
  await asAdmin();

  expect(await screen.findByText("Sao lưu chưa bật: xác nhận đã cất khóa giải mã.")).toBeInTheDocument();
  expect(screen.getByText("Chưa xác nhận khóa")).toBeInTheDocument();
  expect(screen.queryByRole("switch", { name: "Bật sao lưu tự động" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sao lưu DB ngay" })).toBeDisabled();

  await user.click(screen.getByRole("button", { name: "Xác nhận" }));
  const dialog = await screen.findByRole("dialog", { name: "Đã cất khóa giải mã?" });
  expect(dialog).toHaveTextContent(
    `Nếu máy chủ hỏng mà không có khóa này, bản sao lưu trên cloud không mở được. Chép khóa trong cấu hình máy chủ ra nơi an toàn ngoài máy (két, trình quản lý mật khẩu). Dấu vân tay: ${FINGERPRINT}.`,
  );
  const submit = within(dialog).getByRole("button", { name: "Bật sao lưu" });
  expect(submit).toBeDisabled();
  await user.click(within(dialog).getByLabelText("Tôi đã cất bản sao khóa ở nơi an toàn ngoài máy chủ"));
  await user.click(submit);

  expect(await screen.findByText("Đã bật sao lưu cloud.")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByText("Đang bật")).toBeInTheDocument();
  expect(mockBackup.confirmedFingerprint).toBe(FINGERPRINT);
});

test("EX-K7: khóa đổi → banner đỏ; khóa đổi tiếp lúc xác nhận → 409 KEY_MISMATCH, Alert + dấu vân tay mới, bỏ tick", async () => {
  mockBackup.confirmedFingerprint = OLD_FINGERPRINT;
  const user = userEvent.setup();
  await asAdmin();

  expect(
    await screen.findByText(
      "Khóa sao lưu trên máy chủ đã đổi. Sao lưu tạm dừng tới khi xác nhận đã cất khóa mới.",
    ),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Xác nhận" }));
  const dialog = await screen.findByRole("dialog", { name: "Đã cất khóa giải mã?" });
  await user.click(within(dialog).getByRole("checkbox"));
  mockBackup.fingerprint = "AAAA-BBBB-CCCC-DDDD";
  await user.click(within(dialog).getByRole("button", { name: "Bật sao lưu" }));

  expect(
    await within(dialog).findByText("Khóa trên máy chủ vừa đổi — kiểm lại dấu vân tay."),
  ).toBeInTheDocument();
  await waitFor(() => expect(dialog).toHaveTextContent("Dấu vân tay: AAAA-BBBB-CCCC-DDDD."));
  expect(within(dialog).getByRole("checkbox")).not.toBeChecked();
  expect(within(dialog).getByRole("button", { name: "Bật sao lưu" })).toBeDisabled();
});

test("FR-02.17: Kiểm tra kết nối — Toast thành công; sai khóa truy cập / không kết nối → Alert", async () => {
  const user = userEvent.setup();
  await asAdmin();
  const btn = screen.getByRole("button", { name: "Kiểm tra kết nối" });

  await user.click(btn);
  expect(await screen.findByText("Kết nối kho lưu tốt (ghi, đọc, xóa thử thành công).")).toBeInTheDocument();

  mockBackup.nextTestError = { status: 502, code: "CLOUD_AUTH_FAILED", message: "AccessDenied" };
  await user.click(btn);
  expect(await screen.findByText("Kho lưu từ chối: sai khóa truy cập.")).toBeInTheDocument();

  mockBackup.nextTestError = { status: 504, code: "CLOUD_UNREACHABLE", message: "timeout" };
  await user.click(btn);
  expect(await screen.findByText("Không kết nối được kho lưu. Kiểm tra Internet.")).toBeInTheDocument();

  mockBackup.nextTestError = { status: 502, code: "CLOUD_ERROR", message: "Bucket đầy." };
  await user.click(btn);
  expect(await screen.findByText("Bucket đầy.")).toBeInTheDocument();
});

test("FR-02.15: Sao lưu DB ngay → Toast, lịch sử thêm lượt; 409 BACKUP_RUNNING → Toast", async () => {
  const user = userEvent.setup();
  await asAdmin();

  await user.click(screen.getByRole("button", { name: "Sao lưu DB ngay" }));
  expect(await screen.findByText("Đã bắt đầu sao lưu DB.")).toBeInTheDocument();
  await waitFor(() =>
    expect(within(screen.getByRole("table", { name: "Lịch sử 14 ngày" })).getAllByRole("row")).toHaveLength(
      16,
    ),
  );

  mockBackup.running = true;
  await user.click(screen.getByRole("button", { name: "Sao lưu DB ngay" }));
  expect(await screen.findByText("Đang sao lưu, thử lại sau.")).toBeInTheDocument();
});

test("Tắt sao lưu: Dialog nói rõ hệ quả → Đã tắt, 'Sao lưu DB ngay' khóa + tooltip; bật lại không cần Dialog", async () => {
  const user = userEvent.setup();
  await asAdmin();

  await user.click(screen.getByRole("switch", { name: "Bật sao lưu tự động" }));
  const dialog = await screen.findByRole("dialog", { name: "Tắt sao lưu cloud?" });
  expect(dialog).toHaveTextContent("Cơ sở dữ liệu và bằng chứng mới sẽ không được sao lưu tới khi bật lại.");
  await user.click(within(dialog).getByRole("button", { name: "Tắt sao lưu" }));

  expect(await screen.findByText("Đã tắt sao lưu cloud.")).toBeInTheDocument();
  expect(screen.getByText("Đã tắt")).toBeInTheDocument();
  const run = screen.getByRole("button", { name: "Sao lưu DB ngay" });
  expect(run).toBeDisabled();
  expect(run.parentElement).toHaveAttribute("title", "Sao lưu đang tắt. Bật sao lưu trước.");
  expect(mockBackup.enabled).toBe(false);

  await user.click(screen.getByRole("switch", { name: "Bật sao lưu tự động" }));
  expect(await screen.findByText("Đã bật sao lưu cloud.")).toBeInTheDocument();
  expect(mockBackup.enabled).toBe(true);
});

test("K5: DB trễ 27 giờ + 2 lượt liền lỗi → thẻ DB đỏ; lỗi gần nhất hiện", async () => {
  const now = Date.now();
  mockBackup.consecutiveFailures = 2;
  mockBackup.history = [
    {
      id: "f1",
      kind: "DB",
      started_at: new Date(now - HOUR).toISOString(),
      finished_at: new Date(now - HOUR).toISOString(),
      status: "FAILED",
      size_bytes: null,
      error: "Không kết nối được kho lưu.",
      key_fingerprint: FINGERPRINT,
    },
    {
      id: "s1",
      kind: "DB",
      started_at: new Date(now - 27.5 * HOUR).toISOString(),
      finished_at: new Date(now - 27.5 * HOUR).toISOString(),
      status: "SUCCESS",
      size_bytes: 190_840_832,
      error: null,
      key_fingerprint: FINGERPRINT,
    },
  ];
  await asAdmin();

  const db = screen.getByRole("region", { name: "Cơ sở dữ liệu" });
  expect(db).toHaveAttribute("data-danger", "true");
  expect(within(db).getByText("Chưa sao lưu được 27 giờ")).toBeInTheDocument();
  expect(within(db).getByText("2 lần sao lưu DB gần nhất không thành công")).toBeInTheDocument();
  expect(screen.getByText(/^Lỗi gần nhất \(.+\): Không kết nối được kho lưu\.$/)).toBeInTheDocument();
  expect(
    within(screen.getByRole("table", { name: "Lịch sử 14 ngày" })).getByText(
      "Lỗi: Không kết nối được kho lưu.",
    ),
  ).toBeInTheDocument();
});

test("EX-K6: Alert lệch mã băm → Xem danh sách → mã kiện link D4 + mã băm rút gọn", async () => {
  const user = userEvent.setup();
  await asAdmin();

  const alert = screen
    .getByText("2 clip có mã băm khác lúc tạo — không được sao lưu.")
    .closest("[role=alert]")!;
  await user.click(within(alert as HTMLElement).getByRole("button", { name: "Xem danh sách" }));
  const list = await screen.findByRole("list", { name: "Danh sách tệp: Lệch mã băm" });
  const items = within(list).getAllByRole("listitem");
  expect(items).toHaveLength(2);
  expect(within(items[0]!).getByRole("link", { name: /SPXTST0000004/ })).toHaveAttribute(
    "href",
    "/admin/packages/pkg-SPXTST0000004",
  );
  expect(items[0]).toHaveTextContent("Mã băm lúc tạo 3f9a…c21e · hiện tại 9b0e…77d2");
});

test("FR-02.18 (C) + Nâng cao: công tắc mọi clip đóng gói + ước tính; tốc độ tải 0 → lỗi, 20 → lưu", async () => {
  const user = userEvent.setup();
  await asAdmin();

  expect(screen.getByText("Ước tính thêm ≈ 30 GB / ngày tải lên.")).toBeInTheDocument();
  // L27: câu giải thích hệ quả mặc định, đọc kèm công tắc (aria-describedby).
  const scope = screen.getByText(
    "Mặc định chỉ sao lưu bằng chứng đang được giữ (hồ sơ hàng hoàn / khiếu nại). Mất máy kho thì clip " +
      "đóng gói của đơn đang giao hoặc mới giao chưa có hồ sơ sẽ mất. Bật tùy chọn này để sao lưu mọi clip " +
      "đóng gói (tốn dung lượng cloud hơn — xem ước tính).",
  );
  expect(screen.getByRole("switch", { name: "Sao lưu thêm mọi clip đóng gói" })).toHaveAttribute(
    "aria-describedby",
    expect.stringContaining(scope.id),
  );
  await user.click(screen.getByRole("switch", { name: "Sao lưu thêm mọi clip đóng gói" }));
  await waitFor(() => expect(mockBackup.allPackClips).toBe(true));
  expect(screen.getByRole("switch", { name: "Sao lưu thêm mọi clip đóng gói" })).toBeChecked();

  await user.click(screen.getByText("Nâng cao"));
  const mbps = screen.getByLabelText("Giới hạn tốc độ tải lên (Mbit/s)");
  expect(mbps).toHaveValue("10");
  expect(
    screen.getByText("Giảm khi Internet kho yếu để quét và xem camera không bị chậm."),
  ).toBeInTheDocument();
  await user.clear(mbps);
  await user.type(mbps, "0");
  await user.click(screen.getByRole("button", { name: "Lưu" }));
  expect(await screen.findByText("Nhập số từ 1 đến 1000.")).toBeInTheDocument();
  await user.clear(mbps);
  await user.type(mbps, "20");
  await user.click(screen.getByRole("button", { name: "Lưu" }));
  await waitFor(() => expect(mockBackup.uploadMbps).toBe(20));
});

test("Quyền: Supervisor / CSKH mở D23 → D12; không có mục drawer", async () => {
  for (const u of ["tst_sup", "tst_cskh"]) {
    await login(u, "matkhau123", "DASHBOARD");
    const router = renderApp("/admin/settings/backup");
    await waitFor(() => expect(router.state.location.pathname).toBe("/admin/forbidden"));
    expect(screen.queryByRole("link", { name: /^(cloud_upload)?Sao lưu$/ })).toBeNull();
    router.dispose();
  }
});

test("format: fmtSize bội 1024, fmtWhen hôm nay, parseUploadMbps", () => {
  expect(fmtSize(190_840_832)).toBe("182 MB");
  expect(fmtSize(162_135_113_728)).toBe("151 GB");
  expect(fmtSize(1536)).toBe("1,5 KB");
  expect(fmtSize(null)).toBe("—");
  expect(fmtWhen(new Date().toISOString())).toMatch(/^\d{2}:\d{2} hôm nay$/);
  expect(fmtWhen("2026-01-02T06:00:00Z", new Date("2026-10-07T06:00:00Z"))).toBe("02/01 13:00");
  expect(parseUploadMbps("10")).toBe(10);
  expect(parseUploadMbps("1000")).toBe(1000);
  expect(parseUploadMbps("1001")).toBeNull();
  expect(parseUploadMbps("1.5")).toBeNull();
  expect(parseUploadMbps("")).toBeNull();
});
