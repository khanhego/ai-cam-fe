/**
 * Item 03 M12 trên MSW (02b-admin §13 / 02b-station §13 E2E mock): D17 đánh dấu quét nhầm + bỏ bằng chứng có lý do
 * (T-260 / T-264), D13 hủy phiên mở hoàn có lý do (T-264), R2 luật hủy 60 giây (T-234), ShareLinkDialog (T-256).
 * MSW giữ dữ liệu trong bộ nhớ trang → sau đăng nhập điều hướng trong app (`pushState`), không `goto`.
 */
import { expect, test, type Page } from "@playwright/test";

import { hidScan } from "../real/helpers";

const SHOTS = process.env.E2E_SHOTS_DIR;
const shot = (page: Page, name: string) =>
  SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }) : Promise.resolve();

async function adminLogin(page: Page, user: string, query = "") {
  await page.goto(`/admin/login${query}`);
  await page.getByLabel("Tên đăng nhập").fill(user);
  await page.getByLabel("Mật khẩu").fill("matkhau123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
}
async function go(page: Page, path: string) {
  await page.evaluate((p) => {
    history.pushState({}, "", p);
    dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

test("D17 (T-260 / T-264): đánh dấu quét nhầm phiên chính, bỏ bằng chứng có lý do, Thêm lại; Tạo link chia sẻ (T-256)", async ({
  page,
}) => {
  await adminLogin(page, "tst_cskh");
  await go(page, "/admin/claims/cl-000141");
  await expect(
    page.getByText(
      /^Kiện có 1 phiên mở hoàn trước \(bỏ dở .* 08:51\) — đã đưa vào bằng chứng, là phiên chính\.$/,
    ),
  ).toBeVisible();
  await expect(page.getByText("Hạn sàn đã qua")).toBeVisible();
  await shot(page, "d17-before");

  await page.getByRole("button", { name: /^Thao tác Phiên mở hoàn .* 08:51$/ }).click();
  await page.getByRole("menuitem", { name: "Đánh dấu quét nhầm" }).click();
  const mark = page.getByRole("dialog", { name: "Đánh dấu phiên quét nhầm?" });
  await mark.getByRole("button", { name: "Đánh dấu" }).click();
  await expect(mark.getByText("Chọn lý do.")).toBeVisible();
  await mark.getByRole("radio", { name: "Quét nhầm kiện khác" }).check();
  await mark.getByLabel(/^Ghi chú/).fill("Video là kiện bên cạnh");
  await mark.getByRole("button", { name: "Đánh dấu" }).click();
  await expect(page.getByText("Đã đánh dấu phiên quét nhầm.")).toBeVisible();
  await expect(page.getByText("Bằng chứng đã bỏ (1)")).toBeVisible();

  await page.getByRole("button", { name: /^Bỏ Phiên đóng gói / }).click();
  const remove = page.getByRole("dialog", { name: "Bỏ bằng chứng?" });
  await expect(remove.getByText(/^Clip và ảnh của phiên này được giữ tới \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
  await remove.getByRole("button", { name: "Bỏ bằng chứng" }).click();
  await expect(remove.getByText("Nhập lý do bỏ bằng chứng (5–500 ký tự).")).toBeVisible();
  await remove.getByLabel(/^Lý do/).fill("Không liên quan khiếu nại hộp rỗng");
  await remove.getByRole("button", { name: "Bỏ bằng chứng" }).click();
  await expect(page.getByText("Bằng chứng đã bỏ (2)")).toBeVisible();
  await page.getByText("Bằng chứng đã bỏ (2)").click();
  await shot(page, "d17-after-remove");
  await page.getByRole("button", { name: /^Thêm lại Phiên đóng gói/ }).click();
  await expect(page.getByText("Bằng chứng đã bỏ (1)")).toBeVisible();

  await page.getByRole("button", { name: "Tạo link chia sẻ" }).click();
  const share = page.getByRole("dialog", { name: "Tạo link chia sẻ bằng chứng" });
  await expect(share.getByText(/^Hồ sơ còn 1 phiên mở hoàn Cần soát/)).toBeVisible();
  await share.getByLabel(/^Gửi cho/).fill("CSKH Shopee – phiếu 98765");
  await share.getByRole("button", { name: "Tạo link" }).click();
  await expect(page.getByText("Link đã sẵn sàng")).toBeVisible({ timeout: 20_000 });
  await shot(page, "share-ready");
});

test("D13 (T-264): Hủy phiên mở hoàn có lý do + ghi chú", async ({ page }) => {
  await adminLogin(page, "tst_sup", "?returnApproval=1");
  await go(page, "/admin/approvals");
  const card = page.locator("article", { has: page.getByText("SPXRTTST000045") });
  await expect(card.getByText(/^Đã có kết luận: Hộp rỗng · 3 ảnh · mở \d+ phút$/)).toBeVisible();
  await card.getByRole("button", { name: "Hủy phiên" }).click();
  const dialog = page.getByRole("dialog", { name: "Hủy phiên mở hoàn?" });
  const confirm = dialog.getByRole("button", { name: "Hủy phiên" });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("radio", { name: "Không phải kiện hàng hoàn" }).check();
  await expect(
    dialog.getByText("Video phiên này vẫn được giữ nhưng không tự vào hồ sơ khiếu nại của kiện."),
  ).toBeVisible();
  await dialog.getByLabel(/^Ghi chú/).fill("Kiện đi giao, không phải hàng hoàn");
  await shot(page, "d13-cancel-return");
  await confirm.click();
  await expect(page.getByText("Đã hủy phiên.")).toBeVisible();
  await expect(page.getByText("SPXRTTST000045")).toHaveCount(0);
});

test("R2 (T-234): trong 60 giây có Hủy phiên; qua giây 61 (giờ server) chỉ còn Gọi quản lý, không tải lại", async ({
  page,
}) => {
  await page.goto("/station/login");
  await page.getByLabel("Tài khoản station").fill("tst_station01");
  await page.getByLabel("Mật khẩu").fill("matkhau123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await page.getByRole("button", { name: "Chuyển sang nhận hàng hoàn" }).click();
  const r5 = page.getByRole("dialog", { name: "Người kiểm" });
  await r5.getByLabel("Tên người kiểm").fill("Lan QA");
  await r5.getByRole("button", { name: "Bắt đầu ca" }).click();
  await expect(page.getByRole("heading", { name: "SẴN SÀNG NHẬN HÀNG HOÀN" })).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await hidScan(page, "SPXRTTST000041");
  await expect(page.getByRole("heading", { name: "ĐANG KIỂM HÀNG HOÀN" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hủy phiên" })).toBeVisible();
  await shot(page, "r2-within-60s");

  await page.clock.install();
  await page.clock.fastForward(61_000);
  await expect(page.getByText("Muốn hủy phiên? Bấm Gọi quản lý.")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole("button", { name: "Hủy phiên" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Gọi quản lý/ })).toBeVisible();
  await expect(
    page.locator("[aria-live=polite]", { hasText: "Đã quá 60 giây — hủy phiên cần quản lý" }),
  ).toHaveCount(1);
  await shot(page, "r2-after-60s");
});
