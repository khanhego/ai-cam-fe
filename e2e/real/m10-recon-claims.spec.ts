/**
 * M10 (T-162) — D15 đối soát + D17 hồ sơ khiếu nại trên BE thật với dữ liệu `seed-demo` (T-116, DEC-333): seed đã chạy
 * J-14 → `…49` "Hàng hoàn quá 7 ngày chưa về" (Cao) + `…52` "Đã đóng gói chưa giao ĐVVC"; hồ sơ khiếu nại mẫu ĐVVC
 * `KN-000001` (Thất lạc, kiện 49). Không cần Shopee / tua giờ (khác `m9-recon.spec.ts`).
 * - TC-06.02 / TC-09.21 (UI): D2 "Quá hạn chưa về: 1" + Cần xử lý; D15 lọc Cao → dòng 49.
 * - TC-06.13: "Điều chỉnh trạng thái kho" cảnh báo 52 → Đã bàn giao (API-122) → kiện `HANDED_OVER`, cảnh báo Đã xử lý.
 * - TC-06.12: "Đánh dấu đã xử lý" cảnh báo 49 (API-121).
 * - TC-08.01 + AC-37: D17 đi đủ Mới → Đã gửi → Đang chờ → Thắng → Đóng; VERSION_CONFLICT ở tab thứ hai (WS bị chặn
 *   để giữ bản cũ) → toast "Hồ sơ vừa được … cập nhật. Đã tải lại." và tab đó hiện bản mới.
 * - UC-12 / AC-25: gói bằng chứng hồ sơ đã đóng → tải zip → mọi tệp trong `ho-so.json.files` có SHA-256 khớp nội dung zip.
 * - TC-08.08: D4 `SPXTST0000011` → Tạo hồ sơ khiếu nại → D17.
 * Chạy: `E2E_M10_BE=1 pnpm e2e:real e2e/real/m10-recon-claims.spec.ts` (cần worker-export cho gói bằng chứng).
 */
import { expect, test, type Locator } from "@playwright/test";

import { bearer, expectZipMatchesManifest, loginAdmin, packageId, resetData } from "./helpers";

test.skip(!process.env.E2E_M10_BE, "BE M10 (T-116 seed hàng hoàn) — đặt E2E_M10_BE=1 khi chạy e2e:real");
test.use({ viewport: { width: 1366, height: 768 } });

test.beforeEach(() => resetData());

