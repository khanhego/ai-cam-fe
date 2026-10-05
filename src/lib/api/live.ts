import { api } from "./client";
import type { CameraRole } from "./stations";

/** API-65 `GET /live` (02 §6.2 "Schema các API còn lại"): station + URL WHEP từng camera. ADMIN, SUPERVISOR. */
export type LiveCamera = { id: string; role: CameraRole; status: "ONLINE" | "OFFLINE"; whep_url: string };
export type LiveStation = { id: string; name: string; cameras: LiveCamera[] };

export const liveApi = {
  list: () => api.get<{ stations: LiveStation[] }>("/live"),
};
