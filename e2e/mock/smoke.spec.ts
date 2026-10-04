import { expect, test } from "@playwright/test";

test("app khởi động: chưa đăng nhập vào / → màn đăng nhập dashboard", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();
});
