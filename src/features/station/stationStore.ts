import { create } from "zustand";

import { signalUnauthenticated } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import {
  stationApi,
  type CancelReason,
  type ClosedSession,
  type Outcome,
  type OpenReturnSessionBody,
  type ScanAlert,
  type ScanResult,
  type StationServerAlert,
  type StationState,
  type WorkMode,
} from "@/lib/api/station";
import { conclusionError } from "@/shared/returns/inspection";
import { toast } from "@/shared/ui";

import { COPY } from "./copy";
import {
  editDraft,
  syncDraft,
  toInput,
  type DraftPatch,
  type InspectionDraft,
} from "./returns/inspectionDraft";
import { sound, type SoundKind } from "./sound";

/** S4 tự đóng sau 5 giây (01 §10.4). */
export const ALERT_MS = 5000;
/** R4 tự đóng sau 8 giây (DEC-238). */
export const RETURN_ALERT_MS = 8000;
/** Lưu nháp kết luận sau 1 giây không thao tác (DEC-235). */
export const DRAFT_DEBOUNCE_MS = 1000;
/** Quét đóng chờ lưu nháp tối đa 3 giây (02b-station §4). */
export const FLUSH_WAIT_MS = 3000;
/** Thông báo sau đóng tự ẩn 10 giây (01 §10.4). */
export const CLOSED_NOTICE_MS = 10_000;
/** Alert vàng "mã không thuộc kiện đang kiểm" 5 giây. */
export const CODE_DIFFERENT_MS = 5000;
/** R4 "ĐƠN CÓ NHIỀU KIỆN" hiện 1,5 giây rồi mở R3. */
export const MULTIPLE_TO_LOOKUP_MS = 1500;
const RETRIES = 2;

/** Cảnh báo hiện tại chỗ trên R2 (không overlay — 02b-station §8). */
export type InlineAlert =
  { code: "INSPECTION_REQUIRED" } | { code: "RETURN_CODE_DIFFERENT"; scanned: string };

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
  onServerAlert: (data: StationServerAlert | { code: string; tracking_number?: string }) => void;
  dismissNotice: () => void;
  // ---- item 02 ----
  /** R5 mở theo yêu cầu (nút "Đổi", ALERT `OPERATOR_REQUIRED`); bắt buộc khi chưa có tên thì tính từ state. */
  operatorOpen: boolean;
  openOperator: () => void;
  closeOperator: () => void;
  /** API-100 (station "Cả hai"). */
  setWorkMode: (mode: WorkMode) => Promise<void>;
  /** API-101. Trả chữ lỗi để hiện dưới ô (null = xong). */
  setOperator: (name: string) => Promise<string | null>;
  /** Nháp kết luận R2 (DEC-235). */
  draft: InspectionDraft | null;
  editDraft: (patch: DraftPatch) => void;
  /** Gửi API-102 ngay nếu nháp chưa lưu (chờ lần gửi đang chạy). */
  flushDraft: () => Promise<void>;
  inline: InlineAlert | null;
  /** Phiên vừa đóng (API-11 `closed_session`, WS `SESSION_AUTO_CLOSED`) — `ClosedNotice` ở S1 / R1. */
  closedNotice: ClosedSession | null;
  dismissClosedNotice: () => void;
  /** API-103 đang chạy. */
  capturing: boolean;
  /** API-103 `SNAPSHOT_LIMIT` (hoặc đã đủ 20 ảnh). */
  snapshotLimit: boolean;
  /** F2 / nút "Chụp ảnh" ở R2 (FR-04.04). */
  takeSnapshot: () => Promise<void>;
  /** Ảnh URL ký hết hạn → gọi lại API-10 một lần mỗi phiên (02b-station §4). */
  refreshMedia: () => void;
  /** R3 đang mở (mã điền sẵn). */
  lookup: { query: string } | null;
  openLookup: (query?: string) => void;
  closeLookup: () => void;
  /** R4 "Đây là kiện khác — vẫn ghi hình" → Dialog ghi chú (mã đã quét). */
  forceNew: { code: string } | null;
  openForceNew: (code: string) => void;
  closeForceNew: () => void;
  /**
   * API-105: mở phiên từ R3 / phiên chưa xác định / kiện khác. Trả lỗi theo field (ghi chú) để Dialog hiện; null = đã
   * xử lý (mở phiên, cảnh báo, hoặc toast).
   */
  openReturnSession: (
    body: { package_id: string } | { unidentified_code: string; force_new?: boolean; note?: string },
  ) => Promise<string | null>;
};

