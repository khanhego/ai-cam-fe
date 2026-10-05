/**
 * QA G4 — TC-02.13 (NFR-15, DEC-13) với BE thật: audit `VIEW_CLIP` chỉ ghi khi bấm phát (request từ byte 0),
 * không ghi khi chỉ mở D4; tua không ghi thêm. Kiểm qua API-92 `/audit-logs` trước / sau.
 * Cần stack dev + camera giả (clip READY ≤ 60 giây sau khi đóng phiên).
 */
import { expect, test, type APIRequestContext } from "@playwright/test";

import { loginAdmin, PASSWORD, resetData, scan, stationReady } from "./helpers";

const API = process.env.E2E_API_URL ?? "http://localhost:8180/api/v1";

test.beforeEach(() => resetData());

type AuditItem = {
  at: string;
  action: string;
  user: { display_name: string } | null;
  object_id: string | null;
};

async function viewClipRows(request: APIRequestContext): Promise<AuditItem[]> {
  const login = await request.post(`${API}/auth/login`, {
    data: { username: "tst_admin", password: PASSWORD, client: "DASHBOARD" },
  });
  expect(login.ok()).toBe(true);
  const { access_token } = (await login.json()) as { access_token: string };
  const res = await request.get(`${API}/audit-logs`, {
    params: { action: "VIEW_CLIP", page_size: 100 },
    headers: { Authorization: `Bearer ${access_token}` },
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { items: AuditItem[] }).items;
}

test("TC-02.13: mở D4 không ghi VIEW_CLIP; bấm phát + tua → đúng 1 dòng VIEW_CLIP của Lan", async ({
  browser,
  request,
}) => {
  test.setTimeout(240_000);
  const station = await (await browser.newContext()).newPage();
  await stationReady(station);
  await scan(station, "SPXTST0000001");
  await expect(station.getByText("ĐANG ĐÓNG GÓI")).toBeVisible();
  await station.waitForTimeout(8000);
  await scan(station, "SPXTST0000001");
  await expect(station.getByText("SẴN SÀNG")).toBeVisible();

  const before = await viewClipRows(request);
  const page = await (await browser.newContext()).newPage();
  await loginAdmin(page, "tst_cskh");
  await page.goto("/admin/packages");
  await expect(page.getByLabel("Mã vận đơn hoặc mã đơn")).toBeFocused();
  await scan(page, "SPXTST0000001");
  await expect(page).toHaveURL(/\/admin\/packages\/[0-9a-f-]+$/);

  // Bước 1: mở D4 có clip, chưa bấm phát → 0 dòng VIEW_CLIP mới.
  const video = page.getByRole("region", { name: "Clip" }).locator('video[aria-label="Cam 1"]');
  await expect(video).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(3000);
  expect(await viewClipRows(request)).toHaveLength(before.length);

  // Bước 2: bấm phát (nút phát của trình phát gốc) → đọc file từ byte 0.
  const firstByte = page.waitForRequest((r) => r.url().includes("/stream") || r.resourceType() === "media");
  await video.evaluate((v: HTMLVideoElement) => v.play());
  await firstByte;
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 15_000 })
    .toBeGreaterThan(0);

  // Bước 3: tua tới giữa clip (request Range không từ byte 0).
  const duration = await video.evaluate((v: HTMLVideoElement) => v.duration);
  expect(duration).toBeGreaterThan(2);
  await video.evaluate(
    (v: HTMLVideoElement) =>
      new Promise<void>((done) => {
        v.addEventListener("seeked", () => done(), { once: true });
        v.currentTime = v.duration / 2;
      }),
  );
  await page.waitForTimeout(3000);

  const after = await viewClipRows(request);
  const added = after.slice(0, after.length - before.length);
  expect(added).toHaveLength(1);
  expect(added[0]!.action).toBe("VIEW_CLIP");
  expect(added[0]!.user?.display_name).toBe("Lan");
});
