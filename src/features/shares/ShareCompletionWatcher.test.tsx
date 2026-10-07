/**
 * G3-FE-2 — `ShareCompletionWatcher` (02b-admin §3 ShareLinkDialog, DEC-487): link chạy nền bị thu hồi → Toast riêng;
 * API-162 trả 4xx → bỏ khỏi danh sách theo dõi, dừng poll.
 */
import { act, screen, waitFor } from "@testing-library/react";
import { http } from "msw";

import { login } from "@/lib/api/auth";
import { apiError } from "@/mocks/http";
import { mockShares } from "@/mocks/sharesDb";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import { sharePoll, useBackgroundShares } from "./shareProgress";

beforeEach(async () => {
  sharePoll.ms = 20;
  await login("tst_cskh", "matkhau123", "DASHBOARD");
});
afterEach(() => {
  act(() => useBackgroundShares.setState({ pending: {} }));
});
afterAll(() => {
  sharePoll.ms = 2000;
});

test("link chạy nền bị thu hồi → Toast 'đã bị thu hồi' (không phải 'Không tạo được')", async () => {
  const share = mockShares.find((s) => s.status === "CREATING" || s.status === "ACTIVE")!;
  share.status = "REVOKED";
  renderApp("/admin/shares");
  act(() => useBackgroundShares.getState().add(share.id, "CSKH thu hồi"));
  expect(await screen.findByText('Link chia sẻ cho "CSKH thu hồi" đã bị thu hồi.')).toBeInTheDocument();
  expect(screen.queryByText(/Không tạo được link chia sẻ cho "CSKH thu hồi"/)).toBeNull();
  expect(useBackgroundShares.getState().pending).toEqual({});
});

test("API-162 404 → bỏ khỏi danh sách theo dõi, không poll tiếp, không Toast", async () => {
  let calls = 0;
  server.use(
    http.get("/api/v1/shares/:id", ({ params }) => {
      if (params.id !== "share-gone") return;
      calls += 1;
      return apiError(404, "NOT_FOUND", "Không tìm thấy link.");
    }),
  );
  renderApp("/admin/shares");
  act(() => useBackgroundShares.getState().add("share-gone", "CSKH mất link"));
  await waitFor(() => expect(useBackgroundShares.getState().pending).toEqual({}));
  const seen = calls;
  await new Promise((r) => setTimeout(r, 150));
  expect(calls).toBe(seen);
  expect(seen).toBe(1);
  expect(screen.queryByText(/CSKH mất link/)).toBeNull();
});
