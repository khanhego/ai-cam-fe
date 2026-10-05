/**
 * UC-09 / TC-05.11..13 với BE thật (04-test-cases M05). Cần BE T-17 (API-50..54): chạy với `E2E_M4_BE=1`.
 */
import { expect, test } from "@playwright/test";

import { loginAdmin, resetData } from "./helpers";

test.skip(!process.env.E2E_M4_BE, "Chờ BE T-17 (API-50..54) — chạy với E2E_M4_BE=1");
test.beforeEach(() => resetData());

const HEADER = "platform_order_sn,tracking_number,sku,product_name,variation,quantity,buyer_note";
const line = (n: number, tracking = `SPXCSV${String(n).padStart(7, "0")}`) =>
  `2410CSV${String(n).padStart(5, "0")},${tracking},SKU${n},Áo thun basic,Đen / L,1,`;
const csv = (name: string, lines: string[], header = HEADER) => ({
  name,
  mimeType: "text/csv",
  buffer: Buffer.from([header, ...lines].join("\n")),
});

test("TC-05.11: 500 đơn → xem trước, Nhập 500 đơn ≤ 30 giây, Lịch sử có dòng Nguyễn B", async ({ page }) => {
  await loginAdmin(page, "tst_sup");
  await page.goto("/admin/imports");
  const started = Date.now();
  await page.getByLabel("File đơn hàng (.csv, .xlsx)").setInputFiles(
    csv(
      "ok_500.csv",
      Array.from({ length: 500 }, (_, i) => line(i + 1)),
    ),
  );
  const preview = page.getByRole("region", { name: "Xem trước: ok_500.csv" });
  await expect(preview.getByText("Mới 500 · Cập nhật 0 · Bỏ qua 0 (đã có từ Shopee) · Lỗi 0")).toBeVisible({
    timeout: 20_000,
  });
  await preview.getByRole("button", { name: "Nhập 500 đơn" }).click();
  await expect(page.getByText("Đã nhập 500 đơn.")).toBeVisible({ timeout: 20_000 });
  expect(Date.now() - started).toBeLessThan(30_000);
  const first = page.getByRole("table", { name: "Lịch sử nhập" }).getByRole("row").nth(1);
  await expect(first).toContainText("ok_500.csv");
  await expect(first).toContainText("Nguyễn B");
});

test("TC-05.12: 1 dòng lỗi → bảng lỗi dòng 12, nút Nhập bị khóa", async ({ page }) => {
  await loginAdmin(page, "tst_sup");
  await page.goto("/admin/imports");
  const lines = Array.from({ length: 12 }, (_, i) => (i === 10 ? line(i + 1, "") : line(i + 1)));
  await page.getByLabel("File đơn hàng (.csv, .xlsx)").setInputFiles(csv("one_error.csv", lines));

  await expect(
    page.getByText("File có 1 dòng lỗi. Sửa file rồi tải lại; chưa có đơn nào được nhập."),
  ).toBeVisible();
  await expect(page.getByRole("table", { name: "Dòng lỗi" }).getByRole("row").nth(1)).toContainText("12");
  await expect(page.getByRole("button", { name: /^Nhập \d+ đơn$/ })).toBeDisabled();
});

test("TC-05.13: thiếu cột tracking_number → File thiếu cột bắt buộc: Mã vận đơn", async ({ page }) => {
  await loginAdmin(page, "tst_sup");
  await page.goto("/admin/imports");
  await page
    .getByLabel("File đơn hàng (.csv, .xlsx)")
    .setInputFiles(
      csv(
        "missing_column.csv",
        ["2410CSV00001,SKU1,Áo,Đen,1,"],
        "platform_order_sn,sku,product_name,variation,quantity,buyer_note",
      ),
    );

  await expect(page.getByText("File thiếu cột bắt buộc: Mã vận đơn. Dùng file mẫu.")).toBeVisible();
});
