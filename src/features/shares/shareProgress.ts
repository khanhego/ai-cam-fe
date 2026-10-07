import { create } from "zustand";

/** Poll API-162 khi `CREATING` (02b-admin §4, DEC-487) — test chỉnh được. */
export const sharePoll = { ms: 2000 };

/**
 * Link đang tạo mà người dùng đã đóng dialog (chạy nền — 01 §10.5 ShareLinkDialog "Đang tạo"): `ShareCompletionWatcher`
 * theo dõi và Toast khi xong / lỗi (DEC-487).
 */
export const useBackgroundShares = create<{
  pending: Record<string, string>;
  add: (id: string, recipient: string) => void;
  remove: (id: string) => void;
}>((set) => ({
  pending: {},
  add: (id, recipient) => set((s) => ({ pending: { ...s.pending, [id]: recipient } })),
  remove: (id) =>
    set((s) => {
      const next = { ...s.pending };
      delete next[id];
      return { pending: next };
    }),
}));
