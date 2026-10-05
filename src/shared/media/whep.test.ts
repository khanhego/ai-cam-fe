/** Client WHEP (DEC-22) với RTCPeerConnection + fetch giả lập — jsdom không có WebRTC. FR-01.05. */
import { connectWhep, sessionUrl, WhepError, type WhepStatus } from "./whep";

class FakePeer {
  iceGatheringState: RTCIceGatheringState = "complete";
  connectionState: RTCPeerConnectionState = "new";
  localDescription: { sdp: string } | null = null;
  remote: RTCSessionDescriptionInit | null = null;
  transceivers: [string, RTCRtpTransceiverInit][] = [];
  closed = false;
  ontrack: ((ev: { streams: MediaStream[]; track: MediaStreamTrack }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  addTransceiver(kind: string, init: RTCRtpTransceiverInit) {
    this.transceivers.push([kind, init]);
  }
  async createOffer() {
    return { type: "offer", sdp: "v=0 offer" };
  }
  async setLocalDescription(d: { sdp: string }) {
    this.localDescription = d;
  }
  async setRemoteDescription(d: RTCSessionDescriptionInit) {
    this.remote = d;
  }
  addEventListener() {}
  removeEventListener() {}
  close() {
    this.closed = true;
  }
  setState(s: RTCPeerConnectionState) {
    this.connectionState = s;
    this.onconnectionstatechange?.();
  }
}

function setup(responses: Response[], token = "tok") {
  const peer = new FakePeer();
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return responses.shift() ?? new Response(null, { status: 200 });
  }) as unknown as typeof fetch;
  const statuses: WhepStatus[] = [];
  const streams: MediaStream[] = [];
  let current = token;
  const refresh = vi.fn(async () => {
    current = "tok2";
    return true;
  });
  const run = () =>
    connectWhep(
      "/live/cam-1/whep",
      { onStream: (s) => streams.push(s), onStatus: (s) => statuses.push(s) },
      {
        createPeer: () => peer as unknown as RTCPeerConnection,
        fetch: fetchFn,
        getToken: () => current,
        refresh,
      },
    );
  return { peer, calls, statuses, streams, refresh, run };
}

// MediaMTX trả Location tính từ gốc của nó (không có tiền tố /live) — đã thấy khi kiểm tay với stack dev.
const answer = (status = 201) =>
  new Response("v=0 answer", { status, headers: { Location: "/cam-1/whep/abc" } });

test("TC-01.10 (logic): POST SDP offer kèm Bearer → đặt answer → connected = playing; đóng gửi DELETE Location", async () => {
  const { peer, calls, statuses, streams, run } = setup([answer()]);
  const session = await run();

  expect(peer.transceivers).toEqual([["video", { direction: "recvonly" }]]);
  expect(calls[0]!.url).toBe("/live/cam-1/whep");
  expect(calls[0]!.init.method).toBe("POST");
  expect(calls[0]!.init.body).toBe("v=0 offer");
  expect(calls[0]!.init.headers).toEqual({ "Content-Type": "application/sdp", Authorization: "Bearer tok" });
  expect(peer.remote).toEqual({ type: "answer", sdp: "v=0 answer" });
  expect(statuses).toEqual(["connecting"]);

  const stream = {} as MediaStream;
  peer.ontrack?.({ streams: [stream], track: {} as MediaStreamTrack });
  expect(streams).toEqual([stream]);
  peer.setState("connected");
  expect(statuses.at(-1)).toBe("playing");

  session.close();
  expect(peer.closed).toBe(true);
  expect(calls[1]!.init.method).toBe("DELETE");
  expect(calls[1]!.url).toBe("/live/cam-1/whep/abc");
  peer.setState("closed");
  expect(statuses.at(-1)).toBe("playing"); // đã đóng chủ động: không báo mất tín hiệu
});

test("TC-01.14 (logic): kết nối hỏng giữa chừng → lost", async () => {
  const { peer, statuses, run } = setup([answer()]);
  await run();
  peer.setState("connected");
  peer.setState("failed");
  expect(statuses.at(-1)).toBe("lost");
});

test("F35: ICE disconnected là tạm thời — tự về connected trong 5 giây thì không báo lost", async () => {
  vi.useFakeTimers();
  try {
    const { peer, statuses, run } = setup([answer()]);
    await run();
    peer.setState("connected");
    peer.setState("disconnected");
    vi.advanceTimersByTime(4000);
    expect(statuses.at(-1)).toBe("playing");
    peer.setState("connected");
    vi.advanceTimersByTime(5000);
    expect(statuses).not.toContain("lost");
  } finally {
    vi.useRealTimers();
  }
});

test("F35: ICE disconnected quá 5 giây → lost; failed → lost ngay", async () => {
  vi.useFakeTimers();
  try {
    const { peer, statuses, run } = setup([answer()]);
    await run();
    peer.setState("connected");
    peer.setState("disconnected");
    vi.advanceTimersByTime(4999);
    expect(statuses.at(-1)).toBe("playing");
    vi.advanceTimersByTime(1);
    expect(statuses.at(-1)).toBe("lost");

    const b = setup([answer()]);
    await b.run();
    b.peer.setState("connected");
    b.peer.setState("failed");
    expect(b.statuses.at(-1)).toBe("lost");
  } finally {
    vi.useRealTimers();
  }
});

test("F35: đóng chủ động trong lúc chờ phục hồi → không báo lost", async () => {
  vi.useFakeTimers();
  try {
    const { peer, statuses, run } = setup([answer(), new Response(null, { status: 200 })]);
    const session = await run();
    peer.setState("connected");
    peer.setState("disconnected");
    session.close();
    vi.advanceTimersByTime(6000);
    expect(statuses).not.toContain("lost");
  } finally {
    vi.useRealTimers();
  }
});

test("401 → refresh token một lần rồi gửi lại với token mới", async () => {
  const { calls, refresh, run } = setup([new Response(null, { status: 401 }), answer()]);
  await run();
  expect(refresh).toHaveBeenCalledTimes(1);
  expect((calls[1]!.init.headers as Record<string, string>).Authorization).toBe("Bearer tok2");
});

test("Camera không có luồng (404) → WhepError, kết nối được dọn", async () => {
  const { peer, run } = setup([new Response(null, { status: 404 })]);
  await expect(run()).rejects.toEqual(new WhepError(404, "WHEP 404"));
  expect(peer.closed).toBe(true);
});

test("sessionUrl: giữ tiền tố /live khi MediaMTX trả Location từ gốc của nó", () => {
  expect(sessionUrl("/live/cam-1/whep", "/cam-1/whep/f488")).toBe("/live/cam-1/whep/f488");
  expect(sessionUrl("/live/cam-1/whep", null)).toBeNull();
  expect(sessionUrl("/live/cam-1/whep", "/other/session")).toMatch(/^http:\/\/[^/]+\/other\/session$/);
});

test("track đến sau khi đã đóng → bỏ qua, không đè luồng của kết nối mới (E2E D11 màn đen chập chờn)", async () => {
  const { peer, streams, run } = setup([answer()]);
  const session = await run();

  session.close();
  peer.ontrack?.({ streams: [{} as MediaStream], track: {} as MediaStreamTrack });

  expect(streams).toEqual([]);
});
