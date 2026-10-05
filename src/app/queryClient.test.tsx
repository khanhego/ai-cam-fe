/** Cấu hình QueryClient chung (02b-admin §8, review G3 F13): retry chỉ mạng / 5xx ≤ 2 lần, 403 trang → D12, 404 ngay. */
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { ApiError } from "@/lib/api/errors";
import { login } from "@/lib/api/auth";
import { apiError } from "@/mocks/http";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import { shouldRetryQuery } from "./queryClient";

test("shouldRetryQuery: mạng (0) và 5xx thử lại tối đa 2 lần; 4xx không thử lại", () => {
  const net = new ApiError(0, "NETWORK_ERROR", "x");
  const s500 = new ApiError(503, "INTERNAL", "x");
  expect(shouldRetryQuery(0, net)).toBe(true);
  expect(shouldRetryQuery(1, s500)).toBe(true);
  expect(shouldRetryQuery(2, s500)).toBe(false);
  for (const [status, code] of [
    [400, "VALIDATION_ERROR"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [409, "CLIP_NOT_READY"],
    [429, "RATE_LIMITED"],
  ] as const)
    expect(shouldRetryQuery(0, new ApiError(status, code, "x"))).toBe(false);
  expect(shouldRetryQuery(0, new Error("x"))).toBe(false);
});

test("403 FORBIDDEN ở query cấp trang → /admin/forbidden (D12), không thử lại", async () => {
  await login("tst_cskh", "matkhau123", "DASHBOARD");
  let calls = 0;
  server.use(
    http.get("/api/v1/packages", () => {
      calls += 1;
      return apiError(403, "FORBIDDEN", "Tài khoản không có quyền thực hiện thao tác này.");
    }),
  );
  const router = renderApp("/admin/packages");

  expect(await screen.findByText("Tài khoản của bạn không có quyền xem trang này.")).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/admin/forbidden");
  expect(calls).toBe(1);
});

test("404 → 'Không tìm thấy kiện.' ngay, chỉ 1 request", async () => {
  await login("tst_cskh", "matkhau123", "DASHBOARD");
  let calls = 0;
  server.use(
    http.get("/api/v1/packages/:id", () => {
      calls += 1;
      return apiError(404, "NOT_FOUND", "Không tìm thấy kiện.");
    }),
  );
  renderApp("/admin/packages/pkg-x");

  expect(await screen.findByText("Không tìm thấy kiện.")).toBeInTheDocument();
  expect(calls).toBe(1);
});

test("lỗi mạng 2 lần rồi thành công → tự thử lại, không hiện lỗi", async () => {
  await login("tst_cskh", "matkhau123", "DASHBOARD");
  let calls = 0;
  server.use(
    http.get("/api/v1/packages", () => {
      calls += 1;
      return calls <= 2 ? HttpResponse.error() : undefined;
    }),
  );
  renderApp("/admin/packages");

  expect(await screen.findByRole("table")).toBeInTheDocument();
  expect(calls).toBe(3);
  await waitFor(() => expect(screen.queryByText("Không tải được danh sách kiện.")).not.toBeInTheDocument());
});
