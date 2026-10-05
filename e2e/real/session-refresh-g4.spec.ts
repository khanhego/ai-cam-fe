/**
 * QA G4 — TC-10.05 (API-02, N3): refresh theo client không ghi đè nhau, hết hạn token theo thời gian thật.
 *
 * Tiền điều kiện của case là `ACCESS_TOKEN_MINUTES=1` cho service `api`. Không đổi / dừng container `api` dùng
 * chung: spec bật một container API tạm (`docker compose run` cùng image, cùng Postgres / Redis của stack dev)
 * ở :8181 với `ACCESS_TOKEN_MINUTES=1`, cùng một Vite dev ở :5182 proxy sang nó; cả hai bị dọn ở `afterAll`.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { loginAdmin, resetData, scan, stationReady } from "./helpers";

const API_PORT = 8181;
const FE_PORT = 5182;
const FE = `http://localhost:${FE_PORT}`;
const NAME = "aicam-g4-tc1005-api";
const COMPOSE = resolve(process.cwd(), "../ai-cam-be/docker/compose.dev.yml");

let vite: ChildProcess | undefined;

async function waitUp(url: string, timeoutMs = 90_000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // chưa lên
    }
    if (Date.now() > until) throw new Error(`Không lên: ${url}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

function removeApi() {
  try {
    execFileSync("docker", ["rm", "-f", NAME], { stdio: "ignore" });
  } catch {
    // không có container
  }
}

test.beforeAll(async () => {
  test.setTimeout(150_000);
  removeApi();
  execFileSync(
    "docker",
    ["compose", "-f", COMPOSE, "run", "-d", "--rm", "--no-deps", "--name", NAME, "-p", `${API_PORT}:8000`,
      "-e", "ACCESS_TOKEN_MINUTES=1", "api"], // prettier-ignore
    { stdio: "ignore" },
  );
  vite = spawn("pnpm", ["exec", "vite", "--port", String(FE_PORT), "--strictPort"], {
    env: { ...process.env, API_URL: `http://localhost:${API_PORT}` },
    stdio: "ignore",
    detached: true,
  });
  await waitUp(`http://localhost:${API_PORT}/healthz`);
  await waitUp(FE);
});

test.afterAll(() => {
  if (vite?.pid) {
    try {
      process.kill(-vite.pid, "SIGTERM");
    } catch {
      // đã dừng
    }
  }
  removeApi();
});

test.beforeEach(() => resetData());

test("TC-10.05: access token 1 phút hết hạn → mỗi tab refresh theo client của mình, không ghi đè cookie của nhau", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  // Hai tab cùng một trình duyệt (chung kho cookie).
  const context = await browser.newContext({ baseURL: FE });
  const tabA = await context.newPage();
  const tabB = await context.newPage();
  const refreshes: string[] = [];
  context.on("request", (r) => {
    if (r.url().endsWith("/api/v1/auth/refresh")) refreshes.push(r.postData() ?? "");
  });

  // 1–2. Tab A station, tab B dashboard. Access token do API tạm cấp sống 1 phút.
  const login = tabA.waitForResponse((r) => r.url().endsWith("/api/v1/auth/login"));
  await stationReady(tabA);
  const { access_token } = (await (await login).json()) as { access_token: string };
  const claims = JSON.parse(Buffer.from(access_token.split(".")[1]!, "base64url").toString()) as {
    iat: number;
    exp: number;
  };
  expect(claims.exp - claims.iat).toBe(60);
  await loginAdmin(tabB, "tst_admin");
  const names = (await context.cookies()).map((c) => c.name);
  expect(names).toEqual(expect.arrayContaining(["rt_station", "rt_dashboard"]));
  refreshes.length = 0;

  // 3. Chờ 70 giây (access token 1 phút hết hạn).
  await tabA.waitForTimeout(70_000);

  // 4. Tab A quét → ĐANG ĐÓNG GÓI, không về màn đăng nhập station.
  await tabA.bringToFront();
  await tabA.locator("body").click({ position: { x: 5, y: 5 } });
  await scan(tabA, "SPXTST0000001");
  await expect(tabA.getByText("ĐANG ĐÓNG GÓI")).toBeVisible();
  await expect(tabA).toHaveURL(/\/station$/);

  // 5. Tab B tải lại /admin/settings/stations → danh sách station, URL không đổi.
  await tabB.bringToFront();
  await tabB.goto("/admin/settings/stations");
  await expect(tabB.getByText("TST Station 01").first()).toBeVisible();
  await expect(tabB).toHaveURL(/\/admin\/settings\/stations$/);

  // Đã refresh thật cho cả hai client; trình duyệt giữ cả hai cookie.
  expect(refreshes.some((b) => b.includes('"STATION"'))).toBe(true);
  expect(refreshes.some((b) => b.includes('"DASHBOARD"'))).toBe(true);
  const after = (await context.cookies()).map((c) => c.name);
  expect(after).toEqual(expect.arrayContaining(["rt_station", "rt_dashboard"]));
  await context.close();
});
