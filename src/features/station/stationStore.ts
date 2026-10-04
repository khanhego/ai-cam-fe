import { create } from "zustand";

import { signalUnauthenticated } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import {
  stationApi,
  type CancelReason,
  type Outcome,
  type ScanAlert,
  type StationState,
} from "@/lib/api/station";
import { toast } from "@/shared/ui";

import { COPY } from "./copy";
import { sound, type SoundKind } from "./sound";

/** S4 tự đóng sau 5 giây (01 §10.4). */
export const ALERT_MS = 5000;
const RETRIES = 2;

const SOUND_BY_OUTCOME: Partial<Record<Outcome, SoundKind>> = {
  SESSION_OPENED: "ok",
  SESSION_COMPLETED: "ok",
  ALERT: "warn",
};

type StationStore = {
  state: StationState | null;
  alert: ScanAlert | null;
  /** Mã của lần quét gần nhất (cho "Yêu cầu đóng gói lại" ở S4). */
  lastCode: string | null;
  busy: boolean;
  /** Mất kết nối server sau khi đã retry (S6). */
  disconnected: boolean;
  queued: string | null;
  /** WS mất > 5 giây (S6). */
  wsLost: boolean;
  /** server_time − giờ máy (ms), cho đồng hồ và bộ đếm phiên. */
  clockOffsetMs: number;
  /** Thông báo trên S1 (phiên tự đóng, quản lý hủy). */
  notice: string | null;
  /** 409 STATION_INACTIVE: Admin tắt station — không nhận quét (02b-station §8). */
  blocked: string | null;
  load: () => Promise<void>;
  applyState: (state: StationState) => void;
  scan: (code: string) => Promise<void>;
  dismissAlert: () => void;
  setDisconnected: (value: boolean) => void;
  setWsLost: (value: boolean) => void;
  cancel: (reason: CancelReason, note?: string) => Promise<void>;
  requestApproval: (type: "MISMATCH" | "ASSIST" | "REPACK", trackingNumber?: string) => Promise<void>;
  withdrawApproval: () => Promise<void>;
  onServerAlert: (data: { code: string; tracking_number?: string }) => void;
  dismissNotice: () => void;
};

let alertTimer: ReturnType<typeof setTimeout> | undefined;

function newScanId(): string {
  return crypto.randomUUID();
}

const retryable = (e: unknown) => isApiError(e) && (e.status === 0 || e.status >= 500);

/**
 * Lỗi không retry được của mọi thao tác station (02b-station §8, review M1 #1): không ném ra ngoài
 * (handler là `void`), luôn hiện cho người đóng gói thấy.
 */
/** 409 do state đã đổi (phiên không còn mở, đã có yêu cầu…) → tải lại; trừ station bị tắt. */
const isStale = (e: unknown) => isApiError(e) && e.status === 409 && e.code !== "STATION_INACTIVE";

function report(e: unknown, set: (patch: Partial<StationStore>) => void): void {
  if (!isApiError(e)) toast(COPY.unexpected);
  else if (e.code === "STATION_INACTIVE") set({ blocked: e.message });
  else if (e.status === 401 || e.status === 403) signalUnauthenticated();
  else toast(e.message);
}

