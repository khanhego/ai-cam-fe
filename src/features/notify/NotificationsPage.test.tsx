/**
 * Item 03 T-258 — D22 Thông báo (01 §10.5 D22, §4.5 EX-N1 / EX-N2, FR-06.04, 06.07, 06.08, 06.10, UC-18; 02b-admin §3,
 * §5..§8): kênh + trạng thái, Alert loại chưa cấu hình, thêm / sửa (validate client + 422 / 409), gửi thử (Toast / Alert
 * dưới dòng 502 / 504), xóa có Dialog xác nhận, giờ yên lặng, nhật ký gửi (lọc ở URL), empty / error / forbidden.
 * Mock (`resetMockNotify`): Telegram đã cấu hình, Zalo OA chưa; Kho (OK), CSKH (Lỗi, target 502), Chủ shop (Tắt).
 */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { login } from "@/lib/api/auth";
import { mockNotify, TIMEOUT_TARGET } from "@/mocks/handlers/notify";
import { apiError } from "@/mocks/http";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

const PATH = "/admin/settings/notifications";

async function open(path = PATH) {
  await login("tst_admin", "matkhau123", "DASHBOARD");
  const router = renderApp(path);
  await screen.findByRole("heading", { level: 1, name: "Thông báo" });
  return router;
}
const channels = async () => within(await screen.findByRole("table", { name: "Kênh thông báo" }));
const row = (t: ReturnType<typeof within>, name: string) => within(t.getByTitle(name).closest("tr")!);
const log = async () => within(await screen.findByRole("table", { name: "Nhật ký gửi (30 ngày)" }));
const dialog = () => within(screen.getByRole("dialog"));

test("UC-18: kênh + trạng thái, Alert Zalo OA chưa cấu hình, giờ yên lặng, nhật ký, mục drawer 'Thông báo'", async () => {
  await open();
  const t = await channels();
  expect(t.getAllByRole("row")).toHaveLength(4);
  const kho = row(t, "Kho");
  expect(kho.getByText("Telegram")).toBeInTheDocument();
  expect(
    kho.getByText(
      "Camera mất tín hiệu, Lệch trạng thái mức Cao, Phiên mở hoàn bị hủy / bỏ dở, Yêu cầu duyệt chờ lâu",
    ),
  ).toBeInTheDocument();
  expect(kho.getByText(/^Gửi được \d{2}:\d{2}$/)).toBeInTheDocument();
  expect(
    // 02 §6.2 v0.5: `last_error.at` (hôm qua) → "Lỗi dd/mm HH:mm: …" (T-262).
    row(t, "CSKH").getByText(
      /^Lỗi \d{2}\/\d{2} \d{2}:\d{2}: Telegram không nhận Chat ID này\. Kiểm tra bot đã vào nhóm\.$/,
    ),
  ).toBeInTheDocument();
  expect(row(t, "Chủ shop").getByText("Tắt")).toBeInTheDocument();

  expect(screen.getByText("Chưa cấu hình Zalo OA trên máy chủ. Liên hệ IT.")).toBeInTheDocument();
  expect(screen.queryByText("Chưa cấu hình bot Telegram trên máy chủ. Liên hệ IT.")).toBeNull();
  expect(screen.getByText("Giờ yên lặng: 22:00 – 07:00 (chỉ gửi mức Cao)")).toBeInTheDocument();

  const l = await log();
  expect(l.getAllByRole("row")).toHaveLength(7);
  expect(l.getByText("Lệch trạng thái mức Cao (2 mục)")).toBeInTheDocument();
  expect(l.getByText("Lỗi · thử lại 2")).toBeInTheDocument();
  expect(l.getByText("Trùng, bỏ qua")).toBeInTheDocument();

  expect(screen.getByRole("link", { name: /^(notifications)?Thông báo$/ })).toHaveAttribute("href", PATH);
});

