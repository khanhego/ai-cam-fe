import { api } from "./client";
import type { Page } from "./stations";

/** API-50..54 — nhập đơn từ file (02 §6.2). */
export type ImportCounts = { new: number; updated: number; skipped: number; error: number };
export type ImportRowError = { row: number; column: string | null; message: string };
export type ImportRowAction = "NEW" | "UPDATE" | "SKIP";
export type ImportSampleRow = {
  row: number;
  tracking_number: string;
  platform_order_sn: string;
  product_name: string;
  variation: string | null;
  quantity: number;
  action: ImportRowAction;
};
export type ImportStatus = "PREVIEW" | "COMMITTED" | "EXPIRED";

export type ImportPreview = {
  id: string;
  status: ImportStatus;
  file_name: string;
  counts: ImportCounts;
  errors: ImportRowError[];
  sample: ImportSampleRow[];
  expires_at: string;
};

export type ImportHistoryItem = {
  id: string;
  status: ImportStatus;
  file_name: string;
  counts: ImportCounts;
  created_by: { id: string; display_name: string } | null;
  created_at: string;
  committed_at: string | null;
};

/** Giới hạn phía client (02b-admin §5, 02 API-50). Server vẫn kiểm lại. */
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_EXTENSIONS = [".csv", ".xlsx"] as const;

export const importsApi = {
  upload: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return api.post<ImportPreview>("/imports", body);
  },
  commit: (id: string) =>
    api.post<{ id: string; status: "COMMITTED"; counts: ImportCounts }>(`/imports/${id}/commit`),
  history: (page: number) => api.get<Page<ImportHistoryItem>>("/imports", { query: { page, page_size: 20 } }),
  /** API-53: file mẫu CSV. */
  template: () => api.blob("/imports/template"),
  /** API-54: file gốc (410 FILE_EXPIRED sau 90 ngày). */
  file: (id: string) => api.blob(`/imports/${id}/file`),
};
