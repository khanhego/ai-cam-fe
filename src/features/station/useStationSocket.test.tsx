/** Review M1 #8: mất WS > 5 giây → S6, kể cả khi hook đang thử nối lại liên tục. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

import { login } from "@/lib/api/auth";

import { resetStationStore, useStationStore } from "./stationStore";
import { useStationSocket, WS_LOST_MS } from "./useStationSocket";

class FakeSocket {
  static all: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number }) => void | Promise<void>) | null = null;
  constructor() {
    FakeSocket.all.push(this);
  }
  send() {}
  close() {}
}
const factory = () => new FakeSocket() as unknown as WebSocket;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

beforeEach(async () => {
  FakeSocket.all = [];
  resetStationStore();
  await login("tst_station01", "matkhau123", "STATION");
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

test("thử nối lại mỗi 1–2 giây vẫn báo mất kết nối sau 5 giây", async () => {
  renderHook(() => useStationSocket(factory), { wrapper });
  FakeSocket.all[0]!.onopen?.();

  await FakeSocket.all[0]!.onclose?.({ code: 1006 });
  await vi.advanceTimersByTimeAsync(1000); // lần thử 1 → "connecting"
  await FakeSocket.all[1]!.onclose?.({ code: 1006 });
  await vi.advanceTimersByTimeAsync(2000); // lần thử 2
  await FakeSocket.all[2]!.onclose?.({ code: 1006 });
  expect(useStationStore.getState().wsLost).toBe(false);

  await vi.advanceTimersByTimeAsync(WS_LOST_MS - 3000);

  expect(useStationStore.getState().wsLost).toBe(true);
});

test("nối lại được trước 5 giây → không báo mất", async () => {
  renderHook(() => useStationSocket(factory), { wrapper });
  FakeSocket.all[0]!.onopen?.();
  await FakeSocket.all[0]!.onclose?.({ code: 1006 });
  await vi.advanceTimersByTimeAsync(1000);
  FakeSocket.all[1]!.onopen?.();

  await vi.advanceTimersByTimeAsync(10_000);

  expect(useStationStore.getState().wsLost).toBe(false);
});
