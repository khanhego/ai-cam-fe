/**
 * M8 — hồ sơ khiếu nại trên BE thật (02b-admin §13 E2E BE thật; T-154..T-159): đóng gói SPXTST0000012 ở station →
 * bàn giao tay (API-122) → chế độ nhận hoàn → R2 kết luận "Hộp rỗng" → quét đóng → R1 báo hồ sơ KN-… tự tạo (BR-08)
 * → CSKH: D4 chip "Đang được giữ: hồ sơ khiếu nại KN-…" (API-31 `protection`) → D16 → D17 (2 phiên bằng chứng) →
 * Nhận phụ trách → Đã gửi → Xuất gói bằng chứng → tải zip (encode thật ở worker-export) → zip có `ho-so.json`,
 * SHA-256 file = SHA-256 hiện trên Dialog (API-137); T-162: SHA-256 từng tệp khớp `ho-so.json.files`.
 * Như `ai-cam-be/tests/qa/test_m8_live.py` (dữ liệu hàng hoàn `seed-demo` là T-116 — chưa có ở M8).
 * Chạy: `E2E_M8_BE=1 pnpm e2e:real e2e/real/m8-claims.spec.ts` (stack dev đầy đủ: fake-cam1/2, vision, worker,
 * worker-export, beat).
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { expectZipMatchesManifest, hidScan, loginAdmin, PASSWORD, resetData, stationReady } from "./helpers";

test.skip(!process.env.E2E_M8_BE, "BE M8 (T-110, T-111, T-119, T-112) — đặt E2E_M8_BE=1 khi chạy e2e:real");
test.use({ viewport: { width: 1366, height: 768 } });

const CODE = "SPXTST0000012";

async function token(request: APIRequestContext, username: string, client: "STATION" | "DASHBOARD") {
  const res = await request.post("/api/v1/auth/login", { data: { username, password: PASSWORD, client } });
  expect(res.ok()).toBe(true);
  return { Authorization: `Bearer ${((await res.json()) as { access_token: string }).access_token}` };
}

const heading = (page: Page, name: string) => page.getByRole("heading", { name, exact: true });

/** J-01 cắt clip (NFR-03 ≤ 60 giây) — đợi mọi clip của `n` phiên mới nhất READY. */
async function waitClipsReady(
  request: APIRequestContext,
  headers: Record<string, string>,
  id: string,
  n: number,
) {
  await expect
    .poll(
      async () => {
        const d = (await (await request.get(`/api/v1/packages/${id}`, { headers })).json()) as {
          sessions: { clips: { status: string }[] }[];
        };
        const clips = d.sessions.slice(0, n).flatMap((s) => s.clips);
        return clips.length === 2 * n && clips.every((c) => c.status === "READY");
      },
      { timeout: 150_000, intervals: [3000] },
    )
    .toBe(true);
}

test.beforeEach(() => resetData());

