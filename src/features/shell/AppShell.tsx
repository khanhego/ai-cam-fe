import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { logout } from "@/lib/api/auth";
import { cx, Icon, IconButton } from "@/shared/ui";

import { useAuth } from "../auth/useAuth";
import { navFor, type NavItem } from "./nav";
import { currentTheme, setTheme } from "./theme";
import { useDashboardSocket } from "./useDashboardSocket";

const ROLE_LABEL = { ADMIN: "Admin", SUPERVISOR: "Supervisor", CSKH: "CSKH", STATION: "Station" } as const;

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const main = items.filter((i) => !i.group);
  const settings = items.filter((i) => i.group === "settings");
  const link = (item: NavItem) => (
    <NavLink
      key={item.to}
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cx(
          "state-layer flex h-12 items-center gap-3 rounded-full px-4 text-label-lg",
          isActive ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant",
        )
      }
    >
      <Icon name={item.icon} />
      {item.label}
    </NavLink>
  );
  return (
    <nav aria-label="Điều hướng chính" className="flex flex-col gap-1 p-3">
      {main.map(link)}
      {settings.length > 0 && (
        <>
          <p className="mt-4 px-4 pb-1 text-title-sm text-on-surface-variant">Cài đặt</p>
          {settings.map(link)}
        </>
      )}
    </nav>
  );
}

/** Khung dashboard (02b-admin §3): app bar 64px, drawer 256px từ lg, drawer modal dưới lg. */
export function AppShell() {
  const me = useAuth((s) => s.me)!;
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [theme, setThemeState] = useState(currentTheme);
  const items = navFor(me.role);
  useDashboardSocket();

  async function onLogout() {
    await logout().catch(() => undefined);
    useAuth.setState({ me: null, status: "ready" });
    navigate("/admin/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-outline-variant bg-surface px-2 sm:px-4">
        <IconButton icon="menu" label="Mở menu" className="lg:hidden" onClick={() => setDrawerOpen(true)} />
        <span className="flex items-center gap-2 text-title-lg text-primary">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-on-primary">
            <Icon name="videocam" size={22} />
          </span>
          Hệ thống X
        </span>
        <span className="flex-1" />
        <IconButton
          icon={theme === "dark" ? "light_mode" : "dark_mode"}
          label={theme === "dark" ? "Giao diện sáng" : "Giao diện tối"}
          onClick={() => {
            const next = theme === "dark" ? "light" : "dark";
            setTheme(next);
            setThemeState(next);
          }}
        />
        <span className="hidden text-body-md text-on-surface-variant sm:inline">
          {me.display_name} · {ROLE_LABEL[me.role]}
        </span>
        <IconButton icon="logout" label="Đăng xuất" onClick={onLogout} />
      </header>
      <div className="flex">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 border-r border-outline-variant lg:block">
          <NavList items={items} />
        </aside>
        {drawerOpen && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <button
              type="button"
              aria-label="Đóng menu"
              className="absolute inset-0 bg-scrim/40"
              onClick={() => setDrawerOpen(false)}
            />
            <aside className="relative h-full w-72 bg-surface-container-low shadow-elevation-3">
              <NavList items={items} onNavigate={() => setDrawerOpen(false)} />
            </aside>
          </div>
        )}
        <main className="mx-auto w-full max-w-7xl min-w-0 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
