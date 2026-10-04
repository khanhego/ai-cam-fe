import { lazy } from "react";
import { Navigate, type RouteObject } from "react-router-dom";

import { ShellPlaceholder } from "./ShellPlaceholder";

/** Trang công cụ chỉ có khi `pnpm dev`; Vite thay `import.meta.env.DEV` = false lúc build nên nhánh này bị loại. */
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [{ path: "/_ui", Component: lazy(() => import("./UiGallery")) }]
  : [];

/**
 * Khung route (02b-station §2, 02b-admin §2). Trang thật thay thế ở T-34 (station) và T-50 (admin).
 * Không có menu điều hướng ở khung này.
 */
export const routes: RouteObject[] = [
  { path: "/", element: <Navigate to="/admin" replace /> },
  { path: "/station/*", element: <ShellPlaceholder area="station" /> },
  { path: "/admin/*", element: <ShellPlaceholder area="admin" /> },
  ...devRoutes,
];