test("M8 (BE thật): phiên hoàn Hộp rỗng → KN tự tạo → D4 chip bảo vệ → D16 → D17 đổi trạng thái → gói zip tải về", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(600_000);
  const admin = await token(request, "tst_admin", "DASHBOARD");
  const sup = await token(request, "tst_sup", "DASHBOARD");
  const stations = (await (await request.get("/api/v1/stations", { headers: admin })).json()) as {
    items: { id: string; name: string }[];
  };
  const st1 = stations.items.find((s) => s.name === "TST Station 01")!;
  expect(
    (await request.patch(`/api/v1/stations/${st1.id}`, { headers: admin, data: { kind: "BOTH" } })).ok(),
  ).toBe(true);

  // Station: đóng gói CODE (clip thật từ camera giả).
  await stationReady(page);
  await hidScan(page, CODE);
  await expect(heading(page, "ĐANG ĐÓNG GÓI")).toBeVisible();
  await page.waitForTimeout(8000);
  await hidScan(page, CODE);
  await expect(heading(page, "SẴN SÀNG")).toBeVisible();
  const pkgs = (await (await request.get(`/api/v1/packages?q=${CODE}`, { headers: admin })).json()) as {
    items: { id: string; tracking_number: string }[];
  };
  const pkgId = pkgs.items.find((p) => p.tracking_number === CODE)!.id;
  await waitClipsReady(request, admin, pkgId, 1);
  const adjust = await request.post(`/api/v1/packages/${pkgId}/warehouse-status`, {
    headers: sup,
    data: { to_status: "HANDED_OVER", reason: "E2E M8 bàn giao tay" },
  });
  expect(adjust.ok()).toBe(true);

  // Station: nhận hoàn → R2 → ảnh F2 → "Hộp rỗng" → quét đóng → R1 báo hồ sơ khiếu nại tự tạo (TC-04.21).
  await page.getByRole("button", { name: "Chuyển sang nhận hàng hoàn" }).click();
  const r5 = page.getByRole("dialog", { name: "Người kiểm" });
  await r5.getByLabel("Tên người kiểm").fill("Lan QA");
  await r5.getByRole("button", { name: "Bắt đầu ca" }).click();
  await expect(heading(page, "SẴN SÀNG NHẬN HÀNG HOÀN")).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await hidScan(page, CODE);
  await expect(heading(page, "ĐANG KIỂM HÀNG HOÀN")).toBeVisible();
  await page.keyboard.press("F2");
  await expect(page.getByRole("button", { name: "Ảnh 1" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("radio", { name: /Hộp rỗng/ }).click();
  await expect(page.getByText("Đã lưu")).toBeVisible();
  await page.waitForTimeout(4000);
  await hidScan(page, CODE);
  await expect(heading(page, "SẴN SÀNG NHẬN HÀNG HOÀN")).toBeVisible();
  const notice = page.getByText(
    new RegExp(`^Đã nhận ${CODE} — Hộp rỗng\\. Đã tạo hồ sơ khiếu nại (KN-\\d{6})\\.$`),
  );
  await expect(notice).toBeVisible();
  const claimCode = (await notice.textContent())!.match(/KN-\d{6}/)![0];
  await waitClipsReady(request, admin, pkgId, 2);

  // Dashboard CSKH.
  const cskh = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  await loginAdmin(cskh, "tst_cskh");

  // D4: chip bảo vệ thay "Giữ clip" (API-31 `protection` — T-111).
  await cskh.goto(`/admin/packages/${pkgId}`);
  const clip = cskh.getByRole("region", { name: "Clip" });
  await expect(clip.getByText(`Đang được giữ: hồ sơ khiếu nại ${claimCode}`)).toBeVisible();
  await expect(cskh.getByRole("button", { name: "Giữ clip" })).toHaveCount(0);

  // D16 → D17.
  await cskh.goto(`/admin/claims?status=ALL&q=${claimCode}`);
  await cskh.getByRole("table").getByRole("link", { name: claimCode }).click();
  await expect(
    cskh.getByRole("heading", { name: new RegExp(`${claimCode} · Hộp rỗng · gửi Sàn`) }),
  ).toBeVisible();
  await expect(cskh.getByRole("button", { name: /^Xem Phiên đóng gói/ })).toBeVisible();
  await expect(cskh.getByRole("button", { name: /^Xem Phiên mở hoàn/ })).toBeVisible();
  const steps = cskh.getByRole("list", { name: "Tiến trình hồ sơ" });
  await expect(steps.locator('[aria-current="step"]')).toContainText("Mới");

  await cskh.getByRole("button", { name: "Nhận phụ trách" }).click();
  await expect(cskh.getByRole("button", { name: "Nhận phụ trách" })).toHaveCount(0);
  await cskh.getByRole("button", { name: "Đổi trạng thái" }).click();
  await cskh.getByRole("menuitem", { name: "Đã gửi" }).click();
  const transition = cskh.getByRole("dialog", { name: 'Chuyển sang "Đã gửi"' });
  await transition.getByLabel("Mã tham chiếu sàn").fill("SPE-E2E8");
  await transition.getByRole("button", { name: "Xác nhận" }).click();
  await expect(steps.locator('[aria-current="step"]')).toContainText("Đã gửi");

  // UC-12 / TC-08.16: gói bằng chứng encode thật (≤ 3 phút).
  await cskh.getByRole("button", { name: "Xuất gói bằng chứng" }).click();
  const pack = cskh.getByRole("dialog", { name: "Xuất gói bằng chứng" });
  await pack.getByRole("button", { name: "Tạo gói" }).click();
  await expect(pack.getByRole("progressbar")).toBeVisible();
  const zipButton = pack.getByRole("button", { name: "Tải gói bằng chứng (.zip)" });
  await expect(zipButton).toBeVisible({ timeout: 240_000 });
  const shown = (await pack.getByText(/^[0-9a-f]{4}…[0-9a-f]{4}$/).textContent())!;
  const downloading = cskh.waitForEvent("download");
  await zipButton.click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(`${claimCode}.zip`);
  const file = await download.path();
  // T-162: SHA-256 zip = Dialog; mọi tệp trong ho-so.json (clip gốc, video ghép, ảnh, ket-luan.json) khớp SHA-256.
  const files = expectZipMatchesManifest(file, claimCode, shown);
  expect(files).toContainEqual(expect.stringMatching(/^\d{2}-mo-hoan-\d{8}-\d{4}\/ket-luan\.json$/));
  expect(files).toContainEqual(expect.stringMatching(/^\d{2}-dong-goi-\d{8}-\d{4}\/goc-CAM1\.mp4$/));
});
