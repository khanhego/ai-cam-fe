import type { StationState } from "@/lib/api/station";
import { canBeOk } from "@/shared/returns/inspection";
import type {
  Conclusion,
  Inspection,
  InspectionInput,
  InspectionLine,
  LinesMode,
} from "@/shared/returns/types";

/**
 * Nháp kết luận R2 (02b-station §4, DEC-235): người kiểm sửa → hiện ngay, lưu API-102 sau 1 giây; state server mới tới
 * mà nháp chưa sửa (`dirty = false`) thì lấy theo server, đang sửa thì giữ (không ghi đè chữ đang gõ). Hàm thuần.
 */
export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type InspectionDraft = {
  sessionId: string;
  conclusion: Conclusion | null;
  note: string;
  lines: InspectionLine[];
  linesMode: LinesMode;
  dirty: boolean;
  /** Tăng mỗi lần sửa — response API-102 chỉ xóa `dirty` khi không có sửa mới trong lúc gửi. */
  rev: number;
  saveStatus: SaveStatus;
  /** Lỗi theo field của API-102 (`note`, `lines.N.quantity_received`, `conclusion`…). */
  fieldErrors: Record<string, string>;
  /** Vừa bỏ chọn "Nguyên vẹn" vì dòng đổi sang có vấn đề (BR-22). */
  okCleared: boolean;
};

export function draftFromServer(sessionId: string, insp: Inspection): InspectionDraft {
  return {
    sessionId,
    conclusion: insp.conclusion,
    note: insp.note ?? "",
    lines: insp.lines,
    linesMode: insp.lines_mode,
    dirty: false,
    rev: 0,
    saveStatus: insp.saved_at ? "saved" : "idle",
    fieldErrors: {},
    okCleared: false,
  };
}

/** Đồng bộ nháp với state server mới (API-10 / WS / response). Không phải phiên RETURN đang kiểm → null. */
export function syncDraft(prev: InspectionDraft | null, state: StationState): InspectionDraft | null {
  const session = state.session;
  if (!session || session.type !== "RETURN" || !session.inspection) return null;
  if (!prev || prev.sessionId !== session.id) return draftFromServer(session.id, session.inspection);
  if (prev.dirty) return prev;
  return { ...draftFromServer(session.id, session.inspection), saveStatus: prev.saveStatus, rev: prev.rev };
}

export type DraftPatch = Partial<Pick<InspectionDraft, "conclusion" | "note" | "lines">>;

/** Áp một thao tác của người kiểm. Đang chọn OK mà dòng thành có vấn đề → bỏ chọn OK (02b-station §5). */
export function editDraft(d: InspectionDraft, patch: DraftPatch): InspectionDraft {
  const next: InspectionDraft = { ...d, ...patch, dirty: true, rev: d.rev + 1, okCleared: false };
  if (next.conclusion === "OK" && !canBeOk(next.lines, next.linesMode)) {
    next.conclusion = null;
    next.okCleared = true;
  }
  if (patch.conclusion !== undefined) {
    const rest = { ...next.fieldErrors };
    delete rest.conclusion;
    next.fieldErrors = rest;
  }
  if (patch.note !== undefined) {
    const rest = { ...next.fieldErrors };
    delete rest.note;
    next.fieldErrors = rest;
  }
  return next;
}

/** Body API-102: `REFERENCE` không gửi dòng thay đổi (02b-station §3 `InspectionTable`). */
export function toInput(d: InspectionDraft): InspectionInput {
  return {
    conclusion: d.conclusion,
    note: d.note,
    lines:
      d.linesMode === "REFERENCE"
        ? []
        : d.lines.map((l) => ({
            order_item_id: l.order_item_id,
            quantity_received: l.quantity_received,
            condition: l.condition,
            note: l.note,
          })),
  };
}
