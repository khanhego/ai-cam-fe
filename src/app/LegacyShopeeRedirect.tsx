import { Navigate, useLocation } from "react-router-dom";

/**
 * item 03 (02b-admin §2): D7 đổi route — `/admin/settings/shopee` (link cũ, bookmark, redirect Shopee cũ) chuyển sang
 * `/admin/settings/platforms`, giữ query (`?result=`).
 */
export function LegacyShopeeRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/admin/settings/platforms${search}`} replace />;
}