let alertTimer: ReturnType<typeof setTimeout> | undefined;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let inlineTimer: ReturnType<typeof setTimeout> | undefined;
let closedTimer: ReturnType<typeof setTimeout> | undefined;
let saving: Promise<void> | null = null;
/** Phiên đã gọi lại API-10 vì ảnh hết hạn. */
let mediaRefreshedFor: string | null = null;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
    const draft = syncDraft(get().draft, state);
    if (!draft) clearTimeout(saveTimer);
    const sameSession = prev?.session?.id === state.session?.id;
    set({
      state,
      draft,
      clockOffsetMs: Date.parse(state.server_time) - Date.now(),
      ...(sameSession ? {} : { inline: null, snapshotLimit: false }),
    });
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
    get().dismissClosedNotice();
    const clientScanId = newScanId();
    try {
      // R2: kết luận phải lưu xong trước lần quét đóng (DEC-235) — chờ tối đa 3 giây rồi vẫn gửi.
      if (get().state?.state === "INSPECTING" && (get().draft?.dirty || saving))
        await Promise.race([get().flushDraft(), sleep(FLUSH_WAIT_MS)]);
      let attempt = 0;
      for (;;) {
        try {
          const result = await stationApi.scan(code, clientScanId);
          applyResult(result);
          set({ disconnected: false });
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
    const code = "tracking_number" in data ? (data.tracking_number ?? "") : "";
    const returnMode = get().state?.station.work_mode === "RETURN";
    if (data.code === "SESSION_ABANDONED")
      set({ notice: returnMode ? COPY.closedNotice.returnAbandoned(code) : COPY.abandoned(code) });
    if (data.code === "SESSION_CANCELLED_BY_SUPERVISOR") set({ notice: COPY.cancelledByManager });
    // J-07 tự hoàn tất phiên hoàn đã có kết luận (DEC-272).
    if (data.code === "SESSION_AUTO_CLOSED" && "closed_session" in data) {
      clearTimeout(closedTimer);
      set({ closedNotice: data.closed_session as ClosedSession, draft: null, inline: null });
      closedTimer = setTimeout(() => set({ closedNotice: null }), CLOSED_NOTICE_MS);
      sound.play("ok");
    }
    // J-07 tới warn_at: gửi nháp ngay (server chỉ tự hoàn tất bằng kết luận đã lưu).
    if (data.code === "SESSION_WARN") void get().flushDraft();
  },

  dismissNotice() {
    set({ notice: null });
  },

  operatorOpen: false,
  openOperator() {
    set({ operatorOpen: true });
  },
  closeOperator() {
    set({ operatorOpen: false });
  },

  async setWorkMode(mode) {
    try {
      get().applyState((await stationApi.setWorkMode(mode)).state);
      set({ notice: null });
    } catch (e) {
      if (isApiError(e) && e.code === "SESSION_ACTIVE") {
        toast(COPY.workMode.sessionActive);
        await get().load();
      } else if (isStale(e)) await get().load();
      else report(e, set);
    }
  },

  draft: null,
  inline: null,
  closedNotice: null,

  capturing: false,
  snapshotLimit: false,

  async takeSnapshot() {
    const session = get().state?.session;
    if (!session || session.type !== "RETURN" || get().capturing || get().snapshotLimit) return;
    set({ capturing: true });
    try {
      const { snapshot } = await stationApi.takeSnapshot(session.id);
      const state = get().state;
      const cur = state?.session;
      if (state && cur?.id === session.id && !cur.snapshots?.some((x) => x.id === snapshot.id))
        set({ state: { ...state, session: { ...cur, snapshots: [...(cur.snapshots ?? []), snapshot] } } });
    } catch (e) {
      if (isApiError(e) && e.code === "SNAPSHOT_LIMIT") set({ snapshotLimit: true });
      else if (isApiError(e) && e.code === "CAMERA_UNREACHABLE")
        toast(COPY.returns.inspecting.snapshotFailed);
      else if (isStale(e)) await get().load();
      else if (retryable(e)) toast(COPY.returns.inspecting.snapshotFailed);
      else report(e, set);
    } finally {
      set({ capturing: false });
    }
  },

  lookup: null,
  openLookup(query = "") {
    clearTimeout(alertTimer);
    set({ lookup: { query }, alert: null });
  },
  closeLookup() {
    set({ lookup: null });
  },
  forceNew: null,
  openForceNew(code) {
    clearTimeout(alertTimer);
    set({ forceNew: { code }, alert: null });
  },
  closeForceNew() {
    set({ forceNew: null });
  },

  async openReturnSession(input) {
    const body = { ...input, client_scan_id: newScanId() } as OpenReturnSessionBody;
    get().dismissClosedNotice();
    set({ busy: true });
    try {
      const result = await stationApi.openReturnSession(body);
      set({ lookup: null, forceNew: null });
      applyResult(result);
      return null;
    } catch (e) {
      const L = COPY.lookup;
      if (isApiError(e) && e.code === "VALIDATION_ERROR")
        return e.fieldErrors.note ?? e.fieldErrors.unidentified_code ?? e.message;
      if (isApiError(e) && e.code === "NOT_FOUND") toast(L.notFound);
      else if (isApiError(e) && e.code === "FORCE_NEW_NOT_ALLOWED") {
        toast(COPY.returnAlert.forceNewNotAllowed);
        set({ forceNew: null });
      } else if (isApiError(e) && e.code === "SESSION_ACTIVE") {
        toast(L.sessionActive);
        set({ lookup: null, forceNew: null });
        await get().load();
      } else if (isStale(e)) {
        set({ lookup: null, forceNew: null });
        await get().load();
      } else if (retryable(e)) toast(L.error);
      else report(e, set);
      return null;
    } finally {
      set({ busy: false });
    }
  },

  refreshMedia() {
    const id = get().state?.session?.id ?? null;
    if (!id || mediaRefreshedFor === id) return;
    mediaRefreshedFor = id;
    void get().load();
  },

  dismissClosedNotice() {
    clearTimeout(closedTimer);
    if (get().closedNotice) set({ closedNotice: null });
  },

  editDraft(patch) {
    const d = get().draft;
    if (!d) return;
    const next = editDraft(d, patch);
    const inline = get().inline;
    set({
      draft: next,
      ...(next.conclusion && inline?.code === "INSPECTION_REQUIRED" ? { inline: null } : {}),
    });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void get().flushDraft(), DRAFT_DEBOUNCE_MS);
  },

  async flushDraft() {
    clearTimeout(saveTimer);
    for (;;) {
      if (saving) {
        await saving;
        continue;
      }
      const d = get().draft;
      if (!d || !d.dirty) return;
      // "Khác" chưa có ghi chú: chưa gửi (server sẽ 422 và không lưu gì) — báo tại ô.
      if (conclusionError(d.conclusion, d.note, d.lines, d.linesMode) === "NOTE_REQUIRED") {
        set({
          draft: { ...d, fieldErrors: { ...d.fieldErrors, note: COPY.returns.inspecting.noteRequired } },
        });
        return;
      }
      saving = saveDraft(d).finally(() => {
        saving = null;
      });
      await saving;
      const after = get().draft;
      if (!after || after.saveStatus === "error" || after.sessionId !== d.sessionId) return;
    }
  },

  async setOperator(name) {
    try {
      get().applyState((await stationApi.setOperator(name)).state);
      set({ operatorOpen: false });
      return null;
    } catch (e) {
      if (isApiError(e) && e.code === "VALIDATION_ERROR") return e.fieldErrors.name ?? e.message;
      if (isApiError(e) && e.code === "SESSION_ACTIVE") return COPY.operator.sessionActive;
      if (retryable(e)) return COPY.unexpected;
      report(e, set);
      return null;
    }
  },
}));

