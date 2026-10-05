import { QueryCache, QueryClient } from "@tanstack/react-query";

import { isApiError } from "@/lib/api/errors";

/** Số lần thử lại tối đa của query khi lỗi mạng / 5xx (02b-admin §8). Mutation không tự thử lại. */
export const QUERY_RETRY_MAX = 2;

/** Chỉ lỗi tạm thời mới đáng thử lại: mạng (status 0) và 5xx. 4xx (403, 404, 409…) trả về ngay. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= QUERY_RETRY_MAX) return false;
  return isApiError(error) && (error.status === 0 || error.status >= 500);
}

/**
 * `meta` của query: `forbidden: "inline"` → màn tự xử lý 403, không chuyển sang D12
 * (mặc định mọi query 403 `FORBIDDEN` là query cấp trang — 02b-admin §8).
 */
export type QueryMeta = { forbidden?: "inline" };

export type QueryClientOptions = {
  /** Query trả 403 `FORBIDDEN` → gọi (app: chuyển `/admin/forbidden`). */
  onForbidden?: () => void;
  /** Test: 0 để không chờ backoff. */
  retryDelay?: number;
};

/** QueryClient dùng chung cho app và test (test chỉ đổi `retryDelay`, không tắt retry — review G3 F13). */
export function createQueryClient({ onForbidden, retryDelay }: QueryClientOptions = {}): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        const meta = query.meta as QueryMeta | undefined;
        if (
          isApiError(error) &&
          error.status === 403 &&
          error.code === "FORBIDDEN" &&
          meta?.forbidden !== "inline"
        )
          onForbidden?.();
      },
    }),
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        ...(retryDelay !== undefined ? { retryDelay } : {}),
      },
      mutations: { retry: false },
    },
  });
}

type NavRouter = {
  state: { location: { pathname: string } };
  navigate: (to: string, opts?: { replace?: boolean }) => unknown;
};

/** 403 ở trang dashboard → D12. Không áp cho station (stationStore tự xử lý) hay màn đăng nhập. */
export function forbiddenRedirect(router: NavRouter): () => void {
  return () => {
    const path = router.state.location.pathname;
    if (!path.startsWith("/admin") || path === "/admin/forbidden" || path === "/admin/login") return;
    void router.navigate("/admin/forbidden", { replace: true });
  };
}
