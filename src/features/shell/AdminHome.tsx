import { Navigate } from "react-router-dom";

import { EmptyState } from "@/shared/ui";

import { useAuth } from "../auth/useAuth";
import { navFor } from "./nav";

/** `/admin`: tới màn đầu tiên vai này dùng được (D2 Tổng quan thay khi có T-51). */
export default function AdminHome() {
  const me = useAuth((s) => s.me)!;
  const first = navFor(me.role)[0];
  if (first) return <Navigate to={first.to} replace />;
  return <EmptyState icon="hourglass_empty" title="Chưa có màn nào cho vai trò này." />;
}
