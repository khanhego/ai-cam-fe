/**
 * Client WHEP tối giản (DEC-22, 02b-admin §3 `CameraTile`): `RTCPeerConnection` recvonly + POST SDP offer tới
 * `whep_url` (API-65) kèm `Authorization: Bearer` (Caddy `forward_auth`), nhận SDP answer, đóng bằng DELETE `Location`.
 * Không thư viện. Phụ thuộc trình duyệt (`RTCPeerConnection`, `fetch`) được tiêm vào để unit test bằng giả lập.
 */
export type WhepStatus = "connecting" | "playing" | "lost" | "unsupported";

export class WhepError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "WhepError";
    this.status = status;
  }
}

export type WhepDeps = {
  createPeer?: () => RTCPeerConnection;
  fetch?: typeof fetch;
  /** Token hiện tại; gọi lại sau `refresh()`. */
  getToken: () => string | null;
  /** 401 → refresh một lần rồi gửi lại. */
  refresh?: () => Promise<boolean>;
  /** Chờ gom ICE tối đa (ms) trước khi gửi offer — MediaMTX nhận offer không trickle. */
  iceGatherMs?: number;
};

export type WhepSession = { close: () => void };

/**
 * URL phiên WHEP để DELETE. MediaMTX trả `Location: /<path>/whep/<id>` tính từ gốc của nó, nhưng trình duyệt gọi qua
 * tiền tố `/live` (Caddy / proxy dev) → ghép `<id>` vào sau `whep_url` thay vì dùng thẳng đường dẫn tuyệt đối.
 */
export function sessionUrl(whepUrl: string, location: string | null): string | null {
  if (!location) return null;
  const i = location.lastIndexOf("/whep/");
  if (i >= 0) return `${whepUrl.replace(/\/+$/, "")}/${location.slice(i + "/whep/".length)}`;
  return new URL(location, new URL(whepUrl, globalThis.location?.href ?? "http://localhost")).toString();
}

export const whepSupported = () =>
  typeof window !== "undefined" && typeof window.RTCPeerConnection === "function";

function waitIceGathering(pc: RTCPeerConnection, ms: number): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => pc.iceGatheringState === "complete" && done();
    const timer = setTimeout(done, ms);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

/**
 * Mở luồng xem trực tiếp. `onStream` nhận MediaStream khi có track; `onStatus` báo `playing` khi kết nối ICE xong,
 * `lost` khi kết nối hỏng / bị đóng. Lỗi lúc bắt tay (HTTP ≠ 201, SDP lỗi) → reject `WhepError` và đã dọn kết nối.
 */
export async function connectWhep(
  url: string,
  handlers: { onStream: (stream: MediaStream) => void; onStatus: (status: WhepStatus) => void },
  deps: WhepDeps,
): Promise<WhepSession> {
  const createPeer = deps.createPeer ?? (() => new RTCPeerConnection());
  const doFetch = deps.fetch ?? fetch.bind(globalThis);
  const pc = createPeer();
  let closed = false;
  let location: string | null = null;

  /** Báo server giải phóng phiên WHEP (best effort). */
  const release = () => {
    if (!location) return;
    const token = deps.getToken();
    void doFetch(location, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).catch(() => undefined);
  };
  const close = () => {
    if (closed) return;
    closed = true;
    pc.close();
    release();
  };

  pc.addTransceiver("video", { direction: "recvonly" });
  pc.ontrack = (ev) => handlers.onStream(ev.streams[0] ?? new MediaStream([ev.track]));
  pc.onconnectionstatechange = () => {
    if (closed) return;
    const s = pc.connectionState;
    if (s === "connected") handlers.onStatus("playing");
    else if (s === "failed" || s === "disconnected" || s === "closed") handlers.onStatus("lost");
  };

  try {
    handlers.onStatus("connecting");
    await pc.setLocalDescription(await pc.createOffer());
    await waitIceGathering(pc, deps.iceGatherMs ?? 2000);
    const offer = pc.localDescription?.sdp ?? "";
    const post = () => {
      const token = deps.getToken();
      return doFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/sdp",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: offer,
      });
    };
    let res = await post();
    if (res.status === 401 && deps.refresh && (await deps.refresh())) res = await post();
    if (res.status !== 201 && res.status !== 200) throw new WhepError(res.status, `WHEP ${res.status}`);
    location = sessionUrl(url, res.headers.get("Location"));
    // Đã đóng (rời trang) trong lúc chờ answer → chỉ còn giải phóng phía server.
    if (closed) {
      release();
      return { close };
    }
    await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
  } catch (e) {
    close();
    throw e instanceof WhepError ? e : new WhepError(0, e instanceof Error ? e.message : String(e));
  }
  return { close };
}