test("TC-06.02 / 06.13 / 06.12 (seed): D2 quá hạn → D15 lọc Cao → điều chỉnh trạng thái kiện 52 → đánh dấu đã xử lý 49", async ({
  page,
  request,
}) => {
  await loginAdmin(page, "tst_sup");
  // D2 (TC-09.20 / 09.21 UI).
  await expect(page.getByRole("link", { name: /^Quá hạn chưa về: 1\./ })).toBeVisible();
  const attention = page.getByRole("region", { name: "Cần xử lý" });
  await expect(attention.getByText("1 kiện hoàn quá 7 ngày chưa về")).toBeVisible();
  await expect(attention.getByText(/^\d+ lệch mức Cao$/)).toBeVisible();

  // TC-06.02: D15 lọc mức Cao.
  await page.getByRole("link", { name: /Lệch trạng thái/ }).click();
  await expect(page.getByRole("tab", { name: "Đang mở 2" })).toHaveAttribute("aria-selected", "true");
  await page.getByLabel("Mức").selectOption("HIGH");
  await expect(page).toHaveURL(/severity=HIGH/);
  const table = page.getByRole("table", { name: "Danh sách cảnh báo lệch trạng thái" });
  const row49 = table.getByRole("row").filter({ hasText: "SPXTST0000049" });
  await expect(row49).toContainText("Hàng hoàn quá 7 ngày chưa về");
  await expect(row49).toContainText("Cao");
  await expect(table.getByRole("row").filter({ hasText: "SPXTST0000052" })).toHaveCount(0);
  await page.getByRole("button", { name: "Xóa bộ lọc" }).first().click();

  // TC-06.13: điều chỉnh trạng thái kho (L6) từ cảnh báo BR-14.
  await table
    .getByRole("row")
    .filter({ hasText: "SPXTST0000052" })
    .getByRole("button", { name: /Xử lý/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Xử lý cảnh báo" });
  await expect(dialog.getByText(/Kho: Đã đóng gói|Đã đóng gói/).first()).toBeVisible();
  await dialog.getByRole("button", { name: "Điều chỉnh trạng thái kho" }).click();
  await dialog.getByRole("radio", { name: "Đã bàn giao" }).check();
  await dialog.getByLabel("Lý do").fill("ĐVVC lấy hàng, quên quét bàn giao");
  await dialog.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText("Đã xử lý cảnh báo.")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Đang mở 1" })).toBeVisible();
  const sup = await bearer(request, "tst_sup");
  const pkg52 = (await (
    await request.get(`/api/v1/packages/${await packageId(request, sup, "SPXTST0000052")}`, { headers: sup })
  ).json()) as { warehouse_status: string };
  expect(pkg52.warehouse_status).toBe("HANDED_OVER");

  // TC-06.12: đánh dấu đã xử lý cảnh báo 49.
  await row49.getByRole("button", { name: /Xử lý/ }).click();
  await dialog.getByLabel("Ghi chú").fill("Đã gọi ĐVVC, chờ phản hồi");
  await dialog.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText("Đã xử lý cảnh báo.")).toBeVisible();
  await expect(page.getByText("Không có lệch trạng thái nào đang mở.")).toBeVisible();
  await page.getByRole("tab", { name: "Đã xử lý" }).click();
  await expect(table.getByRole("row").filter({ hasText: "SPXTST0000049" })).toContainText(
    "Đã gọi ĐVVC, chờ phản hồi",
  );
  await expect(table.getByRole("row").filter({ hasText: "SPXTST0000052" })).toBeVisible();
});

test("TC-08.01 + VERSION_CONFLICT hai tab: KN-000001 (seed) Mới → Đã gửi → Đang chờ → Thắng → Đóng; gói zip SHA-256 khớp ho-so.json", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  // Tab B (Supervisor): chặn WS dashboard để giữ bản cũ của hồ sơ — mô phỏng hai người sửa cùng lúc.
  const other = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  await other.routeWebSocket(/\/ws\/dashboard/, () => {});
  await loginAdmin(other, "tst_sup");
  await other.goto("/admin/claims?status=ALL&q=KN-000001");
  await other.getByRole("table").getByRole("link", { name: "KN-000001" }).click();
  await expect(
    other.getByRole("heading", { name: /KN-000001 · Thất lạc · gửi Đơn vị vận chuyển/ }),
  ).toBeVisible();
  const url = other.url();

  // Tab A (CSKH): nhận phụ trách → Đã gửi.
  await loginAdmin(page, "tst_cskh");
  await page.goto(url);
  const steps = page.getByRole("list", { name: "Tiến trình hồ sơ" });
  await expect(steps.locator('[aria-current="step"]')).toContainText("Mới");
  await page.getByRole("button", { name: "Nhận phụ trách" }).click();
  await expect(page.getByRole("button", { name: "Nhận phụ trách" })).toHaveCount(0);
  const move = async (to: string, fill?: (d: Locator) => Promise<unknown>) => {
    await page.getByRole("button", { name: "Đổi trạng thái" }).click();
    await page.getByRole("menuitem", { name: to }).click();
    const d = page.getByRole("dialog", { name: `Chuyển sang "${to}"` });
    if (fill) await fill(d);
    await d.getByRole("button", { name: "Xác nhận" }).click();
    await expect(d).toHaveCount(0);
  };
  await move("Đã gửi", (d) => d.getByLabel("Mã tham chiếu sàn").fill("DVVC-998877"));
  await expect(steps.locator('[aria-current="step"]')).toContainText("Đã gửi");

  // Tab B còn bản "Mới" → Nhận phụ trách → 409 VERSION_CONFLICT → toast + tải bản mới.
  await expect(
    other.getByRole("list", { name: "Tiến trình hồ sơ" }).locator('[aria-current="step"]'),
  ).toContainText("Mới");
  await other.getByRole("button", { name: "Nhận phụ trách" }).click();
  await expect(other.getByText(/^Hồ sơ vừa được .+ cập nhật\. Đã tải lại\.$/)).toBeVisible();
  await expect(
    other.getByRole("list", { name: "Tiến trình hồ sơ" }).locator('[aria-current="step"]'),
  ).toContainText("Đã gửi");
  await other.context().close();

  // Tab A đi tiếp tới Đóng (AC-37).
  await move("Đang chờ");
  await expect(steps.locator('[aria-current="step"]')).toContainText("Đang chờ");
  await page.getByRole("button", { name: "Đổi trạng thái" }).click();
  await page.getByRole("menuitem", { name: "Thắng" }).click();
  const won = page.getByRole("dialog", { name: 'Chuyển sang "Thắng"' });
  await won.getByRole("button", { name: "Xác nhận" }).click();
  await expect(won.getByText("Nhập số tiền là số nguyên ≥ 0.")).toBeVisible();
  await won.getByLabel("Số tiền thu hồi (đ)").fill("150000");
  await won.getByRole("button", { name: "Xác nhận" }).click();
  await expect(steps.locator('[aria-current="step"]')).toContainText("Thắng");
  await move("Đóng", async (d) => {
    await expect(
      d.getByText(
        "Sau khi đóng, clip và ảnh trong hồ sơ được xóa theo thời hạn lưu thông thường tính từ hôm nay.",
      ),
    ).toBeVisible();
  });
  await expect(
    page.getByText("Hồ sơ đã đóng — chỉ xem, vẫn thêm ghi chú và xuất gói bằng chứng được."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Đổi trạng thái" })).toHaveCount(0);
  const notes = page.getByRole("list", { name: "Ghi chú" });
  await expect(notes.getByText("Mới → Đã gửi.")).toBeVisible();

  // UC-12: gói bằng chứng (hồ sơ đã đóng vẫn xuất được) → zip → SHA-256 từng tệp khớp ho-so.json.
  await page.getByRole("button", { name: "Xuất gói bằng chứng" }).click();
  const pack = page.getByRole("dialog", { name: "Xuất gói bằng chứng" });
  await pack.getByRole("button", { name: "Tạo gói" }).click();
  const zipButton = pack.getByRole("button", { name: "Tải gói bằng chứng (.zip)" });
  await expect(zipButton).toBeVisible({ timeout: 180_000 });
  const shown = (await pack.getByText(/^[0-9a-f]{4}…[0-9a-f]{4}$/).textContent())!;
  const downloading = page.waitForEvent("download");
  await zipButton.click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("KN-000001.zip");
  const file = await download.path();
  expectZipMatchesManifest(file, "KN-000001", shown);
});

test("TC-08.08: D4 SPXTST0000011 → Tạo hồ sơ khiếu nại (Khách báo thiếu / sai, Sàn) → D17", async ({
  page,
  request,
}) => {
  const cskh = await bearer(request, "tst_cskh");
  const id = await packageId(request, cskh, "SPXTST0000011");
  await loginAdmin(page, "tst_cskh");
  await page.goto(`/admin/packages/${id}`);
  await page.getByRole("button", { name: "Tạo hồ sơ khiếu nại" }).click();
  const dialog = page.getByRole("dialog", { name: "Tạo hồ sơ khiếu nại" });
  await dialog.getByLabel("Ghi chú").fill("Khách báo thiếu 1 tất");
  await dialog.getByRole("button", { name: "Tạo hồ sơ" }).click();
  await expect(page).toHaveURL(/\/admin\/claims\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { name: /KN-000002 · Khách báo thiếu \/ sai · gửi Sàn/ }),
  ).toBeVisible();
  await expect(page.getByText("Khách báo thiếu 1 tất")).toBeVisible();
  await expect(page.getByRole("region", { name: "Bằng chứng" })).toContainText("Phiên đóng gói");
});
