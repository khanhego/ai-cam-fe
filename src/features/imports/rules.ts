import { IMPORT_EXTENSIONS, IMPORT_MAX_BYTES, type ImportPreview } from "@/lib/api/imports";

import { COPY } from "./copy";

/** Kiểm loại + dung lượng trước khi gửi (02b-admin §5). Trả chữ lỗi hoặc null. */
export function checkFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!IMPORT_EXTENSIONS.some((ext) => name.endsWith(ext))) return COPY.wrongType;
  if (file.size > IMPORT_MAX_BYTES) return COPY.tooBig;
  return null;
}

/** Số đơn sẽ được tạo / cập nhật khi xác nhận ("Nhập 495 đơn" = mới + cập nhật, 01 §10.5). */
export const importable = (p: ImportPreview) => p.counts.new + p.counts.updated;