test("FR-06.04: Thêm kênh — Zalo OA khóa, validate client, trùng tên dưới ô, lưu → Toast + dòng mới", async () => {
  await open();
  const user = userEvent.setup();
  await channels();
  await user.click(screen.getByRole("button", { name: "Thêm kênh" }));
  const d = dialog();
  expect(d.getByRole("button", { name: "Zalo OA" })).toBeDisabled();
  expect(d.getByRole("button", { name: /Telegram/ })).toHaveAttribute("aria-pressed", "true");
  expect(d.getByText("Thêm bot vào nhóm, gửi /start, rồi dán Chat ID.")).toBeInTheDocument();
  expect(d.getByRole("switch", { name: "Bật" })).toBeChecked();

  await user.click(d.getByRole("button", { name: "Lưu" }));
  expect(d.getByText("Tên kênh 2–40 ký tự.")).toBeInTheDocument();
  expect(d.getByText("Chat ID là một số (nhóm thường bắt đầu bằng -100).")).toBeInTheDocument();
  expect(d.getByText("Chọn ít nhất 1 sự kiện.")).toBeInTheDocument();

  await user.type(d.getByLabelText("Tên kênh *"), "kho");
  await user.type(d.getByLabelText("Chat ID *"), "-100555");
  await user.click(d.getByRole("checkbox", { name: /Shop hết hạn ủy quyền/ }));
  expect(d.queryByText("Chọn ít nhất 1 sự kiện.")).toBeNull();
  await user.click(d.getByRole("button", { name: "Lưu" }));
  expect(await d.findByText("Đã có kênh tên này.")).toBeInTheDocument();

  await user.clear(d.getByLabelText("Tên kênh *"));
  await user.type(d.getByLabelText("Tên kênh *"), "Quản trị");
  await user.click(d.getByRole("button", { name: "Lưu" }));
  expect(await screen.findByText("Đã thêm kênh Quản trị.")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  const created = mockNotify.channels.find((c) => c.name === "Quản trị")!;
  expect(created).toMatchObject({ type: "TELEGRAM", target: "-100555", events: ["N06"], enabled: true });
  expect(row(await channels(), "Quản trị").getByText("Chưa gửi")).toBeInTheDocument();
});

test("EX-N1: 409 PROVIDER_NOT_CONFIGURED khi lưu → Alert trong dialog; không loại nào cấu hình → khóa Thêm kênh", async () => {
  server.use(
    http.post("/api/v1/notify/channels", () =>
      apiError(409, "PROVIDER_NOT_CONFIGURED", "Chưa cấu hình bot Telegram trên máy chủ. Liên hệ IT."),
    ),
  );
  await open();
  const user = userEvent.setup();
  await channels();
  await user.click(screen.getByRole("button", { name: "Thêm kênh" }));
  const d = dialog();
  await user.type(d.getByLabelText("Tên kênh *"), "Mới");
  await user.type(d.getByLabelText("Chat ID *"), "-100777");
  await user.click(d.getByRole("checkbox", { name: /Camera mất tín hiệu/ }));
  // Máy chủ vừa bỏ cấu hình bot (IT đổi env) → 409 → tải lại API-170: loại Telegram khóa trong dialog.
  mockNotify.providers = { TELEGRAM: { configured: false }, ZALO_OA: { configured: false } };
  await user.click(d.getByRole("button", { name: "Lưu" }));
  await waitFor(() => expect(d.getByRole("button", { name: /Telegram/ })).toBeDisabled());
  expect(d.getAllByText("Chưa cấu hình bot Telegram trên máy chủ. Liên hệ IT.")).toHaveLength(2);

  await user.click(d.getByRole("button", { name: "Hủy" }));
  expect(screen.getByRole("button", { name: "Thêm kênh" })).toBeDisabled();
  expect(screen.getAllByText("Chưa cấu hình bot Telegram trên máy chủ. Liên hệ IT.")).toHaveLength(1);
  expect(row(await channels(), "Kho").getByRole("button", { name: "Gửi thử kênh Kho" })).toBeDisabled();
});

test("FR-06.07: Sửa kênh — điền sẵn, PATCH chỉ trường đổi, Toast", async () => {
  let body: unknown;
  server.use(
    http.patch("/api/v1/notify/channels/:id", async ({ request }) => {
      body = await request.clone().json();
      return undefined;
    }),
  );
  await open();
  const user = userEvent.setup();
  await user.click(row(await channels(), "Kho").getByRole("button", { name: "Sửa kênh Kho" }));
  const d = dialog();
  expect(d.getByRole("heading", { name: "Sửa kênh" })).toBeInTheDocument();
  expect(d.getByLabelText("Chat ID *")).toHaveValue("-1001234567890");
  expect(d.getByRole("checkbox", { name: /Camera mất tín hiệu/ })).toBeChecked();
  await user.click(d.getByRole("checkbox", { name: /Tóm tắt ngày/ }));
  await user.click(d.getByRole("switch", { name: "Bật" }));
  await user.click(d.getByRole("button", { name: "Lưu" }));
  expect(await screen.findByText("Đã lưu kênh Kho.")).toBeInTheDocument();
  expect(body).toEqual({ events: ["N01", "N02", "N03", "N09", "N10"], enabled: false });
  expect(await row(await channels(), "Kho").findByText("Tắt")).toBeInTheDocument();
});

test("FR-06.10: Gửi thử — Toast khi được; 502 / 504 → Alert dưới dòng, bấm lại được", async () => {
  mockNotify.channels[2]!.enabled = true;
  mockNotify.channels[2]!.target = TIMEOUT_TARGET;
  await open();
  const user = userEvent.setup();
  const t = await channels();
  await user.click(row(t, "Kho").getByRole("button", { name: "Gửi thử kênh Kho" }));
  expect(await screen.findByText("Đã gửi tin thử tới Kho.")).toBeInTheDocument();

  await user.click(row(t, "CSKH").getByRole("button", { name: "Gửi thử kênh CSKH" }));
  expect(
    await t.findByText("Gửi thử lỗi: Telegram không nhận Chat ID này. Kiểm tra bot đã vào nhóm."),
  ).toBeInTheDocument();
  expect(row(t, "CSKH").getByRole("button", { name: "Gửi thử kênh CSKH" })).toBeEnabled();

  await user.click(row(t, "Chủ shop").getByRole("button", { name: "Gửi thử kênh Chủ shop" }));
  expect(
    await t.findByText("Gửi thử lỗi: Không kết nối được Telegram từ máy chủ (mạng chặn?)."),
  ).toBeInTheDocument();
  expect(
    await row(t, "Chủ shop").findByText(/^Lỗi \d{2}:\d{2}: Không kết nối được Telegram từ máy chủ/),
  ).toBeInTheDocument();
});

test("Xóa kênh: ⋮ → Dialog xác nhận (Hủy giữ) → Xóa → Toast, dòng mất, tin chờ của kênh 'Bị bỏ'", async () => {
  await open();
  const user = userEvent.setup();
  const t = await channels();
  await user.click(row(t, "CSKH").getByRole("button", { name: "Thao tác khác cho kênh CSKH" }));
  await user.click(screen.getByRole("menuitem", { name: "Xóa kênh" }));
  expect(dialog().getByRole("heading", { name: "Xóa kênh CSKH?" })).toBeInTheDocument();
  expect(dialog().getByText("Tin đang chờ của kênh này bị bỏ.")).toBeInTheDocument();
  await user.click(dialog().getByRole("button", { name: "Hủy" }));
  expect(mockNotify.channels).toHaveLength(3);

  await user.click(row(t, "CSKH").getByRole("button", { name: "Thao tác khác cho kênh CSKH" }));
  await user.click(screen.getByRole("menuitem", { name: "Xóa kênh" }));
  await user.click(dialog().getByRole("button", { name: "Xóa kênh" }));
  expect(await screen.findByText("Đã xóa kênh CSKH.")).toBeInTheDocument();
  await waitFor(() => expect(t.queryByTitle("CSKH")).toBeNull());
  expect(await (await log()).findAllByText("Bị bỏ")).toHaveLength(2);
});

test("FR-06.08: giờ yên lặng — trùng giờ báo lỗi; tắt → lưu, dòng 'tắt'", async () => {
  await open();
  const user = userEvent.setup();
  await channels();
  await user.click(screen.getByRole("button", { name: "Sửa giờ yên lặng" }));
  const d = dialog();
  expect(d.getByLabelText("Từ")).toHaveValue("22:00");
  await user.clear(d.getByLabelText("Đến"));
  await user.type(d.getByLabelText("Đến"), "22:00");
  await user.click(d.getByRole("button", { name: "Lưu" }));
  expect(d.getByText("Giờ kết thúc phải khác giờ bắt đầu.")).toBeInTheDocument();
  await user.clear(d.getByLabelText("Đến"));
  await user.type(d.getByLabelText("Đến"), "06:30");
  await user.click(d.getByRole("checkbox", { name: "Tắt giờ yên lặng" }));
  expect(d.getByLabelText("Từ")).toBeDisabled();
  await user.click(d.getByRole("button", { name: "Lưu" }));
  expect(await screen.findByText("Đã lưu giờ yên lặng.")).toBeInTheDocument();
  expect(screen.getByText("Giờ yên lặng: tắt (gửi mọi lúc)")).toBeInTheDocument();
  expect(mockNotify.quiet).toEqual({ enabled: false, start: "22:00", end: "06:30" });
});

test("Nhật ký gửi: lọc Kết quả / Kênh vào URL, xem nguyên văn tin, rỗng theo lọc → Xóa lọc", async () => {
  const router = await open();
  const user = userEvent.setup();
  await log();
  await user.selectOptions(screen.getByLabelText("Kết quả"), "RETRYING");
  await waitFor(() => expect(router.state.location.search).toBe("?status=RETRYING"));
  await waitFor(async () => expect((await log()).getAllByRole("row")).toHaveLength(2));
  const l = await log();
  expect(l.getByText("thử lại lúc", { exact: false })).toBeInTheDocument();
  expect(l.getByText(/\[CAO\] Hồ sơ khiếu nại sắp \/ quá hạn — 1 mục/)).toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText("Kênh"), "ch-kho");
  expect(await screen.findByText("Không có tin khớp bộ lọc.")).toBeInTheDocument();
  expect(router.state.location.search).toBe("?channel=ch-kho&status=RETRYING");
  await user.click(screen.getByRole("button", { name: "Xóa lọc" }));
  await waitFor(async () => expect((await log()).getAllByRole("row")).toHaveLength(7));
});

