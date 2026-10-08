import { useEffect, useRef, useState, type KeyboardEvent } from "react";

/**
 * Menu button theo mẫu WAI-ARIA (G3-F22, DEC-353; dùng chung từ G3-FE-6 — DEC-904): mở → focus mục đầu; ↑/↓ vòng,
 * Home/End; Esc đóng + trả focus nút; Tab / bấm ra ngoài đóng. Mục menu: `role="menuitem"` + `tabIndex={-1}`.
 *
 * Gắn: `wrapRef` lên phần tử bọc nút + menu, `triggerRef` + `onTriggerKeyDown` lên nút, `menuRef` + `onMenuKeyDown` lên
 * `<ul role="menu">`.
 */
export function useMenuButton<W extends HTMLElement = HTMLDivElement>() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<W>(null);
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const outside = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const onMenuKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const focus = (n: number) => items[(n + items.length) % items.length]?.focus();
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focus(i + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        focus(i - 1);
        break;
      case "Home":
        e.preventDefault();
        focus(0);
        break;
      case "End":
        e.preventDefault();
        focus(items.length - 1);
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };
  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" && !open) {
      e.preventDefault();
      setOpen(true);
    }
  };
  return { open, setOpen, menuRef, triggerRef, wrapRef, onMenuKeyDown, onTriggerKeyDown };
}
