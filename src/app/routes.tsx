import { lazy } from "react";
import { Navigate, Outlet, type RouteObject } from "react-router-dom";

import { RequireRole } from "@/features/auth/RequireRole";
import { AppShell } from "@/features/shell/AppShell";
import { ForbiddenPage, NotFoundPage } from "@/features/shell/ErrorPages";

import { LegacyShopeeRedirect } from "./LegacyShopeeRedirect";

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
      // item 02 (02b-admin §1, DEC-342): D14 (T-153), D15 (T-156), D16 (T-157), D17 (T-158).
      { path: "returns", Component: lazy(() => import("@/features/returns/ReturnsPage")) },
      { path: "recon", Component: lazy(() => import("@/features/reconciliation/ReconPage")) },
      { path: "claims", Component: lazy(() => import("@/features/claims/ClaimsPage")) },
      { path: "claims/:id", Component: lazy(() => import("@/features/claims/ClaimDetailPage")) },
      // item 03: D20 Báo cáo (T-254; tab Năng suất kiểm vai trong trang — 02b-admin §2).
      { path: "reports", Component: lazy(() => import("@/features/reports/ReportsPage")) },
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
        path: "imports",
        element: (
          <RequireRole roles={["ADMIN", "SUPERVISOR"]}>
            <Outlet />
          </RequireRole>
        ),
        children: [{ index: true, Component: lazy(() => import("@/features/imports/ImportsPage")) }],
      },
      {
        path: "live",
        element: (
          <RequireRole roles={["ADMIN", "SUPERVISOR"]}>
            <Outlet />
          </RequireRole>
        ),
        children: [{ index: true, Component: lazy(() => import("@/features/liveview/LivePage")) }],
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
      {
        path: "settings",
        element: (
          <RequireRole roles={["ADMIN"]}>
            <Outlet />
          </RequireRole>
        ),
        children: [
          // D7 Kết nối sàn (T-253). D22 / D23 thêm route ở T-258 / T-259.
          { path: "platforms", Component: lazy(() => import("@/features/platforms/PlatformsPage")) },
          { path: "shopee", element: <LegacyShopeeRedirect /> },
          { path: "storage", Component: lazy(() => import("@/features/settings/StoragePage")) },
          { path: "users", Component: lazy(() => import("@/features/users/UsersPage")) },
          { path: "audit", Component: lazy(() => import("@/features/audit/AuditPage")) },
        ],
      },
      { path: "forbidden", element: <ForbiddenPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
  ...devRoutes,
];
