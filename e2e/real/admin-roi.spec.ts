/** TC-01.05 với BE thật: D6 → ảnh Cam 2 (API-63, camera giả) → kéo khung → Lưu vùng đọc mã (API-64). */
import { expect, test } from "@playwright/test";

import { loginAdmin, resetData } from "./helpers";

test.beforeEach(() => resetData());

test("TC-01.05: kéo khung x=0.2, y=0.2, w=0.6, h=0.6 trên ảnh Cam 2 → API-64 200, tải lại vẫn còn", async ({
  page,
}) => {
  await loginAdmin(page);
  await page.goto("/admin/settings/stations");
  await page.getByRole("button", { name: "Sửa TST Station 01" }).click();

  const section = page.getByRole("region", { name: "Vùng đọc mã Cam 2" });
  // API-63 chụp bằng FFmpeg từ RTSP (~2 giây lúc rảnh); khi máy dev chạy cùng encode bản xuất + vision có lần > 20 giây
  // (QA G4) → chờ tới 40 giây. Trên server kho chưa đo (chưa test — thiếu phần cứng).
  await expect(section.getByRole("img", { name: "Ảnh chụp Cam 2 để vẽ vùng đọc mã" })).toBeVisible({
    timeout: 40_000,
  });
  const surface = section.getByTestId("roi-surface");
  await surface.scrollIntoViewIfNeeded();
  const box = (await surface.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 5 });
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8, { steps: 5 });
  await page.mouse.up();

  const put = page.waitForResponse(
    (r) => r.request().method() === "PUT" && /\/cameras\/.+\/roi$/.test(r.url()),
  );
  await section.getByRole("button", { name: /Lưu vùng đọc mã/ }).click();
  const res = await put;
  expect(res.status()).toBe(200);
  const roi = ((await res.json()) as { roi: Record<string, number> }).roi;
  for (const [k, v] of Object.entries({ x: 0.2, y: 0.2, w: 0.6, h: 0.6 })) expect(roi[k]).toBeCloseTo(v, 2);
  await expect(page.getByText("Đã lưu vùng đọc mã.")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Khung: x 20% · y 20% · rộng 60% · cao 60%")).toBeVisible();
});

test("TC-01.06 (UI): khung quá nhỏ → nút Lưu bị khóa", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin/settings/stations");
  await page.getByRole("button", { name: "Sửa TST Station 01" }).click();

  const section = page.getByRole("region", { name: "Vùng đọc mã Cam 2" });
  // API-63 chụp bằng FFmpeg từ RTSP (~2 giây lúc rảnh); khi máy dev chạy cùng encode bản xuất + vision có lần > 20 giây
  // (QA G4) → chờ tới 40 giây. Trên server kho chưa đo (chưa test — thiếu phần cứng).
  await expect(section.getByRole("img", { name: "Ảnh chụp Cam 2 để vẽ vùng đọc mã" })).toBeVisible({
    timeout: 40_000,
  });
  const surface = section.getByTestId("roi-surface");
  await surface.scrollIntoViewIfNeeded();
  const box = (await surface.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.23, box.y + box.height * 0.8, { steps: 3 });
  await page.mouse.up();

  await expect(section.getByText("Khung phải rộng và cao ít nhất 5% ảnh.")).toBeVisible();
  await expect(section.getByRole("button", { name: /Lưu vùng đọc mã/ })).toBeDisabled();
});
