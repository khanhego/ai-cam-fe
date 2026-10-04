import { create } from "zustand";

import { fetchMe, type Me } from "@/lib/api/auth";
import { onUnauthenticated, refreshAccessToken } from "@/lib/api/client";
import { useSession, type ClientKind } from "@/lib/api/session";

type Status = "idle" | "loading" | "ready";

type AuthState = {
  status: Status;
  me: Me | null;
  /** Khôi phục phiên khi tải trang: refresh bằng cookie của client rồi lấy /me (02b-station §4). */
  bootstrap: (client: ClientKind) => Promise<void>;
  setMe: (me: Me | null) => void;
};

export const useAuth = create<AuthState>((set, get) => ({
  status: "idle",
  me: null,
  setMe: (me) => set({ me, status: "ready" }),
  bootstrap: async (client) => {
    if (get().status === "loading") return;
    set({ status: "loading" });
    useSession.getState().setClient(client);
    try {
      if (!useSession.getState().accessToken && !(await refreshAccessToken())) {
        set({ me: null, status: "ready" });
        return;
      }
      set({ me: await fetchMe(), status: "ready" });
    } catch {
      useSession.getState().clear();
      set({ me: null, status: "ready" });
    }
  },
}));

// Phiên hết hạn giữa chừng (API hoặc WS) → guard đưa về màn đăng nhập.
onUnauthenticated(() => useAuth.setState({ me: null, status: "ready" }));

export const clientForPath = (pathname: string): ClientKind =>
  pathname.startsWith("/station") ? "STATION" : "DASHBOARD";
