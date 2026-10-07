/**
 * Item 03 M13 station trên MSW (02b-station §13 E2E mock, T-235): chip sàn · shop + kiện gộp TikTok (TC-03.81, 03.83),
 * yêu cầu hủy — chặn mở + banner khi đang đóng, đóng xong được (TC-03.85, 03.88), bàn hoàn mã trùng 2 shop → R3 chọn
 * đúng đơn → R2 (TC-04.74, 04.75; mã chiều về trùng 02a §5.1 #15). Luật 60 giây R2 (T-234): `phase3-m12.spec.ts`.
 * Dữ liệu `StationSim` (DEC-549, DEC-609) bám 04 §1. Âm (2 bíp) kiểm ở test component (`Phase3Packing.test.tsx`).
 */
import { expect, test, type Page } from "@playwright/test";

import { heading, hidScan, loginStation, startReturnShift } from "../real/helpers";

const SHOTS = process.env.E2E_SHOTS_DIR;
const shot = (page: Page, name: string) =>
  SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }) : Promise.resolve();

test.use({ viewport: { width: 1920, height: 1080 } });

async function ready(page: Page) {
  await loginStation(page);
  await expect(heading(page, "SẴN SÀNG")).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
}

test("TC-03.83 / 03.81: S2 kiện gộp TikTok — chip sàn · shop, banner vàng, đơn từng dòng; kiện lạ → Chưa rõ sàn", async ({
  page,
}) => {
  await ready(page);
  await hidScan(page, "TTTST0000000077");
  await expect(heading(page, "ĐANG ĐÓNG GÓI")).toBeVisible();

  await expect(page.getByRole("img", { name: "Sàn: TikTok Shop, shop TST TikTok A (mock)" })).toHaveText(
    "TikTok · TST TikTok A (mock)",
  );
  await expect(page.getByRole("alert").filter({ hasText: "Kiện gộp 2 đơn" })).toHaveText(
    /Kiện gộp 2 đơn: …0771, …0772 — kiểm đủ hàng của cả hai/,
  );
  await expect(page.getByText("(đơn …0771)")).toBeVisible();
  await expect(page.getByText("(đơn …0772)")).toBeVisible();
  await expect(page.getByText("Áo thun basic")).toBeVisible();
  await expect(page.getByText("Tất cổ ngắn")).toBeVisible();
  await shot(page, "s2-tiktok-merged");

  await hidScan(page, "TTTST0000000077");
  await expect(heading(page, "SẴN SÀNG")).toBeVisible();

  await hidScan(page, "SPXVN0000000000");
  await expect(heading(page, "ĐANG ĐÓNG GÓI")).toBeVisible();
  await expect(page.getByRole("img", { name: "Chưa rõ sàn" })).toHaveText("Chưa rõ sàn");
  await shot(page, "s2-unknown-platform");
});

test("TC-03.85 / 03.88: yêu cầu hủy — S4 vàng chặn mở; đơn chuyển yêu cầu hủy khi đang đóng → banner, đóng gói xong vẫn được", async ({
  page,
}) => {
  await ready(page);
  await hidScan(page, "TTTST0000000050");
  await expect(heading(page, "ĐƠN ĐANG YÊU CẦU HỦY")).toBeVisible();
  await expect(
    page.getByText("Người mua đang xin hủy đơn này. Chờ xử lý trên sàn, chưa đóng gói."),
  ).toBeVisible();
  await shot(page, "s4-cancel-requested");
  // Tự đóng theo ALERT_MS → về S1, không có phiên.
  await expect(heading(page, "SẴN SÀNG")).toBeVisible({ timeout: 15_000 });

  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await hidScan(page, "TTTST0000000051");
  await expect(heading(page, "ĐANG ĐÓNG GÓI")).toBeVisible();
  // Mock J-04 lượt 2 gắn cờ `ORDER_CANCEL_REQUESTED` sau 5 giây, đẩy WS `station.state`.
  const banner = page
    .getByRole("alert")
    .filter({ hasText: "Người mua đang xin hủy đơn này. Đóng gói xong để riêng, chưa bàn giao." });
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await shot(page, "s2-cancel-requested-banner");

  await hidScan(page, "TTTST0000000051");
  await expect(heading(page, "SẴN SÀNG")).toBeVisible();
});

for (const [label, code] of [
  ["TC-04.74 / 04.75 mã đơn", "2410DUP00001"],
  ["02a §5.1 #15 mã chiều về", "RTTST-DUP-1"],
] as const) {
  test(`${label} trùng 2 shop → R4 MÃ CÓ Ở NHIỀU ĐƠN → R3 có mã, chip từng dòng → Mở phiên dòng TikTok → R2 chip TikTok`, async ({
    page,
  }) => {
    await ready(page);
    await startReturnShift(page);
    await hidScan(page, code);

    await expect(heading(page, "MÃ CÓ Ở NHIỀU ĐƠN")).toBeVisible();
    await expect(
      page.getByText(`Mã ${code} có ở 2 đơn của các shop khác nhau. Chọn đúng đơn.`),
    ).toBeVisible();
    await shot(page, `r4-multiple-orders-${code}`);

    const dialog = page.getByRole("dialog", { name: "Tìm kiện hoàn" });
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByLabel("Mã vận đơn hoặc mã đơn")).toHaveValue(code);
    const shopee = dialog.getByRole("listitem").filter({ hasText: "SPXTSTB000000021" });
    const tiktok = dialog.getByRole("listitem").filter({ hasText: "TTTST0000000021" });
    await expect(shopee.getByRole("img", { name: "Sàn: Shopee, shop TST B" })).toHaveText("Shopee · TST B");
    await expect(tiktok.getByRole("img", { name: "Sàn: TikTok Shop, shop TST TikTok A (mock)" })).toHaveText(
      "TikTok · TST TikTok A (mock)",
    );
    await shot(page, `r3-multiple-orders-${code}`);

    await tiktok.getByRole("button", { name: "Mở phiên" }).click();
    await expect(heading(page, "ĐANG KIỂM HÀNG HOÀN")).toBeVisible();
    await expect(page.getByRole("img", { name: "Sàn: TikTok Shop, shop TST TikTok A (mock)" })).toBeVisible();
    await expect(page.getByText("Mã gốc TTTST0000000021")).toBeVisible();
    await shot(page, `r2-tiktok-${code}`);
  });
}
