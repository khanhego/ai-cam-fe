/**
 * Review G3 F15: đăng xuất (dashboard, station) và mất phiên xóa toàn bộ cache; URL clip ký theo uid nằm trong
 * query key — người đăng nhập sau không dùng lại URL / dữ liệu của người trước (audit VIEW_CLIP đúng người).
 */
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { login } from "@/lib/api/auth";
import { signalUnauthenticated } from "@/lib/api/client";
import { resetStationStore } from "@/features/station/stationStore";
import { sound } from "@/features/station/sound";
import { renderApp } from "@/test/render";

vi.spyOn(sound, "play").mockImplementation(() => {});
vi.spyOn(sound, "stop").mockImplementation(() => {});

const clipUrlKeys = (r: ReturnType<typeof renderApp>) =>
  r.queryClient
    .getQueryCache()
    .findAll({ queryKey: ["clip-url"] })
    .map((q) => q.queryKey);

async function openPackage() {
  await login("tst_cskh", "matkhau123", "DASHBOARD");
  const r = renderApp("/admin/packages/pkg-0000001");
  await screen.findByLabelText("Cam 1");
  return r;
}

test("D4: URL clip được cache theo uid người xem", async () => {
  const r = await openPackage();
  await waitFor(() => expect(clipUrlKeys(r)).toContainEqual(["clip-url", "u-cskh", "clip-0000001-1-1"]));
});

test("Đăng xuất dashboard → cache trống, về màn đăng nhập", async () => {
  const r = await openPackage();
  expect(r.queryClient.getQueryCache().getAll().length).toBeGreaterThan(0);

  await userEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));

  await waitFor(() => expect(r.state.location.pathname).toBe("/admin/login"));
  await waitFor(() => expect(clipUrlKeys(r)).toEqual([]));
  expect(r.queryClient.getQueryCache().find({ queryKey: ["package"] })).toBeUndefined();
});

test("Mất phiên (onUnauthenticated) → cache trống", async () => {
  const r = await openPackage();

  act(() => signalUnauthenticated());

  await waitFor(() => expect(r.state.location.pathname).toBe("/admin/login"));
  await waitFor(() => expect(clipUrlKeys(r)).toEqual([]));
  expect(r.queryClient.getQueryCache().find({ queryKey: ["package"] })).toBeUndefined();
});

test("Station: giữ nút đăng xuất 3 giây → cache trống", async () => {
  resetStationStore();
  await login("tst_station01", "matkhau123", "STATION");
  const r = renderApp("/station");
  expect(await screen.findByText("SẴN SÀNG")).toBeInTheDocument();
  await waitFor(() => expect(r.queryClient.getQueryCache().getAll().length).toBeGreaterThan(0));

  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    fireEvent.pointerDown(screen.getByRole("button", { name: /Đăng xuất/ }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
  } finally {
    vi.useRealTimers();
  }

  await waitFor(() => expect(r.state.location.pathname).toBe("/station/login"));
  await waitFor(() => expect(r.queryClient.getQueryCache().getAll()).toEqual([]));
});
