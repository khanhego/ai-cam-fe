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
  /** Màn chưa xây → không vào menu (DEC-51, DEC-342); bật ở task làm màn đó. */
  screen?: Screen;
};

/** Màn item 02 trong drawer (02b-admin §2) và task xây màn. */
export type Item02Screen = "D14" | "D15" | "D16" | "D17";
/** Màn mới item 03 (02b-admin §1): D20 Báo cáo (T-254), D21 Link chia sẻ (T-257), D22 Thông báo (T-258), D23 Sao lưu (T-259). */
export type Item03Screen = "D20" | "D21" | "D22" | "D23";
export type Screen = Item02Screen | Item03Screen;
/**
 * Màn item 02 đã có trang thật. Rỗng ở M6 (T-152): mục drawer + route khai báo sẵn, chỉ hiện khi màn xong —
 * D14 ở T-153, D15 ở T-156, D16 / D17 ở T-157 / T-158 (DEC-342). M8: D16 (T-157), D17 (T-158). M9: D14 (T-153), D15 (T-156) — đủ màn.
 */
export const READY_SCREENS: ReadonlySet<Screen> = new Set<Screen>(["D14", "D15", "D16", "D17"]);

/** Màn đã xây chưa — link từ màn khác (D4 → D17, D4 → D15…) chỉ hiện khi màn đích có thật (DEC-51). */
export const screenReady = (screen: Screen, ready: ReadonlySet<Screen> = READY_SCREENS) => ready.has(screen);

const RETURNS_ROLES: Role[] = ["ADMIN", "SUPERVISOR", "CSKH"];
/** item 03: Báo cáo + Link chia sẻ cho 3 vai dashboard (01 §5.10). */
const DASHBOARD_ROLES: Role[] = ["ADMIN", "SUPERVISOR", "CSKH"];

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
  // item 03 (01 §10.3 drawer): sau "Hồ sơ khiếu nại"; mục hiện khi màn xong (DEC-51).
  { to: "/admin/reports", label: COPY.nav.reports, icon: "bar_chart", roles: DASHBOARD_ROLES, screen: "D20" },
  { to: "/admin/shares", label: COPY.nav.shares, icon: "link", roles: DASHBOARD_ROLES, screen: "D21" },
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
  // item 03: D7 đổi tên + route (đường cũ `/admin/settings/shopee` chuyển hướng — 02b-admin §2).
  {
    to: "/admin/settings/platforms",
    label: COPY.nav.platforms,
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
  {
    to: "/admin/settings/notifications",
    label: COPY.nav.notifications,
    icon: "notifications",
    roles: ["ADMIN"],
    group: "settings",
    screen: "D22",
  },
  {
    to: "/admin/settings/backup",
    label: COPY.nav.backup,
    icon: "cloud_upload",
    roles: ["ADMIN"],
    group: "settings",
    screen: "D23",
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

export const navFor = (role: Role, ready: ReadonlySet<Screen> = READY_SCREENS) =>
  NAV.filter((item) => item.roles.includes(role) && (!item.screen || ready.has(item.screen)));

/** Vai được duyệt yêu cầu (01 §5.1): nhận badge + âm báo `approval.created`. */
export const canApprove = (role: Role) => role === "ADMIN" || role === "SUPERVISOR";
