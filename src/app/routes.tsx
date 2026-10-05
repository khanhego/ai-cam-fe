import { lazy } from "react";
import { Navigate, Outlet, type RouteObject } from "react-router-dom";

import { RequireRole } from "@/features/auth/RequireRole";
import { AppShell } from "@/features/shell/AppShell";
import { ForbiddenPage, NotFoundPage } from "@/features/shell/ErrorPages";

/** Trang công cụ chỉ có khi `pnpm dev`; Vite thay `import.meta.env.DEV` = false lúc build nên nhánh này bị loại. */
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [{ path: "/_ui", Component: lazy(() => import("./UiGallery")) }]
  : [];

const DASHBOARD = ["ADMIN", "SUPERVISOR", "CSKH"] as const;

/** Route (02b-station §2, 02b-admin §2). Guard theo vai ở từng nhánh; server vẫn chặn bằng 403. */
export const routes: RouteObject[] = [
  { path: "/", element: <Navigate to="/admin" replace /> },
  { path: "/station/login", Component: lazy(() => import("@/features/station/StationLoginPage")) },
  {
    path: "/station",
    element: (
      <RequireRole roles={["STATION"]}>
        <Outlet />
      </RequireRole>
    ),
    children: [{ index: true, Component: lazy(() => import("@/features/station/StationPage")) }],
  },
  { path: "/admin/login", Component: lazy(() => import("@/features/admin/AdminLoginPage")) },
  {
    path: "/admin",
    element: (
      <RequireRole roles={[...DASHBOARD]}>
        <AppShell />
      </RequireRole>
    ),
    children: [
      { index: true, Component: lazy(() => import("@/features/reports/DailyPage")) },
      { path: "packages", Component: lazy(() => import("@/features/orders/PackagesPage")) },
      { path: "packages/:id", Component: lazy(() => import("@/features/orders/PackageDetailPage")) },
      {
        path: "approvals",
        element: (
          <RequireRole roles={["ADMIN", "SUPERVISOR"]}>
            <Outlet />
          </RequireRole>
        ),
        children: [{ index: true, Component: lazy(() => import("@/features/approvals/ApprovalsPage")) }],
      },
      {
        path: "settings/stations",
        element: (
          <RequireRole roles={["ADMIN"]}>
            <Outlet />
          </RequireRole>
        ),
        children: [
          { index: true, Component: lazy(() => import("@/features/admin/StationsListPage")) },
          { path: "new", Component: lazy(() => import("@/features/admin/StationEditPage")) },
          { path: ":id", Component: lazy(() => import("@/features/admin/StationEditPage")) },
        ],
      },
      { path: "forbidden", element: <ForbiddenPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
  ...devRoutes,
];
