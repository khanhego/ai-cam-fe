import { expect, test } from "@playwright/test";

test("app khởi động và hiện khu vực admin", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Hệ thống X" })).toBeVisible();
});
