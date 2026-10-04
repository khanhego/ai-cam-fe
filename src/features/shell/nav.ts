import type { Role } from "@/lib/api/session";

/**
 * Drawer dashboard (02b-admin §2). Chỉ mục có màn thật mới vào menu (không route tạm — DEC-51);
 * mục mới được thêm ở task tương ứng (D2 T-51, D3 T-52, D13 T-55, D5 T-56, D11 T-60, D7/D8 T-58, D9/D10 T-59).
 */
export type NavItem = { to: string; label: string; icon: string; roles: Role[]; group?: "settings" };

export const NAV: NavItem[] = [
  {
    to: "/admin/settings/stations",
    label: "Station",
    icon: "point_of_sale",
    roles: ["ADMIN"],
    group: "settings",
  },
];

export const navFor = (role: Role) => NAV.filter((item) => item.roles.includes(role));
