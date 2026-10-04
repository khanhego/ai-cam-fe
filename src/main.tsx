import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import { routes } from "@/app/routes";
import { useAuth } from "@/features/auth/useAuth";
import { onUnauthenticated } from "@/lib/api/client";
import { Toaster } from "@/shared/ui";

import "./fonts";
import "./index.css";

const queryClient = new QueryClient();

// Refresh thất bại → xóa user; guard tự chuyển về màn đăng nhập (02b §8: 401).
onUnauthenticated(() => useAuth.setState({ me: null, status: "ready" }));
const router = createBrowserRouter(routes);

async function enableMocks() {
  // MSW chỉ khi `pnpm dev:mock` (VITE_MOCK=1); import động nên không vào bundle production (DEC-19).
  if (import.meta.env.DEV && import.meta.env.VITE_MOCK === "1") {
    const { worker } = await import("@/mocks/browser");
    await worker.start({ onUnhandledFrame: "bypass" });
  }
}

await enableMocks();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
);
