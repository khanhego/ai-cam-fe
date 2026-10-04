import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import type { Role } from "@/lib/api/session";
import { Icon } from "@/shared/ui";

import { clientForPath, useAuth } from "./useAuth";

/**
 * Guard theo vai (02b-station §2, 02b-admin §2). UI chỉ điều hướng; server vẫn chặn bằng 403.
 * - Chưa đăng nhập → màn đăng nhập của khu vực (`?next=` cho dashboard).
 * - STATION vào /admin → /station; vai khác vào /station → /admin; sai vai trong dashboard → /admin/forbidden.
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const location = useLocation();
  const { status, me, bootstrap } = useAuth();
  const client = clientForPath(location.pathname);

  useEffect(() => {
    if (status === "idle") void bootstrap(client);
  }, [status, bootstrap, client]);

  if (status !== "ready") return <BootSplash />;
  if (!me) {
    if (client === "STATION") return <Navigate to="/station/login" replace />;
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/admin/login?next=${next}`} replace />;
  }
  if (me.role === "STATION" && client !== "STATION") return <Navigate to="/station" replace />;
  if (me.role !== "STATION" && client === "STATION") return <Navigate to="/admin" replace />;
  if (!roles.includes(me.role)) return <Navigate to="/admin/forbidden" replace />;
  return <>{children}</>;
}

export function BootSplash() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface text-on-surface-variant">
      <Icon name="qr_code_scanner" size={48} className="opacity-40" />
      <p className="text-body-lg">Đang tải…</p>
    </main>
  );
}
