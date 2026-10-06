import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { logout } from "@/lib/api/auth";
import { ROLE_LABEL } from "@/shared/labels";
import { cx, Icon, IconButton } from "@/shared/ui";

import { useAuth } from "../auth/useAuth";
import { playApprovalChime } from "../approvals/chime";
import { canApprove, navFor, type NavItem } from "./nav";
import { NavBadge } from "./NavBadge";
import { currentTheme, setTheme } from "./theme";
import { useDashboardSocket } from "./useDashboardSocket";

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const main = items.filter((i) => !i.group);
  const settings = items.filter((i) => i.group === "settings");
  const link = (item: NavItem) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
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
      {item.badge && <NavBadge kind={item.badge} />}
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

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Drawer modal dưới lg (02b-admin §9 a11y, review P2-15): mở → focus mục đầu tiên; Tab / Shift+Tab vòng trong drawer;
 * Esc đóng; đóng → trả focus về phần tử đã mở drawer (nút "Mở menu").
 */
function MobileDrawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root.current?.querySelector("aside")?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => opener?.focus();
  }, []);
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !root.current) return;
    const items = [...root.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  return (
    <div
      ref={root}
      className="fixed inset-0 z-40 lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        aria-label="Đóng menu"
        className="absolute inset-0 bg-scrim/40"
        onClick={onClose}
      />
      <aside className="relative h-full w-72 bg-surface-container-low shadow-elevation-3">{children}</aside>
    </div>
  );
}

/** Khung dashboard (02b-admin §3): app bar 64px, drawer 256px từ lg, drawer modal dưới lg. */
export function AppShell() {
  const me = useAuth((s) => s.me)!;
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [theme, setThemeState] = useState(currentTheme);
  const items = navFor(me.role);
  // Âm báo yêu cầu duyệt mới chỉ cho vai được duyệt (server cũng chỉ gửi `approval.*` cho ADMIN, SUPERVISOR).
  useDashboardSocket(undefined, canApprove(me.role) ? { onApprovalCreated: playApprovalChime } : undefined);

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
          <MobileDrawer onClose={() => setDrawerOpen(false)}>
            <NavList items={items} onNavigate={() => setDrawerOpen(false)} />
          </MobileDrawer>
        )}
        <main className="mx-auto w-full max-w-7xl min-w-0 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
