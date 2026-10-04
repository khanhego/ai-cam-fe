import { ApiError, toApiError } from "./errors";
import { useSession } from "./session";

export const API_BASE = "/api/v1";

type Query = Record<string, string | number | boolean | undefined | null>;

export type RequestOptions = {
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
  /** false: không gắn token, không tự refresh (đăng nhập, refresh). */
  auth?: boolean;
  headers?: Record<string, string>;
};

type Listener = () => void;
const unauthenticatedListeners = new Set<Listener>();

/** Đăng ký xử lý khi refresh thất bại (guard chuyển về màn đăng nhập). */
export function onUnauthenticated(listener: Listener): () => void {
  unauthenticatedListeners.add(listener);
  return () => unauthenticatedListeners.delete(listener);
}

let refreshing: Promise<boolean> | null = null;

/** Một lần refresh cho mọi request cùng gặp 401 (02b-station §4). */
export function refreshAccessToken(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const { client, setAccessToken } = useSession.getState();
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { access_token: string };
      setAccessToken(data.access_token);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

function buildUrl(path: string, query?: Query): string {
  const url = `${API_BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function send(method: string, path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
  const token = useSession.getState().accessToken;
  if (opts.auth !== false && token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) {
    body = opts.body;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  try {
    return await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      body,
      signal: opts.signal,
      credentials: "same-origin",
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(0, "NETWORK_ERROR", "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.");
  }
}

/** Gọi API: gắn token, 401 → refresh một lần rồi gửi lại, lỗi → ApiError (02 §6). */
export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  let res = await send(method, path, opts);
  if (res.status === 401 && opts.auth !== false) {
    if (await refreshAccessToken()) {
      res = await send(method, path, opts);
    }
    if (res.status === 401) {
      useSession.getState().clear();
      unauthenticatedListeners.forEach((l) => l());
    }
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>("GET", path, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>("POST", path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("PUT", path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>("PATCH", path, { ...opts, body }),
  delete: <T>(path: string, opts?: RequestOptions) => request<T>("DELETE", path, opts),
};