/**
 * Áp kết quả API-11 / API-105 (cùng dạng): state, âm, thông báo sau đóng, định tuyến cảnh báo — R5 (OPERATOR_REQUIRED),
 * tại chỗ R2 (INSPECTION_REQUIRED, RETURN_CODE_DIFFERENT), còn lại overlay S4 / R4 (02b-station §8).
 */
function applyResult(result: ScanResult) {
  const { getState: get, setState: set } = useStationStore;
  get().applyState(result.state);
  if (result.outcome === "IGNORED") toast("Đang chờ duyệt.");
  const alert = result.alert;
  const kind = alert?.code === "INSPECTION_REQUIRED" ? "error" : SOUND_BY_OUTCOME[result.outcome];
  if (kind) sound.play(kind);
  clearTimeout(alertTimer);
  if (result.closed_session) {
    clearTimeout(closedTimer);
    set({ closedNotice: result.closed_session });
    closedTimer = setTimeout(() => set({ closedNotice: null }), CLOSED_NOTICE_MS);
  }
  if (!alert) {
    set({ alert: null });
    return;
  }
  switch (alert.code) {
    case "OPERATOR_REQUIRED":
      set({ alert: null, operatorOpen: true });
      return;
    case "INSPECTION_REQUIRED":
      clearTimeout(inlineTimer);
      set({ alert: null, inline: { code: "INSPECTION_REQUIRED" } });
      return;
    case "RETURN_CODE_DIFFERENT": {
      clearTimeout(inlineTimer);
      const scanned = String(alert.data.code ?? get().lastCode ?? "");
      set({ alert: null, inline: { code: "RETURN_CODE_DIFFERENT", scanned } });
      inlineTimer = setTimeout(() => set({ inline: null }), CODE_DIFFERENT_MS);
      return;
    }
    case "RETURN_MULTIPLE_PACKAGES": {
      // R4 1,5 giây rồi tự mở R3 với mã đơn (02b-station §8).
      set({ alert, lookup: null });
      const query = String(alert.data.platform_order_sn ?? get().lastCode ?? "");
      alertTimer = setTimeout(() => set({ alert: null, lookup: { query } }), MULTIPLE_TO_LOOKUP_MS);
      return;
    }
    case "RETURN_NOT_FOUND":
      // Có 2 nút hành động → không tự đóng (01 §10.4 R4).
      set({ alert, lookup: null });
      return;
    default: {
      set({ alert, lookup: null });
      const ms = result.state.station.work_mode === "RETURN" ? RETURN_ALERT_MS : ALERT_MS;
      alertTimer = setTimeout(() => set({ alert: null }), ms);
    }
  }
}

