/**
 * Item 03 T-256 — ShareLinkDialog (01 §10.5 "ShareLinkDialog", FR-07.05, UC-16; 02b-admin §5 / §6 / §8; DEC-487, 531):
 * validate, tạo → tiến độ (poll API-162) → link + sao chép; lỗi tải lên + Thử lại; chạy nền + Toast; kho chưa cấu hình;
 * 409 SESSION_CLIP_UNAVAILABLE; nguồn phiên ở D4; Alert "Cần soát" / "Chưa chọn video mở hộp", chip "Cần soát".
 */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { login } from "@/lib/api/auth";
import { apiError } from "@/mocks/http";
import { P3_CLAIM_ID } from "@/mocks/returnsDb";
import { mockCloud, mockShares } from "@/mocks/sharesDb";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import { sharePoll } from "./shareProgress";

beforeEach(async () => {
  sharePoll.ms = 20;
  await login("tst_cskh", "matkhau123", "DASHBOARD");
});
afterAll(() => {
  sharePoll.ms = 2000;
});

async function openFromClaim() {
  const user = userEvent.setup();
  renderApp(`/admin/claims/${P3_CLAIM_ID}`);
  await user.click(await screen.findByRole("button", { name: "Tạo link chia sẻ" }));
  const dialog = await screen.findByRole("dialog", { name: "Tạo link chia sẻ bằng chứng" });
  await within(dialog).findByText(/^Phiên gửi kèm/);
  return { user, dialog };
}
const checkbox = (dialog: HTMLElement, re: RegExp) => within(dialog).getByRole("checkbox", { name: re });

test("mặc định từ D17: phiên tự chọn (chính trước), phiên 'Cần soát' không chọn sẵn + Alert; nút khóa tới khi đủ", async () => {
  const { user, dialog } = await openFromClaim();
  expect(within(dialog).getByText("Hồ sơ KN-000141 · Kiện SPXTST0000060")).toBeInTheDocument();
  expect(
    within(dialog).getByText(
      "Hồ sơ còn 1 phiên mở hoàn Cần soát chưa xử lý — xem ở chi tiết hồ sơ trước khi gửi link.",
    ),
  ).toBeInTheDocument();
  const boxes = within(dialog).getAllByRole("checkbox", { name: /^(Đóng gói|Mở hoàn) ·/ });
  expect(boxes[0]).toHaveAccessibleName(/^Mở hoàn · .* · Bỏ dở · phiên trước · /);
  expect(boxes[0]).toBeChecked();
  const review = boxes.find((b) => b.closest("label")!.textContent!.includes("Cần soát"))!;
  expect(review).not.toBeChecked();
  expect(checkbox(dialog, /^Đóng gói/)).toBeChecked();
  expect(within(dialog).getByRole("radio", { name: "Ghép Cam 1 + Cam 2" })).toBeChecked();
  expect(within(dialog).getByRole("checkbox", { name: "Kèm ảnh (2)" })).toBeChecked();
  expect(within(dialog).getByRole("radio", { name: "7 ngày" })).toBeChecked();
  expect(within(dialog).getByText(/^Video Cam 2 có thể thấy nhãn vận đơn/)).toBeInTheDocument();

  const create = within(dialog).getByRole("button", { name: "Tạo link" });
  expect(create).toBeDisabled();
  await user.type(within(dialog).getByLabelText(/^Gửi cho/), "AB");
  await user.tab();
  expect(within(dialog).getByText("Ghi rõ gửi cho ai (3–100 ký tự).")).toBeInTheDocument();
  expect(create).toBeDisabled();
  await user.type(within(dialog).getByLabelText(/^Gửi cho/), "C");
  expect(create).toBeEnabled();

  // Bỏ hết phiên mở hoàn → Alert "Chưa chọn video mở hộp" (không chặn); bỏ hết → "Chọn ít nhất 1 phiên."
  for (const b of within(dialog).getAllByRole("checkbox", { name: /^Mở hoàn/ }))
    if ((b as HTMLInputElement).checked) await user.click(b);
  expect(
    within(dialog).getByText("Chưa chọn video mở hộp nào — link chỉ có video đóng gói."),
  ).toBeInTheDocument();
  expect(create).toBeEnabled();
  await user.click(checkbox(dialog, /^Đóng gói/));
  expect(within(dialog).getByText("Chọn ít nhất 1 phiên.")).toBeInTheDocument();
  expect(create).toBeDisabled();
});

