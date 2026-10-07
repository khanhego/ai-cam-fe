/**
 * Item 03 M14 trên MSW (02b-admin §13 E2E mock `reports.spec.ts`, UC-15): D20 Báo cáo — drawer → tab Hàng hoàn số BR-41,
 * bấm số → D14 đã lọc, tab Khiếu nại + Xuất CSV (tải file), quyền tab Năng suất theo vai.
 * MSW giữ dữ liệu trong bộ nhớ trang → sau đăng nhập điều hướng trong app (`pushState`), không `goto`.
 */
import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.E2E_SHOTS_DIR;
const shot = (page: Page, name: string) =>
  SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }) : Promise.resolve();

async function adminLogin(page: Page, user: string) {
  await page.goto("/admin/login");
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

test("D20 (T-254 / T-255): CSKH — Hàng hoàn đúng số, bấm 'Có vấn đề' → D14, Khiếu nại + Xuất CSV, không có Năng suất", async ({
  page,
}) => {
  await adminLogin(page, "tst_cskh");
  await page.getByRole("link", { name: "Báo cáo" }).click();
  await expect(page.getByRole("heading", { name: "Báo cáo" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Tỷ lệ hoàn: 4,0%, 40 \/ 1\.000 kiện/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Năng suất" })).toHaveCount(0);
  await page.getByRole("button", { name: "Công thức: Tỷ lệ hoàn" }).click();
  await expect(page.getByRole("tooltip")).toContainText("Tỷ lệ hoàn = hồ sơ hàng hoàn");
  await shot(page, "d20-returns");

  await page.getByRole("link", { name: /^Có vấn đề: 20,0%/ }).click();
  await expect(page).toHaveURL(/\/admin\/returns\?tab=RECEIVED&from=\d{4}-\d{2}-\d{2}&to=/);
  await expect(page.getByRole("heading", { name: "Hàng hoàn" })).toBeVisible();

  await go(page, "/admin/reports?tab=productivity");
  await expect(page.getByText("Bạn không có quyền xem báo cáo năng suất.")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Hàng hoàn" })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("tab", { name: "Khiếu nại" }).click();
  await expect(page.getByRole("link", { name: /^Tỷ lệ thắng: 75,0%/ })).toBeVisible();
  await expect(page.getByText("2.350.000 đ").first()).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Xuất CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^bao-cao-khieu-nai-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/,
  );
  await expect(page.getByText("Đã tải file CSV.")).toBeVisible();
  await shot(page, "d20-claims");
});

test("D20: Admin — tab Năng suất, validate kỳ khóa Xem, mobile cuộn ngang", async ({ page }) => {
  await adminLogin(page, "tst_admin");
  await go(page, "/admin/reports?tab=productivity");
  await expect(page.getByRole("link", { name: /^Kiện đã đóng gói: 1\.234/ })).toBeVisible();
  await expect(page.getByText("1 phút 30 giây")).toBeVisible();
  const ops = page.getByRole("table", { name: "Theo người đứng bàn" });
  await expect(ops.getByRole("rowheader").last()).toHaveText("(Không ghi tên)");

  await page.getByLabel("Từ ngày").fill("2026-12-31");
  await expect(page.getByText("Ngày đến phải sau ngày từ.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Xem" })).toBeDisabled();
  await shot(page, "d20-productivity");

  await page.setViewportSize({ width: 375, height: 800 });
  await expect(page.getByRole("table", { name: "Theo station" })).toBeVisible();
  await shot(page, "d20-mobile");
});
