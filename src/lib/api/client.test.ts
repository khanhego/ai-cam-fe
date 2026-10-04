import { http, HttpResponse } from "msw";

import { server } from "@/test/server";

import { login, fetchMe, logout } from "./auth";
import { api, onUnauthenticated } from "./client";
import { ApiError } from "./errors";
import { useSession } from "./session";

const API = "/api/v1";

test("đăng nhập station lưu token và user trong bộ nhớ", async () => {
  const user = await login("tst_station01", "matkhau123", "STATION");

  expect(user.station?.name).toBe("TST Station 01");
  expect(useSession.getState().accessToken).toMatch(/^mock\.u-st1\./);
  expect(useSession.getState().client).toBe("STATION");
});

test.each([
  ["tst_station01", "sai", "STATION", 401, "INVALID_CREDENTIALS"],
  ["tst_cskh", "matkhau123", "STATION", 403, "WRONG_CLIENT"],
  ["tst_disabled", "matkhau123", "DASHBOARD", 403, "ACCOUNT_DISABLED"],
  ["tst_locked", "matkhau123", "DASHBOARD", 423, "ACCOUNT_LOCKED"],
] as const)("đăng nhập %s/%s (%s) → %i %s", async (username, password, client, status, code) => {
  const err = await login(username, password, client).catch((e: unknown) => e);

  expect(err).toBeInstanceOf(ApiError);
  expect(err).toMatchObject({ status, code });
});

test("ACCOUNT_LOCKED có giờ mở khóa trong details", async () => {
  const err = (await login("tst_locked", "matkhau123", "DASHBOARD").catch((e: unknown) => e)) as ApiError;

  expect(typeof err.details.until).toBe("string");
});

test("gắn Bearer token cho request đã đăng nhập", async () => {
  await login("tst_cskh", "matkhau123", "DASHBOARD");

  const me = await fetchMe();

  expect(me.role).toBe("CSKH");
  expect(me.permissions).toContain("packages.read");
});

test("401 → refresh một lần rồi gửi lại", async () => {
  await login("tst_admin", "matkhau123", "DASHBOARD");
  useSession.getState().setAccessToken("mock.expired");

  const me = await fetchMe();

  expect(me.username).toBe("tst_admin");
  expect(useSession.getState().accessToken).toMatch(/^mock\.u-admin\./);
});

test("nhiều request cùng 401 chỉ gọi refresh một lần", async () => {
  await login("tst_admin", "matkhau123", "DASHBOARD");
  useSession.getState().setAccessToken("mock.expired");
  let refreshCalls = 0;
  server.events.on("request:start", ({ request }) => {
    if (request.url.endsWith("/auth/refresh")) refreshCalls += 1;
  });

  await Promise.all([fetchMe(), fetchMe(), fetchMe()]);

  expect(refreshCalls).toBe(1);
  server.events.removeAllListeners();
});

test("refresh thất bại → xóa phiên và báo về màn đăng nhập", async () => {
  useSession.getState().setSession("mock.expired", null);
  const listener = vi.fn();
  const off = onUnauthenticated(listener);

  const err = await fetchMe().catch((e: unknown) => e);

  expect(err).toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
  expect(useSession.getState().accessToken).toBeNull();
  expect(listener).toHaveBeenCalledOnce();
  off();
});

test("lỗi validate giữ lỗi theo field", async () => {
  server.use(
    http.post(`${API}/stations`, () =>
      HttpResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Dữ liệu không hợp lệ.",
            details: { fields: { name: "Bắt buộc" } },
          },
        },
        { status: 422 },
      ),
    ),
  );

  const err = (await api.post("/stations", { name: "" }).catch((e: unknown) => e)) as ApiError;

  expect(err.code).toBe("VALIDATION_ERROR");
  expect(err.fieldErrors).toEqual({ name: "Bắt buộc" });
});

test("5xx không có body → INTERNAL với chữ mặc định", async () => {
  server.use(http.get(`${API}/reports/daily`, () => new HttpResponse("oops", { status: 502 })));

  const err = (await api.get("/reports/daily").catch((e: unknown) => e)) as ApiError;

  expect(err).toMatchObject({
    status: 502,
    code: "INTERNAL",
    message: "Có lỗi hệ thống. Thử lại sau ít phút.",
  });
});

test("mất mạng → NETWORK_ERROR", async () => {
  server.use(http.get(`${API}/reports/daily`, () => HttpResponse.error()));

  const err = (await api.get("/reports/daily").catch((e: unknown) => e)) as ApiError;

  expect(err).toMatchObject({ status: 0, code: "NETWORK_ERROR" });
});

test("query bỏ giá trị rỗng", async () => {
  let url = "";
  server.use(
    http.get(`${API}/packages`, ({ request }) => {
      url = request.url;
      return HttpResponse.json({ items: [], page: 1, page_size: 20, total: 0 });
    }),
  );

  await api.get("/packages", {
    query: { q: "SPX", station_id: "", page: 1, source: undefined },
    auth: false,
  });

  expect(new URL(url).search).toBe("?q=SPX&page=1");
});

test("đăng xuất xóa phiên kể cả khi API lỗi", async () => {
  await login("tst_admin", "matkhau123", "DASHBOARD");
  server.use(http.post(`${API}/auth/logout`, () => HttpResponse.error()));

  await logout().catch(() => undefined);

  expect(useSession.getState().accessToken).toBeNull();
});
