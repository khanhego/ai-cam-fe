/** WS-02 → invalidate query (02b-admin §4, DEC-20). TC-09.03 (phần FE): `report.updated` làm mới D2, throttle 5 giây. */
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

function setup(events?: { onApprovalCreated?: () => void }) {
  useSession.getState().setSession("tok", null);
  const client = new QueryClient();
  const spy = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  renderHook(() => useDashboardSocket((url) => new FakeSocket(url) as unknown as WebSocket, events), {
    wrapper,
  });
  const emit = (type: string, data: unknown = {}) =>
    FakeSocket.last.onmessage?.({ data: JSON.stringify({ type, data, at: "" }) });
  return { spy, emit };
}

const calledWith = (spy: { mock: { calls: unknown[][] } }, key: unknown[]) =>
  spy.mock.calls.filter(
    ([arg]) => JSON.stringify((arg as { queryKey: unknown }).queryKey) === JSON.stringify(key),
  ).length;

afterEach(() => vi.useRealTimers());

test("camera.status → invalidate ['stations'], ['station', id] và D2", () => {
  const { spy, emit } = setup();

  expect(FakeSocket.last.url).toContain("/ws/dashboard?token=tok");
  emit("camera.status");

  expect(spy).toHaveBeenCalledWith({ queryKey: ["stations"] });
  expect(spy).toHaveBeenCalledWith({ queryKey: ["station"] });
  expect(spy).toHaveBeenCalledWith({ queryKey: ["daily"] });
});

test("TC-09.03: report.updated → làm mới D2 ngay, dồn sự kiện trong 5 giây thành 1 lần nữa", () => {
  vi.useFakeTimers();
  const { spy, emit } = setup();

  emit("report.updated", { date: "2026-10-04" });
  emit("report.updated", { date: "2026-10-04" });
  emit("report.updated", { date: "2026-10-04" });
  expect(calledWith(spy, ["daily"])).toBe(1);

  vi.advanceTimersByTime(4999);
  expect(calledWith(spy, ["daily"])).toBe(1);
  vi.advanceTimersByTime(1);
  expect(calledWith(spy, ["daily"])).toBe(2);

  vi.advanceTimersByTime(10_000);
  expect(calledWith(spy, ["daily"])).toBe(2);
});

test("session.* / clip.* → làm mới tra cứu và chi tiết kiện; export.updated → bản xuất đó", () => {
  const { spy, emit } = setup();

  emit("session.clip_ready", { session_id: "s1", clip_ids: ["c1"] });
  expect(spy).toHaveBeenCalledWith({ queryKey: ["package"] });
  expect(spy).toHaveBeenCalledWith({ queryKey: ["packages"] });

  emit("export.updated", { id: "exp-1", status: "READY" });
  expect(spy).toHaveBeenCalledWith({ queryKey: ["export", "exp-1"] });

  emit("approval.created", { id: "a1" });
  expect(spy).toHaveBeenCalledWith({ queryKey: ["approvals"] });
});

test("TC-03.40 (âm báo): approval.created gọi onApprovalCreated; approval.resolved chỉ làm mới D13 + D2", () => {
  const onApprovalCreated = vi.fn();
  const { spy, emit } = setup({ onApprovalCreated });

  emit("approval.resolved", { id: "a1", status: "RESOLVED" });
  expect(onApprovalCreated).not.toHaveBeenCalled();
  expect(spy).toHaveBeenCalledWith({ queryKey: ["approvals"] });
  expect(spy).toHaveBeenCalledWith({ queryKey: ["daily"] });

  emit("approval.created", { id: "a2" });
  expect(onApprovalCreated).toHaveBeenCalledTimes(1);
});
