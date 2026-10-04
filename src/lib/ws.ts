import { refreshAccessToken } from "./api/client";
import { useSession } from "./api/session";

/** Sự kiện server → client (02 §6 WS-01, WS-02). */
export type WsMessage = { type: string; data: unknown; at: string };
export type WsStatus = "connecting" | "open" | "lost";

export type WsOptions = {
  path: "/ws/station" | "/ws/dashboard";
  onMessage: (msg: WsMessage) => void;
  onStatus?: (status: WsStatus, since: number | null) => void;
  /** Cho test: thay WebSocket. */
  socketFactory?: (url: string) => WebSocket;
  pingMs?: number;
};

const BACKOFF_MS = [1000, 2000, 4000, 8000];
/** Mã đóng do token hết hạn (02a WS: 4401). */
const CLOSE_TOKEN_EXPIRED = 4401;

function wsUrl(path: string, token: string): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${path}?token=${encodeURIComponent(token)}`;
}

/** WebSocket tự nối lại (backoff 1, 2, 4, 8 giây), ping 20 giây, refresh token khi bị đóng 4401. */
export function connectWs(opts: WsOptions): { close: () => void } {
  const factory = opts.socketFactory ?? ((url: string) => new WebSocket(url));
  const pingMs = opts.pingMs ?? 20_000;
  let socket: WebSocket | null = null;
  let attempt = 0;
  let stopped = false;
  let lostSince: number | null = null;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const status = (s: WsStatus) => opts.onStatus?.(s, lostSince);

  function scheduleReconnect() {
    if (stopped) return;
    lostSince ??= Date.now();
    status("lost");
    const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!;
    attempt += 1;
    retryTimer = setTimeout(open, delay);
  }

  function open() {
    if (stopped) return;
    const token = useSession.getState().accessToken;
    if (!token) {
      scheduleReconnect();
      return;
    }
    status("connecting");
    socket = factory(wsUrl(opts.path, token));
    socket.onopen = () => {
      attempt = 0;
      lostSince = null;
      status("open");
      pingTimer = setInterval(() => socket?.send(JSON.stringify({ type: "ping" })), pingMs);
    };
    socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as WsMessage;
        if (msg.type !== "pong") opts.onMessage(msg);
      } catch {
        // bỏ qua khung không phải JSON
      }
    };
    socket.onclose = async (ev) => {
      clearInterval(pingTimer);
      socket = null;
      if (stopped) return;
      if (ev.code === CLOSE_TOKEN_EXPIRED) await refreshAccessToken();
      scheduleReconnect();
    };
  }

  open();
  return {
    close() {
      stopped = true;
      clearInterval(pingTimer);
      clearTimeout(retryTimer);
      socket?.close();
    },
  };
}
