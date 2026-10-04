import { useSession } from "./api/session";
import { connectWs, type WsMessage } from "./ws";

/** WebSocket giả để điều khiển open / message / close. */
class FakeSocket {
  static all: FakeSocket[] = [];
  url: string;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number }) => void | Promise<void>) | null = null;
  constructor(url: string) {
    this.url = url;
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {}
}

const factory = (url: string) => new FakeSocket(url) as unknown as WebSocket;

beforeEach(() => {
  FakeSocket.all = [];
  vi.useFakeTimers();
  useSession.getState().setSession("tok-1", null);
});
afterEach(() => vi.useRealTimers());

test("gửi token qua query, nhận message, bỏ qua pong", () => {
  const messages: WsMessage[] = [];
  const conn = connectWs({ path: "/ws/station", onMessage: (m) => messages.push(m), socketFactory: factory });
  const sock = FakeSocket.all[0]!;

  sock.onopen?.();
  sock.onmessage?.({ data: JSON.stringify({ type: "pong", data: null, at: "" }) });
  sock.onmessage?.({ data: JSON.stringify({ type: "station.state", data: { state: "READY" }, at: "" }) });
  sock.onmessage?.({ data: "không phải json" });

  expect(sock.url).toMatch(/\/ws\/station\?token=tok-1$/);
  expect(messages.map((m) => m.type)).toEqual(["station.state"]);
  conn.close();
});

test("ping mỗi 20 giây khi đang mở", () => {
  const conn = connectWs({ path: "/ws/dashboard", onMessage: () => {}, socketFactory: factory });
  const sock = FakeSocket.all[0]!;
  sock.onopen?.();

  vi.advanceTimersByTime(40_000);

  expect(sock.sent).toEqual([JSON.stringify({ type: "ping" }), JSON.stringify({ type: "ping" })]);
  conn.close();
});

test("mất kết nối → báo lost và nối lại theo backoff 1, 2, 4, 8, 8 giây", async () => {
  const statuses: string[] = [];
  const conn = connectWs({
    path: "/ws/station",
    onMessage: () => {},
    onStatus: (s) => statuses.push(s),
    socketFactory: factory,
  });

  for (const delay of [1000, 2000, 4000, 8000, 8000]) {
    const before = FakeSocket.all.length;
    await FakeSocket.all.at(-1)!.onclose?.({ code: 1006 });
    vi.advanceTimersByTime(delay - 1);
    expect(FakeSocket.all.length).toBe(before);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.all.length).toBe(before + 1);
  }
  expect(statuses).toContain("lost");
  conn.close();
});

test("kết nối lại thành công thì backoff về 1 giây", async () => {
  const conn = connectWs({ path: "/ws/station", onMessage: () => {}, socketFactory: factory });
  await FakeSocket.all[0]!.onclose?.({ code: 1006 });
  vi.advanceTimersByTime(1000);
  FakeSocket.all[1]!.onopen?.();

  await FakeSocket.all[1]!.onclose?.({ code: 1006 });
  vi.advanceTimersByTime(1000);

  expect(FakeSocket.all).toHaveLength(3);
  conn.close();
});

test("close() dừng hẳn, không nối lại", async () => {
  const conn = connectWs({ path: "/ws/station", onMessage: () => {}, socketFactory: factory });

  conn.close();
  await FakeSocket.all[0]!.onclose?.({ code: 1000 });
  vi.advanceTimersByTime(60_000);

  expect(FakeSocket.all).toHaveLength(1);
});
