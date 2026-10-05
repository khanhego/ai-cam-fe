/** UC-09 D5 Nhập đơn trên MSW (02b-admin §13): file lỗi → khóa Nhập; file tốt → xem trước → nhập → Lịch sử. */
import { expect, test } from "@playwright/test";

const HEADER = "platform_order_sn,tracking_number,sku,product_name,variation,quantity,buyer_note";
const line = (n: number, tracking = `SPXCSV${String(n).padStart(7, "0")}`) =>
  `2410CSV${String(n).padStart(5, "0")},${tracking},SKU${n},Áo thun basic,Đen / L,1,`;
const csv = (name: string, lines: string[]) => ({
  name,
  mimeType: "text/csv",
  buffer: Buffer.from([HEADER, ...lines].join("\n")),
});

test("UC-09 / TC-05.11, 05.12 (UI, mock): file lỗi bị chặn, file tốt nhập được và vào Lịch sử", async ({
  page,
}) => {
  await page.goto("/admin/login");
  await page.getByLabel("Tên đăng nhập").fill("tst_sup");
  await page.getByLabel("Mật khẩu").fill("matkhau123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await page
    .getByRole("navigation", { name: "Điều hướng chính" })
    .getByRole("link", { name: "Nhập đơn" })
    .click();
  await expect(page).toHaveURL(/\/admin\/imports$/);

  const input = page.getByLabel("File đơn hàng (.csv, .xlsx)");
  await input.setInputFiles(csv("one_error.csv", [line(1), line(2, "")]));
  await expect(
    page.getByText("File có 1 dòng lỗi. Sửa file rồi tải lại; chưa có đơn nào được nhập."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Nhập \d+ đơn$/ })).toBeDisabled();

  await page.getByRole("button", { name: "Chọn file khác" }).click();
  await input.setInputFiles(
    csv(
      "ok.csv",
      Array.from({ length: 30 }, (_, i) => line(i + 1)),
    ),
  );
  const preview = page.getByRole("region", { name: "Xem trước: ok.csv" });
  await expect(preview.getByText("Mới 30 · Cập nhật 0 · Bỏ qua 0 (đã có từ Shopee) · Lỗi 0")).toBeVisible();
  await preview.getByRole("button", { name: "Nhập 30 đơn" }).click();

  await expect(page.getByText("Đã nhập 30 đơn.")).toBeVisible();
  const history = page.getByRole("table", { name: "Lịch sử nhập" });
  await expect(history.getByRole("row").nth(1)).toContainText("ok.csv");
  await expect(history.getByRole("row").nth(1)).toContainText("Đã nhập");
});