test("empty: chưa có kênh → EmptyState + Thêm kênh; nhật ký rỗng", async () => {
  mockNotify.channels = [];
  mockNotify.messages = [];
  await open();
  expect(await screen.findByText("Chưa có kênh thông báo.")).toBeInTheDocument();
  expect(screen.getByText("Thêm kênh để nhận cảnh báo quan trọng trên điện thoại.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Thêm kênh" })).toBeEnabled();
  expect(await screen.findByText("Chưa có tin nào trong 30 ngày.")).toBeInTheDocument();
});

test("error: lỗi tải → Alert + Thử lại", async () => {
  let fail = true;
  server.use(
    http.get("/api/v1/notify/channels", () => (fail ? apiError(500, "INTERNAL", "lỗi") : undefined)),
  );
  await open();
  const user = userEvent.setup();
  expect(await screen.findByText("Không tải được kênh thông báo.")).toBeInTheDocument();
  fail = false;
  await user.click(screen.getByRole("button", { name: "Thử lại" }));
  await channels();
});

test("Quyền: Supervisor / CSKH mở D22 → D12; không có mục drawer", async () => {
  for (const u of ["tst_sup", "tst_cskh"]) {
    await login(u, "matkhau123", "DASHBOARD");
    const router = renderApp(PATH);
    await waitFor(() => expect(router.state.location.pathname).toBe("/admin/forbidden"));
    expect(screen.queryByRole("link", { name: /^(notifications)?Thông báo$/ })).toBeNull();
    router.dispose();
  }
});
