import { create } from "zustand";

/** Client theo 02 §6 Auth: cookie refresh tách riêng `rt_station` / `rt_dashboard`. */
export type ClientKind = "STATION" | "DASHBOARD";
export type Role = "ADMIN" | "SUPERVISOR" | "CSKH" | "STATION";

export type SessionUser = {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  /** item 02 (API-04 / API-02 `station` thêm `kind`, `work_mode` — BE T-106). */
  station: {
    id: string;
    name: string;
    kind?: "PACK" | "RETURN" | "BOTH";
    work_mode?: "PACK" | "RETURN";
  } | null;
};

type SessionState = {
  client: ClientKind;
  accessToken: string | null;
  user: SessionUser | null;
  setClient: (client: ClientKind) => void;
  setSession: (accessToken: string, user: SessionUser | null) => void;
  setAccessToken: (accessToken: string) => void;
  clear: () => void;
};

/** Access token chỉ giữ trong bộ nhớ (02b-station §4); refresh token nằm trong cookie httpOnly. */
export const useSession = create<SessionState>((set) => ({
  client: "DASHBOARD",
  accessToken: null,
  user: null,
  setClient: (client) => set({ client }),
  setSession: (accessToken, user) => set({ accessToken, user }),
  setAccessToken: (accessToken) => set({ accessToken }),
  clear: () => set({ accessToken: null, user: null }),
}));

export const session = {
  get: () => useSession.getState(),
  clear: () => useSession.getState().clear(),
};
