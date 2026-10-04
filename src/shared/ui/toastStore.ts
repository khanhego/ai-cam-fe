import { create } from "zustand";

/** Snackbar M3 (`inverse-surface`, 4 giây). NEW — chưa có trong design system (DEC-44). */
export type ToastItem = { id: number; message: string };

type ToastState = {
  items: ToastItem[];
  show: (message: string) => void;
  dismiss: (id: number) => void;
};

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  items: [],
  show: (message) => set((s) => ({ items: [...s.items.slice(-2), { id: nextId++, message }] })),
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

/** Gọi ở bất kỳ đâu: `toast("Đã lưu.")`. */
export const toast = (message: string) => useToastStore.getState().show(message);

export const TOAST_MS = 4000;
