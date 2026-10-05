import { render } from "@testing-library/react";
import { Suspense } from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

import { AppProviders } from "@/app/AppProviders";
import { createQueryClient, forbiddenRedirect } from "@/app/queryClient";
import { routes } from "@/app/routes";

/**
 * Render toàn bộ router của app tại một đường dẫn (có lazy route, QueryClient riêng mỗi test). Cùng cấu hình
 * QueryClient với app (`createQueryClient`: retry chỉ mạng / 5xx, 403 → D12) — chỉ bỏ thời gian chờ retry.
 */
export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const queryClient = createQueryClient({ onForbidden: forbiddenRedirect(router), retryDelay: 0 });
  render(
    <AppProviders client={queryClient}>
      <Suspense fallback={null}>
        <RouterProvider router={router} />
      </Suspense>
    </AppProviders>,
  );
  return Object.assign(router, { queryClient });
}
