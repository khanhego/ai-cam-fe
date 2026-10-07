import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const PASSWORD = "matkhau123";

/**
 * Tham số `docker compose` của stack đang test — mặc định stack dev; stack QA riêng đặt `AICAM_COMPOSE_PROJECT`,
 * `AICAM_COMPOSE_FILES` (đường dẫn tương đối ai-cam-be, cách ":") như `ai-cam-be/scripts/qa-reset.sh` (DEC-820).
 */
export function composeArgs(): string[] {
  const be = resolve(process.cwd(), "../ai-cam-be");
  const files = (process.env.AICAM_COMPOSE_FILES ?? "docker/compose.dev.yml").split(":");
  return [
    "compose",
    "-p",
    process.env.AICAM_COMPOSE_PROJECT ?? "aicam-dev",
    ...files.flatMap((f) => ["-f", resolve(be, f)]),
  ];
}

/** Migrate lại + seed TST + dọn Redis (ai-cam-be/scripts/qa-reset.sh). */
export function resetData() {
  // --mute-cam2: Cam 2 đọc góc khay trống → BR-06 không chặn ngẫu nhiên theo vòng phát của camera giả (QA G4).
  execFileSync(resolve(process.cwd(), "../ai-cam-be/scripts/qa-reset.sh"), ["--mute-cam2"], {
    stdio: "ignore",
  });
}

/** Máy quét HID: gõ liền (≤ 5 ms/phím) rồi Enter. */
/**
 * Máy quét trong E2E: dùng `hidScan` (mốc thời gian cách đều 5 ms như máy quét thật). `keyboard.type` ghi mốc lúc
 * Playwright giao phím → máy dev thiếu RAM có khoảng > 50 ms giữa hai phím, bộ đệm reset giữa chừng và mã bị cụt
 * (vd "XTST0000002" — thấy ở E2E M7).
 */
export async function scan(page: Page, code: string) {
  await hidScan(page, code);
}

/**
 * Máy quét HID có mốc thời gian phần cứng: mỗi phím mang `timestamp` cách nhau 5 ms (như sự kiện OS của máy quét
 * thật), không phụ thuộc lúc Playwright giao phím. `keyboard.type` lấy mốc = lúc giao, nên khi luồng chính của
 * trang khựng ~80 ms (thấy ở /station/login có ô mật khẩu) một khoảng cách bị đo > 50 ms dù máy quét thật vẫn nhận.
 */
export async function hidScan(page: Page, code: string) {
  const cdp = await page.context().newCDPSession(page);
  const base = Date.now() / 1000;
  for (const [i, key] of [...code, "Enter"].entries()) {
    const enter = key === "Enter";
    const vk = enter ? 13 : key.toUpperCase().charCodeAt(0);
    const timestamp = base + i * 0.005;
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key,
      code: enter ? "Enter" : undefined,
      text: enter ? "\r" : key,
      windowsVirtualKeyCode: vk,
      timestamp,
    });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, windowsVirtualKeyCode: vk, timestamp });
  }
  await cdp.detach();
}

export async function loginStation(page: Page, username = "tst_station01") {
  await page.goto("/station/login");
  await page.getByLabel("Tài khoản station").fill(username);
  await page.getByLabel("Mật khẩu").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

export async function stationReady(page: Page) {
  await loginStation(page);
  await expect(page.getByText("SẴN SÀNG")).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } }); // bỏ focus ô nhập để máy quét gõ vào trang
}

/** Đăng nhập dashboard rồi chờ vào app (cookie rt_dashboard đã có → `goto` sau đó khôi phục phiên được). */
export async function loginAdmin(page: Page, username = "tst_admin") {
  await page.goto("/admin/login");
  await page.getByLabel("Tên đăng nhập").fill(username);
  await page.getByLabel("Mật khẩu").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).not.toHaveURL(/\/admin\/login/);
}

/** Header Bearer của một tài khoản seed (API-01) — gọi API trực tiếp trong E2E BE thật. */
export async function bearer(
  request: APIRequestContext,
  username: string,
  client: "STATION" | "DASHBOARD" = "DASHBOARD",
): Promise<Record<string, string>> {
  const res = await request.post("/api/v1/auth/login", { data: { username, password: PASSWORD, client } });
  expect(res.ok(), `đăng nhập ${username}`).toBe(true);
  return { Authorization: `Bearer ${((await res.json()) as { access_token: string }).access_token}` };
}

/** `TST Station 01` → loại station `kind` (API-60, Admin). */
export async function setStation01Kind(request: APIRequestContext, kind: "PACK" | "RETURN" | "BOTH") {
  const admin = await bearer(request, "tst_admin");
  const list = (await (await request.get("/api/v1/stations", { headers: admin })).json()) as {
    items: { id: string; name: string }[];
  };
  const st1 = list.items.find((s) => s.name === "TST Station 01")!;
  expect((await request.patch(`/api/v1/stations/${st1.id}`, { headers: admin, data: { kind } })).ok()).toBe(
    true,
  );
}

/** Id kiện theo mã vận đơn (API-30). */
export async function packageId(request: APIRequestContext, headers: Record<string, string>, code: string) {
  const res = (await (await request.get(`/api/v1/packages?q=${code}`, { headers })).json()) as {
    items: { id: string; tracking_number: string }[];
  };
  const found = res.items.find((p) => p.tracking_number === code);
  expect(found, `kiện ${code}`).toBeTruthy();
  return found!.id;
}

/** Tiêu đề trạng thái station (S*, R*) đúng nguyên văn. */
export const heading = (page: Page, name: string) => page.getByRole("heading", { name, exact: true });

/** Station → chế độ nhận hoàn, R5 "Lan QA" → R1 (TC-04.01). */
export async function startReturnShift(page: Page, operator = "Lan QA") {
  await page.getByRole("button", { name: "Chuyển sang nhận hàng hoàn" }).click();
  const r5 = page.getByRole("dialog", { name: "Người kiểm" });
  await r5.getByLabel("Tên người kiểm").fill(operator);
  await r5.getByRole("button", { name: "Bắt đầu ca" }).click();
  await expect(heading(page, "SẴN SÀNG NHẬN HÀNG HOÀN")).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
}

/**
 * AC-25: SHA-256 cả zip = mã rút gọn trên Dialog (API-137); mỗi tệp trong `ho-so.json.files` có trong zip
 * (`<KN>/<path>`) với SHA-256 + kích thước đúng như khai.
 */
export function expectZipMatchesManifest(file: string, code: string, shown: string) {
  const zip = readFileSync(file);
  const sha = createHash("sha256").update(zip).digest("hex");
  expect(`${sha.slice(0, 4)}…${sha.slice(-4)}`).toBe(shown);
  const manifest = JSON.parse(execFileSync("unzip", ["-p", file, `${code}/ho-so.json`]).toString("utf8")) as {
    code: string;
    files: { path: string; sha256: string; size_bytes: number }[];
  };
  expect(manifest.code).toBe(code);
  expect(manifest.files.length).toBeGreaterThan(0);
  const listing = execFileSync("unzip", ["-Z1", file]).toString().trim().split("\n");
  for (const f of manifest.files) {
    if (f.path === "ho-so.json") continue; // không tự chứa mã của chính nó
    expect(listing, f.path).toContain(`${code}/${f.path}`);
    const body = execFileSync("unzip", ["-p", file, `${code}/${f.path}`], { maxBuffer: 512 * 1024 * 1024 });
    expect(body.length, f.path).toBe(f.size_bytes);
    expect(createHash("sha256").update(body).digest("hex"), f.path).toBe(f.sha256);
  }
  return manifest.files.map((f) => f.path);
}
