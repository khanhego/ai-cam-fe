import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { Suspense } from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

import { routes } from "@/app/routes";
import { Toaster } from "@/shared/ui";

/** Render toàn bộ router của app tại một đường dẫn (có lazy route, QueryClient riêng mỗi test). */
export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={null}>
        <RouterProvider router={router} />
      </Suspense>
      <Toaster />
    </QueryClientProvider>,
  );
  return router;
}
