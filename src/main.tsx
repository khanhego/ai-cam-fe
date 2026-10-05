import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import { AppProviders } from "@/app/AppProviders";
import { createQueryClient, forbiddenRedirect } from "@/app/queryClient";
import { routes } from "@/app/routes";

import "./fonts";
import "./index.css";

// Mất phiên (refresh thất bại) → `useAuth` xóa user (guard về màn đăng nhập), `AppProviders` xóa cache (02b §8: 401).
const router = createBrowserRouter(routes);
const queryClient = createQueryClient({ onForbidden: forbiddenRedirect(router) });

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
    <AppProviders client={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
