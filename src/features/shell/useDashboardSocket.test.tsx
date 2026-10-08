/** WS-02 → invalidate query (02b-admin §4, DEC-20). TC-09.03 (phần FE): `report.updated` làm mới D2, throttle 2 giây (DEC-69). */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

import { useSession } from "@/lib/api/session";

import { REPORT_THROTTLE_MS, RETURNS_THROTTLE_MS, useDashboardSocket } from "./useDashboardSocket";

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

function setup(events?: { onApprovalCreated?: () => void }, client = new QueryClient()) {
  useSession.getState().setSession("tok", null);
  const spy = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  renderHook(() => useDashboardSocket((url) => new FakeSocket(url) as unknown as WebSocket, events), {
    wrapper,
  });
  const emit = (type: string, data: unknown = {}) =>
    FakeSocket.last.onmessage?.({ data: JSON.stringify({ type, data, at: "" }) });
  return { spy, emit, client };
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

test("TC-09.03: report.updated → làm mới D2 ngay, dồn sự kiện trong 2 giây thành 1 lần nữa (D2 ≤ 5 giây — DEC-69)", () => {
  vi.useFakeTimers();
  const { spy, emit } = setup();

  emit("report.updated", { date: "2026-10-04" });
  emit("report.updated", { date: "2026-10-04" });
  emit("report.updated", { date: "2026-10-04" });
  expect(calledWith(spy, ["daily"])).toBe(1);

  vi.advanceTimersByTime(REPORT_THROTTLE_MS - 1);
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

test("F34b: WS nối lại → làm mới ngay D13 + D2 (không đợi poll 60 giây); lần mở đầu thì không", async () => {
  vi.useFakeTimers();
  const { spy } = setup();
  FakeSocket.last.onopen?.();
  expect(calledWith(spy, ["approvals"])).toBe(0);

  const first = FakeSocket.last;
  first.onclose?.({ code: 1006 });
  await vi.advanceTimersByTimeAsync(1000);
  expect(FakeSocket.last).not.toBe(first);
  FakeSocket.last.onopen?.();

  expect(calledWith(spy, ["approvals"])).toBe(1);
  expect(calledWith(spy, ["daily"])).toBe(1);
});

test("DEC-69: ngưỡng throttle đủ nhỏ để D2 cập nhật ≤ 5 giây kể cả khi bị dồn", () => {
  expect(REPORT_THROTTLE_MS).toBeLessThanOrEqual(2000);
});

test("item 02: return.updated → D14 (throttle 2 giây) + D4 + D2; recon.updated → D15 + D4 + D2", () => {
  vi.useFakeTimers();
  const { spy, emit } = setup();
  emit("return.updated", { return_case_id: "rc-1", status: "RECEIVED_ISSUE" });
  emit("return.updated", { return_case_id: "rc-2", status: "EXPECTED" });
  expect(calledWith(spy, ["returns"])).toBe(1);
  expect(spy).toHaveBeenCalledWith({ queryKey: ["package"] });
  expect(spy).toHaveBeenCalledWith({ queryKey: ["daily"] });
  vi.advanceTimersByTime(RETURNS_THROTTLE_MS);
  expect(calledWith(spy, ["returns"])).toBe(2);

  emit("recon.updated", { summary: { open: { HIGH: 1, MEDIUM: 0, LOW: 0 } } });
  expect(spy).toHaveBeenCalledWith({ queryKey: ["recon"] });
});

test("item 02: claim.updated → D16 + D17 của đúng hồ sơ + D4 + D2; evidence_pack.updated → ghi trạng thái gói", () => {
  const { spy, emit, client } = setup();
  emit("claim.updated", { claim_id: "cl-1", status: "SUBMITTED", version: 4 });
  expect(spy).toHaveBeenCalledWith({ queryKey: ["claims"] });
  expect(spy).toHaveBeenCalledWith({ queryKey: ["claim", "cl-1"] });
  expect(spy).toHaveBeenCalledWith({ queryKey: ["package"] });

  client.setQueryData(["evidence-pack", "pack-1"], {
    id: "pack-1",
    status: "RUNNING",
    progress: 40,
    claim_id: "cl-1",
  });
  emit("evidence_pack.updated", { id: "pack-1", status: "READY", progress: 100 });
  expect(client.getQueryData(["evidence-pack", "pack-1"])).toEqual({
    id: "pack-1",
    status: "READY",
    progress: 100,
    claim_id: "cl-1",
  });
});

test("item 02: WS nối lại → làm mới thêm D14, D15, D16", async () => {
  vi.useFakeTimers();
  const { spy } = setup();
  FakeSocket.last.onopen?.();
  FakeSocket.last.onclose?.({ code: 1006 });
  await vi.advanceTimersByTimeAsync(1000);
  FakeSocket.last.onopen?.();
  for (const key of [["returns"], ["recon"], ["claims"]]) expect(calledWith(spy, key)).toBe(1);
});

test("item 03: share.updated → D21 + link đó + D4 / D17; backup.updated → D23 + D8 + D2; shop.updated → D7 + bộ lọc shop", () => {
  const { spy, emit } = setup();
  emit("share.updated", { share_id: "sh-1", status: "ACTIVE", progress: 100, step: null });
  for (const key of [["shares"], ["share", "sh-1"], ["package"], ["claim"]])
    expect(calledWith(spy, key)).toBe(1);
  emit("backup.updated", { state: "ON", pending: 3, last_db_success_at: null });
  for (const key of [["backup"], ["health"], ["daily"]]) expect(calledWith(spy, key)).toBe(1);
  emit("shop.updated", { shop_id: "s", auth_status: "CONNECTED", last_synced_at: null });
  for (const key of [["shops"], ["shopsBrief"]]) expect(calledWith(spy, key)).toBe(1);
  expect(calledWith(spy, ["daily"])).toBe(2);
});

test("item 03: WS nối lại → làm mới thêm D21, D23, D7", async () => {
  vi.useFakeTimers();
  const { spy } = setup();
  FakeSocket.last.onopen?.();
  FakeSocket.last.onclose?.({ code: 1006 });
  await vi.advanceTimersByTimeAsync(1000);
  FakeSocket.last.onopen?.();
  for (const key of [["shares"], ["backup"], ["shops"]]) expect(calledWith(spy, key)).toBe(1);
});