/** Một nguồn state duy nhất từ server (DEC-18): thay toàn bộ object mỗi lần nhận. */
export const useStationStore = create<StationStore>((set, get) => ({
  state: null,
  alert: null,
  lastCode: null,
  busy: false,
  disconnected: false,
  queued: null,
  wsLost: false,
  clockOffsetMs: 0,
  notice: null,
  blocked: null,

  async load() {
    try {
      get().applyState(await stationApi.state());
      set({ disconnected: false, blocked: null });
    } catch (e) {
      if (retryable(e)) set({ disconnected: true });
      else report(e, set);
    }
  },

  applyState(state) {
    const prev = get().state;
    set({ state, clockOffsetMs: Date.parse(state.server_time) - Date.now() });
    // Camera vừa mất tín hiệu: 2 bíp một lần (FR-01.03, review #22).
    const wasOnline = (role: string) => prev?.cameras.find((c) => c.role === role)?.status === "ONLINE";
    if (state.cameras.some((c) => c.status === "OFFLINE" && wasOnline(c.role))) sound.play("warn");
    // Lệch mã do Cam 2 đến qua WS: phát âm lỗi lặp; rời lệch mã thì tắt.
    if (state.state === "MISMATCH" && prev?.state !== "MISMATCH") sound.play("error", { loop: true });
    if (state.state !== "MISMATCH" && prev?.state === "MISMATCH") sound.stop();
  },

  async scan(code) {
    if (get().busy) {
      // Giữ thứ tự mở → đóng: tối đa 1 lần quét chờ (02b-station §4).
      set({ queued: code });
      return;
    }
    set({ busy: true, lastCode: code.trim().toUpperCase() });
    const clientScanId = newScanId();
    try {
      let attempt = 0;
      for (;;) {
        try {
          const result = await stationApi.scan(code, clientScanId);
          get().applyState(result.state);
          set({ disconnected: false });
          if (result.outcome === "IGNORED") toast("Đang chờ duyệt.");
          const kind = SOUND_BY_OUTCOME[result.outcome];
          if (kind) sound.play(kind);
          clearTimeout(alertTimer);
          set({ alert: result.alert });
          if (result.alert) alertTimer = setTimeout(() => set({ alert: null }), ALERT_MS);
          break;
        } catch (e) {
          // Retry với CÙNG client_scan_id: BE trả lại kết quả cũ nếu đã xử lý (DEC-29).
          if (retryable(e) && attempt < RETRIES) {
            attempt += 1;
            continue;
          }
          if (retryable(e)) set({ disconnected: true });
          else report(e, set);
          break;
        }
      }
    } finally {
      set({ busy: false });
      const next = get().queued;
      if (next) {
        set({ queued: null });
        void get().scan(next);
      }
    }
  },

  dismissAlert() {
    clearTimeout(alertTimer);
    set({ alert: null });
  },

  setDisconnected(value) {
    set({ disconnected: value });
  },

  setWsLost(value) {
    set({ wsLost: value });
  },

  async cancel(reason, note) {
    const session = get().state?.session;
    if (!session) return;
    try {
      get().applyState((await stationApi.cancel(session.id, reason, note)).state);
    } catch (e) {
      // 409 SESSION_NOT_OPEN: state đã khác (02b-station §8) → tải lại.
      if (isStale(e)) await get().load();
      else report(e, set);
    }
  },

  async requestApproval(type, trackingNumber) {
    const s = get().state;
    const body =
      type === "REPACK"
        ? { type, tracking_number: trackingNumber ?? "" }
        : { type, session_id: s?.session?.id ?? "" };
    try {
      get().applyState((await stationApi.requestApproval(body)).state);
      get().dismissAlert();
    } catch (e) {
      if (isStale(e)) await get().load();
      else report(e, set);
    }
  },

  async withdrawApproval() {
    const id = get().state?.approval_request?.id;
    if (!id) return;
    try {
      get().applyState((await stationApi.withdrawApproval(id)).state);
    } catch (e) {
      if (isStale(e)) await get().load();
      else report(e, set);
    }
  },

  onServerAlert(data) {
    if (data.code === "SESSION_ABANDONED") set({ notice: COPY.abandoned(data.tracking_number ?? "") });
    if (data.code === "SESSION_CANCELLED_BY_SUPERVISOR") set({ notice: COPY.cancelledByManager });
  },

  dismissNotice() {
    set({ notice: null });
  },
}));

export function resetStationStore() {
  clearTimeout(alertTimer);
  sound.stop();
  useStationStore.setState({
    state: null,
    alert: null,
    lastCode: null,
    busy: false,
    disconnected: false,
    queued: null,
    wsLost: false,
    clockOffsetMs: 0,
    notice: null,
    blocked: null,
  });
}
