/**
 * M6 (T-131) — đối chiếu contract station mở rộng mà MSW `StationSim` đang giả lập, chạy trên BE thật (02 §6.2 API-10,
 * API-60 `kind`, API-100, API-101). BE T-106 chưa xong lúc viết → bật bằng `E2E_M6_BE=1` khi BE có.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";

import { PASSWORD, resetData } from "./helpers";

test.skip(
  !process.env.E2E_M6_BE,
  "BE M6 (T-101..T-106) chưa có — đặt E2E_M6_BE=1 khi API-60 kind / API-100 / API-101 xong",
);

async function token(request: APIRequestContext, username: string, client: "STATION" | "DASHBOARD") {
  const res = await request.post("/api/v1/auth/login", { data: { username, password: PASSWORD, client } });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { access_token: string }).access_token;
}

test.beforeEach(() => resetData());

test("TC-01.30 (API) / TC-04.34 / TC-04.02: loại station, đổi chế độ, người kiểm theo contract mock", async ({
  request,
}) => {
  const admin = { Authorization: `Bearer ${await token(request, "tst_admin", "DASHBOARD")}` };
  const list = (await (await request.get("/api/v1/stations", { headers: admin })).json()) as {
    items: { id: string; name: string }[];
  };
  const st1 = list.items.find((s) => s.name === "TST Station 01")!;
  const patched = await request.patch(`/api/v1/stations/${st1.id}`, {
    headers: admin,
    data: { kind: "BOTH" },
  });
  expect(patched.ok()).toBe(true);

  const station = { Authorization: `Bearer ${await token(request, "tst_station01", "STATION")}` };
  const state = await (await request.get("/api/v1/station/state", { headers: station })).json();
  expect(state.station).toMatchObject({ kind: "BOTH", work_mode: "PACK", operator_name: null });
  expect(state).toHaveProperty("today_return_count");

  const mode = await request.put("/api/v1/station/work-mode", {
    headers: station,
    data: { work_mode: "RETURN" },
  });
  expect(mode.ok()).toBe(true);
  expect((await mode.json()).state.station.work_mode).toBe("RETURN");

  const short = await request.put("/api/v1/station/operator", { headers: station, data: { name: "L" } });
  expect(short.status()).toBe(422);
  const op = await request.put("/api/v1/station/operator", { headers: station, data: { name: "Lan QA" } });
  expect((await op.json()).state.station.operator_name).toBe("Lan QA");

  await request.patch(`/api/v1/stations/${st1.id}`, { headers: admin, data: { kind: "PACK" } });
  const notAllowed = await request.put("/api/v1/station/work-mode", {
    headers: station,
    data: { work_mode: "RETURN" },
  });
  expect(notAllowed.status()).toBe(409);
  expect((await notAllowed.json()).error.code).toBe("MODE_NOT_ALLOWED");
});
