/**
 * Kiểu dữ liệu hàng hoàn dùng chung station + dashboard (02 §5.1, §5.2, §6.2 v0.4). Viết tay theo contract tới khi
 * có `pnpm gen:api` (DEC-41 item 01).
 */

/** `inspection.conclusion` / `line.condition` (02 §5.2). */
export type Conclusion = "OK" | "DAMAGED" | "MISSING_ITEM" | "WRONG_ITEM" | "EMPTY_BOX" | "OTHER";
export type LineCondition = Conclusion;

/** `return_case.kind`. */
export type ReturnKind = "FAILED_DELIVERY" | "BUYER_RETURN" | "REFUND_ONLY" | "UNANNOUNCED" | "UNIDENTIFIED";

/** `return_case.status`. */
export type ReturnCaseStatus =
  | "EXPECTED"
  | "INSPECTING"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED_OK"
  | "RECEIVED_ISSUE"
  | "MISSING"
  | "CANCELLED"
  | "NO_PARCEL";

/** `FULL`: dòng kiểm theo BR-22 · `REFERENCE`: chỉ tham khảo, chỉ kết luận chung (02 §6.3 #7, DEC-249). */
export type LinesMode = "FULL" | "REFERENCE";

export type InspectionLine = {
  order_item_id: string;
  product_name: string;
  variation: string | null;
  image_url: string | null;
  quantity_sent: number;
  quantity_requested: number;
  quantity_received: number;
  /** null khi chưa kiểm. */
  condition: LineCondition | null;
  note: string | null;
};

/** Một lần sửa kết luận (API-113, `corrections[]` — 02 §6.3 #4, DEC-261). */
export type InspectionCorrection = {
  at: string;
  /** `id` null khi tài khoản đã bị xóa (02 §6.3 — C-07). */
  by: { id: string | null; display_name: string };
  reason: string;
  before: { conclusion: Conclusion | null; note: string; lines: InspectionLine[] };
};

export type Inspection = {
  conclusion: Conclusion | null;
  note: string;
  saved_at: string | null;
  lines_mode: LinesMode;
  lines: InspectionLine[];
  /** Chỉ có ở API-31 / API-113 (dashboard). */
  corrections?: InspectionCorrection[];
};

/** Dòng gửi lên API-102 / API-113. */
export type InspectionLineInput = Pick<
  InspectionLine,
  "order_item_id" | "quantity_received" | "condition" | "note"
>;
export type InspectionInput = {
  conclusion: Conclusion | null;
  note: string;
  lines: InspectionLineInput[];
};
/** Body API-113 (sửa kết luận): kết luận bắt buộc, không null (02 §6.3 #4 — C-06). */
export type InspectionCorrectionInput = Omit<InspectionInput, "conclusion"> & {
  conclusion: Conclusion;
  reason: string;
};

export type SnapshotKind = "MANUAL" | "PACK_CLOSE";

/** Ảnh Cam 1 (02 §5.1 SNAPSHOT). `url` ký 10 phút; hết hạn → gọi lại API nguồn. */
export type Snapshot = {
  id: string;
  kind: SnapshotKind;
  taken_at: string;
  url: string;
  camera_role?: "CAM1";
  sha256?: string;
  status?: "READY" | "DELETED";
};

/** Brief `claims[]` / `claim_code` dùng ở nhiều nơi. */
export type ClaimBrief = { id: string; code: string; status: string; type?: string };
