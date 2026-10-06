import type { Role } from "@/lib/api/session";

import { COPY as LIVE_COPY } from "../liveview/copy";
import { COPY } from "./copy";
import type { BadgeKind } from "./NavBadge";

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
  /** Badge: yêu cầu PENDING (D13), cảnh báo lệch mức Cao, hồ sơ sắp hết hạn (02b-admin §2, DEC-243). */
  badge?: BadgeKind;
  /** Màn của item 02 chưa xây → không vào menu (DEC-51, DEC-342); bật ở task làm màn đó. */
  screen?: Item02Screen;
};

/** Màn item 02 trong drawer (02b-admin §2) và task xây màn. */
export type Item02Screen = "D14" | "D15" | "D16" | "D17";
/**
 * Màn item 02 đã có trang thật. Rỗng ở M6 (T-152): mục drawer + route khai báo sẵn, chỉ hiện khi màn xong —
 * D14 ở T-153, D15 ở T-156, D16 / D17 ở T-157 / T-158 (DEC-342). M8: D16 (T-157), D17 (T-158).
 */
export const READY_SCREENS: ReadonlySet<Item02Screen> = new Set<Item02Screen>(["D16", "D17"]);

/** Màn đã xây chưa — link từ màn khác (D4 → D17, D4 → D15…) chỉ hiện khi màn đích có thật (DEC-51). */
export const screenReady = (screen: Item02Screen, ready: ReadonlySet<Item02Screen> = READY_SCREENS) =>
  ready.has(screen);

const RETURNS_ROLES: Role[] = ["ADMIN", "SUPERVISOR", "CSKH"];

export const NAV: NavItem[] = [
  { to: "/admin", label: "Tổng quan", icon: "dashboard", roles: ["ADMIN", "SUPERVISOR", "CSKH"], end: true },
  {
    to: "/admin/packages",
    label: "Tra cứu đơn",
    icon: "manage_search",
    roles: ["ADMIN", "SUPERVISOR", "CSKH"],
  },
  // item 02 (01 §10.3 drawer, ma trận 01 §5.10): sau "Tra cứu đơn".
  {
    to: "/admin/returns",
    label: COPY.nav.returns,
    icon: "assignment_return",
    roles: RETURNS_ROLES,
    screen: "D14",
  },
  {
    to: "/admin/recon",
    label: COPY.nav.recon,
    icon: "rule",
    roles: RETURNS_ROLES,
    badge: "recon",
    screen: "D15",
  },
  {
    to: "/admin/claims",
    label: COPY.nav.claims,
    icon: "gavel",
    roles: RETURNS_ROLES,
    badge: "claims",
    screen: "D16",
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

export const navFor = (role: Role, ready: ReadonlySet<Item02Screen> = READY_SCREENS) =>
  NAV.filter((item) => item.roles.includes(role) && (!item.screen || ready.has(item.screen)));

/** Vai được duyệt yêu cầu (01 §5.1): nhận badge + âm báo `approval.created`. */
export const canApprove = (role: Role) => role === "ADMIN" || role === "SUPERVISOR";
