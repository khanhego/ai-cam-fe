/** WS-02 `camera.status` → D6 làm mới (phát hiện khi chạy E2E với BE thật, TC-01.01). */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

import { useSession } from "@/lib/api/session";

import { useDashboardSocket } from "./useDashboardSocket";

class FakeSocket {
  static last: FakeSocket;
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  constructor(url: string) {
    this.url = url;
    FakeSocket.last = this;
  }
  send() {}
  close() {}
}

test("camera.status → invalidate ['stations'] và ['station', id]", () => {
  useSession.getState().setSession("tok", null);
  const client = new QueryClient();
  const spy = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  renderHook(() => useDashboardSocket((url) => new FakeSocket(url) as unknown as WebSocket), { wrapper });

  expect(FakeSocket.last.url).toContain("/ws/dashboard?token=tok");
  FakeSocket.last.onmessage?.({ data: JSON.stringify({ type: "camera.status", data: {}, at: "" }) });

  expect(spy).toHaveBeenCalledWith({ queryKey: ["stations"] });
  expect(spy).toHaveBeenCalledWith({ queryKey: ["station"] });
});
