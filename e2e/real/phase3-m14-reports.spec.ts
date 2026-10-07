/**
 * Item 03 M14 (T-262) — D20 Báo cáo trên BE thật (02b-admin §13 "E2E BE thật": báo cáo + CSV; UC-15, AC-45..47,
 * FR-09.02..06; dữ liệu `seed-demo` + `seed_phase3.py`):
 * - Thẻ D20 khớp số API-150 / 151 (tử số / mẫu số theo BR-41 — FE không tự tính) cùng kỳ mặc định 30 ngày.
 * - CSKH: không có tab Năng suất; URL `tab=productivity` → tab Hàng hoàn + Alert (server cũng 403 — API-152).
 * - Xuất CSV (API-153): tên tệp theo kỳ, BOM UTF-8, dòng tiêu đề "Báo cáo hàng hoàn" / "Báo cáo năng suất", Toast.
 * - Lọc sàn TikTok Shop → URL + API-150 `platform=TIKTOK`.
 * Cần BE T-216, T-217. Chạy: `E2E_M14_BE=1 pnpm e2e:real e2e/real/phase3-m14-reports.spec.ts`.
 * Trạng thái: CHƯA CHẠY — điều phối chạy sau khi dựng lại stack (T-262, 2026-10-07).
 */
import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { loginAdmin, resetData } from "./helpers";

test.skip(!process.env.E2E_M14_BE, "BE M14 (báo cáo API-150..153) — đặt E2E_M14_BE=1 khi chạy e2e:real");

test.beforeEach(() => resetData());

type Rate = { numerator: number; denominator: number; value: number | null };
const NUM = new Intl.NumberFormat("vi-VN");

/** Tên truy cập của thẻ tỷ lệ (RateCard): "Tỷ lệ hoàn: 4,0%, 40 / 1.000 kiện. …"; `value = null` → "Tỷ lệ hoàn: —, …". */
function rateName(label: string, r: Rate, unit: string) {
  if (r.value == null) return new RegExp(`^${label}: —, `);
  return new RegExp(
    `^${label}: [\\d,]+%, ${NUM.format(r.numerator)} / ${NUM.format(r.denominator)} ${unit}\\.`,
  );
}

async function openReports(page: Page, user: string, path = "/admin/reports") {
  await loginAdmin(page, user);
  const res = page.waitForResponse((r) => r.url().includes("/api/v1/reports/returns") && r.status() === 200);
  await page.goto(path);
  return (await (await res).json()) as { cards: { return_rate: Rate; issue_rate: Rate } };
}

test("UC-15 / AC-45 (BE thật): CSKH — thẻ Hàng hoàn khớp API-150; không có Năng suất; Xuất CSV có BOM + tiêu đề", async ({
  page,
}) => {
  const data = await openReports(page, "tst_cskh");
  await expect(page.getByRole("heading", { name: "Báo cáo" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Hàng hoàn" })).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("link", { name: rateName("Tỷ lệ hoàn", data.cards.return_rate, "kiện") }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Năng suất" })).toHaveCount(0);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Xuất CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^bao-cao-hang-hoan-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);
  await expect(page.getByText("Đã tải file CSV.")).toBeVisible();
  const text = readFileSync((await file.path())!, "utf8");
  expect(text.charCodeAt(0)).toBe(0xfeff);
  expect(text).toContain("Báo cáo hàng hoàn");
  expect(text).toContain("Tỷ lệ hoàn");

  await page.goto("/admin/reports?tab=productivity");
  await expect(page.getByText("Bạn không có quyền xem báo cáo năng suất.")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Hàng hoàn" })).toHaveAttribute("aria-selected", "true");
});

test("AC-46 (BE thật): tab Khiếu nại khớp API-151; lọc TikTok Shop gửi platform=TIKTOK", async ({ page }) => {
  await openReports(page, "tst_sup");
  const claims = page.waitForResponse(
    (r) => r.url().includes("/api/v1/reports/claims") && r.status() === 200,
  );
  await page.getByRole("tab", { name: "Khiếu nại" }).click();
  await expect(page).toHaveURL(/tab=claims/);
  const c = (await (await claims).json()) as { cards: { win_rate: Rate } };
  await expect(
    page.getByRole("link", { name: rateName("Tỷ lệ thắng", c.cards.win_rate, "có kết quả") }),
  ).toBeVisible();

  const filtered = page.waitForRequest(
    (r) => r.url().includes("/api/v1/reports/claims") && r.url().includes("platform=TIKTOK"),
  );
  await page.getByLabel("Sàn", { exact: true }).selectOption({ label: "TikTok Shop" });
  await filtered;
  await expect(page).toHaveURL(/platform=TIKTOK/);
});

test("AC-47 (BE thật): Admin — tab Năng suất (API-152) + CSV năng suất", async ({ page }) => {
  await openReports(page, "tst_admin");
  const prod = page.waitForResponse(
    (r) => r.url().includes("/api/v1/reports/productivity") && r.status() === 200,
  );
  await page.getByRole("tab", { name: "Năng suất" }).click();
  expect((await prod).ok()).toBe(true);
  await expect(page).toHaveURL(/tab=productivity/);
  await expect(page.getByRole("table").first()).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Xuất CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^bao-cao-nang-suat-/);
  expect(readFileSync((await file.path())!, "utf8")).toContain("Báo cáo năng suất");
});