test("UC-16: tạo link → tiến độ → 'Link đã sẵn sàng' + Sao chép (Toast) + hạn + gửi cho", async () => {
  const { user, dialog } = await openFromClaim();
  await user.type(within(dialog).getByLabelText(/^Gửi cho/), "CSKH Shopee – phiếu 98765");
  await user.click(within(dialog).getByRole("radio", { name: "3 ngày" }));
  await user.click(within(dialog).getByRole("button", { name: "Tạo link" }));

  const d2 = await screen.findByRole("dialog", { name: "Tạo link chia sẻ bằng chứng" });
  expect(await within(d2).findByText("Link đã sẵn sàng")).toBeInTheDocument();
  const link = within(d2).getByLabelText("Link chia sẻ") as HTMLInputElement;
  expect(link).toHaveAttribute("readonly");
  expect(link.value).toMatch(/^https?:\/\//);
  expect(within(d2).getByText("Gửi cho: CSKH Shopee – phiếu 98765")).toBeInTheDocument();
  expect(within(d2).getByText(/^Hết hạn \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)).toBeInTheDocument();
  await user.click(within(d2).getByRole("button", { name: "Sao chép link" }));
  // userEvent.setup() thay `navigator.clipboard` bằng bản giả của nó → đọc lại.
  expect(await navigator.clipboard.readText()).toBe(link.value);
  expect(await screen.findAllByText("Đã sao chép link.")).not.toHaveLength(0);
  const created = mockShares.find((x) => x.recipient === "CSKH Shopee – phiếu 98765")!;
  expect(created).toMatchObject({ layout: "SIDE_BY_SIDE", status: "ACTIVE" });
});

test("lỗi tải lên → Alert + Thử lại → tạo lại thành công", async () => {
  mockCloud.failUpload = true;
  const { user, dialog } = await openFromClaim();
  await user.type(within(dialog).getByLabelText(/^Gửi cho/), "ĐVVC SPX");
  await user.click(within(dialog).getByRole("button", { name: "Tạo link" }));
  const d2 = await screen.findByRole("dialog", { name: "Tạo link chia sẻ bằng chứng" });
  expect(
    await within(d2).findByText("Không tải được lên kho lưu cloud. Kiểm tra Internet rồi bấm Thử lại."),
  ).toBeInTheDocument();
  mockCloud.failUpload = false;
  await user.click(within(d2).getByRole("button", { name: "Thử lại" }));
  expect(await within(screen.getByRole("dialog")).findByText("Link đã sẵn sàng")).toBeInTheDocument();
});

test("đóng khi đang tạo → chạy nền, Toast khi xong", async () => {
  sharePoll.ms = 200;
  const { user, dialog } = await openFromClaim();
  await user.type(within(dialog).getByLabelText(/^Gửi cho/), "CSKH Shopee");
  await user.click(within(dialog).getByRole("button", { name: "Tạo link" }));
  const d2 = await screen.findByRole("dialog", { name: "Tạo link chia sẻ bằng chứng" });
  expect(within(d2).getByRole("progressbar", { name: "Tiến độ tạo link" })).toBeInTheDocument();
  await user.click(within(d2).getByRole("button", { name: "Đóng" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    await screen.findByText('Link chia sẻ cho "CSKH Shopee" đã sẵn sàng.', {}, { timeout: 5000 }),
  ).toBeInTheDocument();
});

test("kho lưu chưa cấu hình → Alert + nút Tạo link khóa", async () => {
  mockCloud.configured = false;
  const { user, dialog } = await openFromClaim();
  expect(
    within(dialog).getByText("Chưa cấu hình kho lưu cloud. Admin: Cài đặt → Sao lưu."),
  ).toBeInTheDocument();
  await user.type(within(dialog).getByLabelText(/^Gửi cho/), "CSKH Shopee");
  expect(within(dialog).getByRole("button", { name: "Tạo link" })).toBeDisabled();
});

test("409 SESSION_CLIP_UNAVAILABLE → Toast + tải lại danh sách; 422 fields.recipient dưới ô", async () => {
  let calls = 0;
  server.use(
    http.post("/api/v1/shares", () => {
      calls += 1;
      return calls === 1
        ? apiError(409, "SESSION_CLIP_UNAVAILABLE", "Phiên vừa mất clip — chọn lại phiên.", {
            session_id: "x",
          })
        : apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", {
            fields: { recipient: "Gửi cho không hợp lệ (server)." },
          });
    }),
  );
  const { user, dialog } = await openFromClaim();
  await user.type(within(dialog).getByLabelText(/^Gửi cho/), "CSKH Shopee");
  await user.click(within(dialog).getByRole("button", { name: "Tạo link" }));
  expect(await screen.findByText("Phiên vừa mất clip — chọn lại phiên.")).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Tạo link" }));
  expect(await within(dialog).findByText("Gửi cho không hợp lệ (server).")).toBeInTheDocument();
});

test("D4: 'Tạo link chia sẻ' trên phiên có clip → nguồn phiên, phiên đó chọn sẵn", async () => {
  const user = userEvent.setup();
  renderApp("/admin/packages/pkg-SPXTSTB000000001");
  await user.click(await screen.findByRole("button", { name: "Tạo link chia sẻ" }));
  const dialog = await screen.findByRole("dialog", { name: "Tạo link chia sẻ bằng chứng" });
  expect(await within(dialog).findByText("Kiện SPXTSTB000000001")).toBeInTheDocument();
  const boxes = within(dialog).getAllByRole("checkbox", { name: /^Đóng gói/ });
  expect(boxes).toHaveLength(1);
  expect(boxes[0]).toBeChecked();
  expect(within(dialog).queryByText(/Chưa chọn video mở hộp/)).toBeNull();
});

test("API-164 404 → Toast, đóng dialog", async () => {
  server.use(
    http.get("/api/v1/shares/options", () => apiError(404, "NOT_FOUND", "Không tìm thấy hồ sơ / phiên.")),
  );
  const user = userEvent.setup();
  renderApp(`/admin/claims/${P3_CLAIM_ID}`);
  await user.click(await screen.findByRole("button", { name: "Tạo link chia sẻ" }));
  expect(await screen.findByText("Không tìm thấy hồ sơ / phiên.")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