/** Gửi API-102 một bản nháp (tự thử lại 2 lần khi lỗi mạng / 5xx — 02b-station §6). */
async function saveDraft(d: InspectionDraft): Promise<void> {
  const { getState: get, setState: set } = useStationStore;
  const patch = (p: Partial<InspectionDraft>) => {
    const cur = get().draft;
    if (cur && cur.sessionId === d.sessionId) set({ draft: { ...cur, ...p } });
  };
  patch({ saveStatus: "saving" });
  for (let attempt = 0; ; attempt += 1) {
    try {
      const { inspection } = await stationApi.saveInspection(d.sessionId, toInput(d));
      const cur = get().draft;
      const state = get().state;
      if (state?.session?.id === d.sessionId)
        set({ state: { ...state, session: { ...state.session, inspection } } });
      if (cur && cur.sessionId === d.sessionId)
        set({
          draft:
            cur.rev === d.rev
              ? { ...cur, dirty: false, saveStatus: "saved", fieldErrors: {} }
              : { ...cur, saveStatus: "saving" },
        });
      return;
    } catch (e) {
      if (retryable(e) && attempt < RETRIES) continue;
      if (isApiError(e) && (e.code === "SESSION_NOT_OPEN" || e.code === "NOT_RETURN_SESSION")) {
        if (e.code === "NOT_RETURN_SESSION") console.warn("API-102 NOT_RETURN_SESSION", d.sessionId);
        set({ draft: null });
        await get().load();
        return;
      }
      console.warn("API-102 lỗi", { session_id: d.sessionId, error: e });
      const fieldErrors =
        isApiError(e) && e.code === "CONCLUSION_INCONSISTENT"
          ? { conclusion: COPY.returns.inspecting.okLocked }
          : isApiError(e)
            ? e.fieldErrors
            : {};
      patch({ saveStatus: "error", fieldErrors });
      if (isApiError(e) && !retryable(e) && e.status !== 422 && e.status !== 409) report(e, set);
      return;
    }
  }
}

export function resetStationStore() {
  clearTimeout(alertTimer);
  clearTimeout(saveTimer);
  clearTimeout(inlineTimer);
  clearTimeout(closedTimer);
  saving = null;
  mediaRefreshedFor = null;
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
    operatorOpen: false,
    draft: null,
    inline: null,
    closedNotice: null,
    capturing: false,
    snapshotLimit: false,
    lookup: null,
    forceNew: null,
  });
}
