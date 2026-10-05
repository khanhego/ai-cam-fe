import type { Role } from "@/lib/api/session";

import { COPY as LIVE_COPY } from "../liveview/copy";

/**
 * Drawer dashboard (02b-admin §2). Chỉ mục có màn thật mới vào menu (không route tạm — DEC-51);
 * mục mới được thêm ở task tương ứng.
 * `end`: chỉ sáng khi đúng đường dẫn (Tổng quan là `/admin`, cha của mọi route khác).
 */
export type NavItem = {
  to: string;
  label: string;
  icon: string;
  roles: Role[];
  group?: "settings";
  end?: boolean;
  /** Badge số yêu cầu PENDING (D13). */
  badge?: "approvals";
};

export const NAV: NavItem[] = [
  { to: "/admin", label: "Tổng quan", icon: "dashboard", roles: ["ADMIN", "SUPERVISOR", "CSKH"], end: true },
  {
    to: "/admin/packages",
    label: "Tra cứu đơn",
    icon: "manage_search",
    roles: ["ADMIN", "SUPERVISOR", "CSKH"],
  },
  {
    to: "/admin/approvals",
    label: "Yêu cầu duyệt",
    icon: "pending_actions",
    roles: ["ADMIN", "SUPERVISOR"],
    badge: "approvals",
  },
  { to: "/admin/imports", label: "Nhập đơn", icon: "upload_file", roles: ["ADMIN", "SUPERVISOR"] },
  { to: "/admin/live", label: LIVE_COPY.title, icon: "live_tv", roles: ["ADMIN", "SUPERVISOR"] },
  {
    to: "/admin/settings/stations",
    label: "Station",
    icon: "point_of_sale",
    roles: ["ADMIN"],
    group: "settings",
  },
  {
    to: "/admin/settings/shopee",
    label: "Kết nối Shopee",
    icon: "storefront",
    roles: ["ADMIN"],
    group: "settings",
  },
  {
    to: "/admin/settings/storage",
    label: "Lưu trữ video",
    icon: "hard_drive",
    roles: ["ADMIN"],
    group: "settings",
  },
  { to: "/admin/settings/users", label: "Người dùng", icon: "group", roles: ["ADMIN"], group: "settings" },
  {
    to: "/admin/settings/audit",
    label: "Nhật ký thao tác",
    icon: "history",
    roles: ["ADMIN"],
    group: "settings",
  },
];

export const navFor = (role: Role) => NAV.filter((item) => item.roles.includes(role));

/** Vai được duyệt yêu cầu (01 §5.1): nhận badge + âm báo `approval.created`. */
export const canApprove = (role: Role) => role === "ADMIN" || role === "SUPERVISOR";
