/**
 * Item 03 M17 (T-262) — D22 Thông báo trên BE thật với transport mock (02b-admin §13 "E2E BE thật": thêm kênh mock +
 * gửi thử; UC-18, FR-06.04, 06.07, 06.08, 06.10, AC-61; stack dev `NOTIFY_TRANSPORT=mock` → mọi loại kênh "đã cấu
 * hình", gửi luôn được trừ loại trong `NOTIFY_MOCK_FAIL`):
 * - Thêm kênh Telegram: validate client (tên, Chat ID, ≥ 1 sự kiện) → 422 / 409 trùng tên từ server dưới ô → Lưu →
 *   Toast + dòng mới; nhãn sự kiện lấy từ API-170 `events[].label` (FE không chép cứng).
 * - Gửi thử (API-174) → Toast + "Gửi được HH:mm" (`last_status = OK`, `last_error = null`).
 * - Sửa kênh (API-172) đổi tên; giờ yên lặng (API-176); xóa kênh (API-173).
 * - Supervisor: không có mục drawer, URL → D12, API-170 403.
 * Cần BE T-226, T-227, T-276. Chạy: `E2E_M17_BE=1 pnpm e2e:real e2e/real/phase3-m17-notify.spec.ts`
 * (`NOTIFY_MOCK_FAIL` để trống).
 * Trạng thái: CHƯA CHẠY — điều phối chạy sau khi dựng lại stack (T-262, 2026-10-07).
 */
import { expect, test } from "@playwright/test";

import { bearer, loginAdmin, resetData } from "./helpers";

test.skip(!process.env.E2E_M17_BE, "BE M17 (thông báo, transport mock) — đặt E2E_M17_BE=1 khi chạy e2e:real");

test.beforeEach(() => resetData());

test("UC-18 / AC-61 (BE thật): thêm kênh Telegram mock → gửi thử OK → sửa tên → giờ yên lặng → xóa", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const admin = await bearer(request, "tst_admin");
  const catalog = (await (await request.get("/api/v1/notify/channels", { headers: admin })).json()) as {
    events: { code: string; label: string }[];
    items: unknown[];
  };
  const n01 = catalog.events.find((e) => e.code === "N01")!;
  expect(n01.label.length).toBeGreaterThan(0);
  const n01Box = new RegExp(n01.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  await loginAdmin(page, "tst_admin");
  await page.getByRole("link", { name: "Thông báo" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Thông báo" })).toBeVisible();
  // Transport mock: cả Telegram và Zalo OA đều "đã cấu hình" → không Alert EX-N1.
  await expect(page.getByText("Chưa cấu hình bot Telegram trên máy chủ. Liên hệ IT.")).toHaveCount(0);

  await page.getByRole("button", { name: "Thêm kênh" }).click();
  const dialog = page.getByRole("dialog", { name: "Thêm kênh" });
  await dialog.getByRole("button", { name: "Lưu" }).click();
  await expect(dialog.getByText("Tên kênh 2–40 ký tự.")).toBeVisible();
  await expect(dialog.getByText("Chọn ít nhất 1 sự kiện.")).toBeVisible();
  await dialog.getByLabel("Tên kênh *").fill("Kho E2E");
  await dialog.getByLabel("Chat ID *").fill("-1001234567890");
  await dialog.getByRole("checkbox", { name: n01Box }).check();
  await dialog.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã thêm kênh Kho E2E.")).toBeVisible();
  const table = page.getByRole("table", { name: "Kênh thông báo" });
  const row = table.getByRole("row").filter({ hasText: "Kho E2E" });
  await expect(row).toContainText(n01.label);
  await expect(row).toContainText("Chưa gửi");

  // Trùng tên (không phân biệt hoa thường) → 409 CHANNEL_NAME_EXISTS dưới ô.
  await page.getByRole("button", { name: "Thêm kênh" }).click();
  await dialog.getByLabel("Tên kênh *").fill("kho e2e");
  await dialog.getByLabel("Chat ID *").fill("-1009876543210");
  await dialog.getByRole("checkbox", { name: n01Box }).check();
  await dialog.getByRole("button", { name: "Lưu" }).click();
  await expect(dialog.getByText("Đã có kênh tên này.")).toBeVisible();
  await dialog.getByRole("button", { name: "Hủy" }).click();

  await table.getByRole("button", { name: "Gửi thử kênh Kho E2E" }).click();
  await expect(page.getByText("Đã gửi tin thử tới Kho E2E.")).toBeVisible({ timeout: 15_000 });
  await expect(row.getByText(/^Gửi được \d{2}:\d{2}$/)).toBeVisible();
  const after = (await (await request.get("/api/v1/notify/channels", { headers: admin })).json()) as {
    items: { name: string; last_status: string; last_error: unknown }[];
  };
  expect(after.items.find((c) => c.name === "Kho E2E")).toMatchObject({
    last_status: "OK",
    last_error: null,
  });

  await table.getByRole("button", { name: "Sửa kênh Kho E2E" }).click();
  const edit = page.getByRole("dialog", { name: "Sửa kênh" });
  await expect(edit.getByLabel("Chat ID *")).toHaveValue("-1001234567890");
  await edit.getByLabel("Tên kênh *").fill("Kho chính E2E");
  await edit.getByRole("button", { name: "Lưu" }).click();
  await expect(table.getByRole("row").filter({ hasText: "Kho chính E2E" })).toBeVisible();

  await page.getByRole("button", { name: "Sửa giờ yên lặng" }).click();
  const quiet = page.getByRole("dialog", { name: "Giờ yên lặng" });
  await quiet.getByRole("checkbox", { name: "Tắt giờ yên lặng" }).uncheck();
  await quiet.getByLabel("Từ").fill("23:00");
  await quiet.getByLabel("Đến").fill("06:30");
  await quiet.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Giờ yên lặng: 23:00 – 06:30 (chỉ gửi mức Cao)")).toBeVisible();

  await table.getByRole("button", { name: "Thao tác khác cho kênh Kho chính E2E" }).click();
  await page.getByRole("menuitem", { name: "Xóa kênh" }).click();
  await page
    .getByRole("dialog", { name: "Xóa kênh Kho chính E2E?" })
    .getByRole("button", { name: "Xóa kênh" })
    .click();
  await expect(page.getByText("Đã xóa kênh Kho chính E2E.")).toBeVisible();
  await expect(table.getByRole("row").filter({ hasText: "Kho chính E2E" })).toHaveCount(0);
});

test("Quyền (BE thật): Supervisor không có D22; API-170 403", async ({ page, request }) => {
  const sup = await bearer(request, "tst_sup");
  expect((await request.get("/api/v1/notify/channels", { headers: sup })).status()).toBe(403);
  await loginAdmin(page, "tst_sup");
  await expect(
    page.getByRole("navigation", { name: "Điều hướng chính" }).getByRole("link", { name: "Thông báo" }),
  ).toHaveCount(0);
  await page.goto("/admin/settings/notifications");
  await expect(page).toHaveURL(/\/admin\/forbidden/);
});
