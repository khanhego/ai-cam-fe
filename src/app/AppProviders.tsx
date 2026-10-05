import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/features/auth/useAuth";
import { Toaster } from "@/shared/ui";

/**
 * Xóa toàn bộ cache khi người dùng đổi (đăng xuất dashboard / station, mất phiên `onUnauthenticated`, đăng nhập
 * tài khoản khác): dữ liệu và URL clip ký theo uid người trước không được dùng lại (review G3 F15, audit VIEW_CLIP).
 * Chờ một nhịp để route đã gỡ các trang cũ, tránh observer còn gắn tự gọi lại API không token.
 */
function useClearCacheOnUserChange(client: QueryClient) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = useAuth.subscribe((s, prev) => {
      const before = prev.me?.id ?? null;
      const after = s.me?.id ?? null;
      if (before && before !== after) {
        client.cancelQueries();
        clearTimeout(timer);
        timer = setTimeout(() => client.clear(), 0);
      }
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [client]);
}

/** Provider gốc dùng chung cho `main.tsx` và test (`renderApp`). */
export function AppProviders({ client, children }: { client: QueryClient; children: ReactNode }) {
  useClearCacheOnUserChange(client);
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
