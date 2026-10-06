import { http, HttpResponse } from "msw";

import {
  MOCK_PASSWORD,
  mockRefresh,
  mockUsers,
  PERMISSIONS,
  publicUser,
  tokenFor,
  userFromAuth,
} from "../db";
import { API, apiError } from "../http";
import { stationSim } from "../stationSim";

type LoginBody = { username: string; password: string; client: "STATION" | "DASHBOARD" };

/** API-01..04 theo 02 §6.2. */
export const authHandlers = [
  http.post(`${API}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as LoginBody;
    const user = mockUsers.find((u) => u.username === body.username?.toLowerCase());
    if (!user || body.password !== (user.password ?? MOCK_PASSWORD)) {
      return apiError(401, "INVALID_CREDENTIALS", "Sai tài khoản hoặc mật khẩu.");
    }
    if (user.disabled) return apiError(403, "ACCOUNT_DISABLED", "Tài khoản đã bị khóa. Liên hệ Admin.");
    if (user.locked) {
      return apiError(423, "ACCOUNT_LOCKED", "Đăng nhập sai quá nhiều lần.", {
        until: new Date(Date.now() + 15 * 60_000).toISOString(),
      });
    }
    if ((body.client === "STATION") !== (user.role === "STATION")) {
      return apiError(403, "WRONG_CLIENT", "Tài khoản không dùng cho khu vực này.");
    }
    mockRefresh.set(body.client, user.id);
    return HttpResponse.json({ access_token: tokenFor(user.id), expires_in: 900, user: publicUser(user) });
  }),

  http.post(`${API}/auth/refresh`, async ({ request }) => {
    const { client } = (await request.json()) as { client: "STATION" | "DASHBOARD" };
    const userId = mockRefresh.get(client);
    if (!userId) return apiError(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn. Đăng nhập lại.");
    return HttpResponse.json({ access_token: tokenFor(userId), expires_in: 900 });
  }),

  http.post(`${API}/auth/logout`, ({ request }) => {
    const user = userFromAuth(request.headers.get("Authorization"));
    if (user) mockRefresh.delete(user.role === "STATION" ? "STATION" : "DASHBOARD");
    // BR-28 (02 §6.3 #17): station đăng xuất → xóa tên người kiểm.
    if (user?.role === "STATION") stationSim.clearOperator();
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${API}/me`, ({ request }) => {
    const user = userFromAuth(request.headers.get("Authorization"));
    if (!user) return apiError(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn. Đăng nhập lại.");
    const pub = publicUser(user);
    // item 02: `/me` station có `kind`, `work_mode` (BE T-106).
    const station =
      pub.station?.id === "st-1"
        ? { ...pub.station, kind: stationSim.kind, work_mode: stationSim.workMode }
        : pub.station;
    return HttpResponse.json({ ...pub, station, permissions: PERMISSIONS[user.role] });
  }),
];
