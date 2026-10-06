/** D8 Lưu trữ và ngưỡng trên MSW (T-161, FR-02.10, L2): sàn 60 ngày, hạ retention phải xác nhận, ngưỡng mới. TC-02.37, 02.38 (UI). */
import { expect, test } from "@playwright/test";

test("TC-02.37 / 02.38 (UI): clip 45 bị chặn; 90 → 70 → Dialog số clip bị xóa → Giảm và lưu; ngưỡng hàng hoàn lưu được", async ({
  page,
}) => {
  await page.goto("/admin/login");
  await page.getByLabel("Tên đăng nhập").fill("tst_admin");
  await page.getByLabel("Mật khẩu").fill("matkhau123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await page
    .getByRole("navigation", { name: "Điều hướng chính" })
    .getByRole("link", { name: "Lưu trữ video" })
    .click();

  await expect(page.getByText(/Tối thiểu 60 ngày \(cấu hình máy chủ\)\./)).toBeVisible();
  const clip = page.getByLabel("Số ngày giữ clip");
  await clip.fill("45");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Số ngày giữ clip không được thấp hơn 60.")).toBeVisible();

  await clip.fill("70");
  await page.getByRole("button", { name: "Lưu" }).click();
  const dialog = page.getByRole("dialog", { name: "Giảm thời gian lưu?" });
  await expect(
    dialog.getByText(/^Lần dọn tự động lúc 02:00 sẽ xóa 312 clip \(≈ .+ GB\) và 0 giờ video thô\.$/),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Giảm và lưu" }).click();
  await expect(page.getByText("Đã lưu.")).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(clip).toHaveValue("70");

  await page.getByLabel("Hàng hoàn chưa về sau (ngày)").fill("10");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã lưu.").first()).toBeVisible();
  await expect(page.getByLabel("Hàng hoàn chưa về sau (ngày)")).toHaveValue("10");
});
