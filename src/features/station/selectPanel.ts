import type { StationState } from "@/lib/api/station";

/** Panel của `/station` (02b-station §2): S1–S3, S5 đóng gói · R1, R2 nhận hoàn. S4 / R4 (cảnh báo), S6 ngoài hàm này. */
export type StationPanel = "S1" | "S2" | "S3" | "S5" | "R1" | "R2";

/**
 * Chọn panel theo state server (một nguồn — DEC-18 item 01): `WAITING_APPROVAL` → S5 cho cả hai loại phiên;
 * `INSPECTING` → R2; `READY` theo `work_mode`. Hàm thuần để test mọi tổ hợp `work_mode` × `state`.
 */
export function selectPanel(state: Pick<StationState, "state" | "station">): StationPanel {
  switch (state.state) {
    case "WAITING_APPROVAL":
      return "S5";
    case "INSPECTING":
      return "R2";
    case "PACKING":
      return "S2";
    case "MISMATCH":
      return "S3";
    default:
      return state.station.work_mode === "RETURN" ? "R1" : "S1";
  }
}

/** R5 bắt buộc: bàn đang ở chế độ nhận hoàn mà chưa có tên người kiểm (BR-28, 02 §6.2 API-10). */
export const needsOperator = (state: Pick<StationState, "station"> | null) =>
  state?.station.work_mode === "RETURN" && !state.station.operator_name;

/** Nút đổi chế độ chỉ ở station "Cả hai" khi rảnh (01 §10.4 S1, R1). */
export const canSwitchMode = (state: Pick<StationState, "state" | "station" | "approval_request">) =>
  state.station.kind === "BOTH" && state.state === "READY" && !state.approval_request;
