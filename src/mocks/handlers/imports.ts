import { http, HttpResponse } from "msw";

import type {
  ImportCounts,
  ImportHistoryItem,
  ImportPreview,
  ImportRowError,
  ImportSampleRow,
} from "@/lib/api/imports";

import { mockPackages, type MockPackage } from "../packagesDb";
import { API, apiError } from "../http";
import { requireRole } from "./session";

/**
 * API-50..54 theo 02 §6.2 (T-56; BE T-17 làm song song). CSV đọc thật trong mock; `.xlsx` không đọc được ở trình
 * duyệt nên trả bản xem trước cố định 3 đơn mới. Cột bắt buộc theo 02a API-50.
 */
export const TEMPLATE_COLUMNS = [
  "platform_order_sn",
  "tracking_number",
  "sku",
  "product_name",
  "variation",
  "quantity",
  "buyer_note",
] as const;
const REQUIRED = ["platform_order_sn", "tracking_number", "product_name", "quantity"];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;
const PREVIEW_MINUTES = 30;
const MANAGERS = ["ADMIN", "SUPERVISOR"] as const;

type Row = Record<string, string> & { __row: string };
type MockImport = ImportHistoryItem & {
  errors: ImportRowError[];
  sample: ImportSampleRow[];
  expires_at: string;
  rows: (ImportSampleRow & { sku: string; buyer_note: string })[];
  content: string;
  /** Mock: file gốc đã quá 90 ngày. */
  fileExpired?: boolean;
};

export const mockImports: MockImport[] = [];

export function resetMockImports() {
  mockImports.splice(0, mockImports.length, {
    id: "imp-seed-1",
    status: "COMMITTED",
    file_name: "don-03-10.csv",
    counts: { new: 12, updated: 3, skipped: 0, error: 0 },
    created_by: { id: "u-sup", display_name: "Nguyễn B" },
    created_at: "2026-10-03T02:10:00Z",
    committed_at: "2026-10-03T02:11:00Z",
    errors: [],
    sample: [],
    expires_at: "2026-10-03T02:40:00Z",
    rows: [],
    content: `${TEMPLATE_COLUMNS.join(",")}\n`,
  });
}
resetMockImports();

/** Tách CSV có ngoặc kép (đủ cho file mẫu; BE dùng thư viện thật). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function sourceOf(trackingNumber: string, orderSn: string): "API" | "CSV" | null {
  const pkg: MockPackage | undefined = mockPackages.find(
    (p) => p.tracking_number === trackingNumber || p.order?.platform_order_sn === orderSn,
  );
  return pkg ? (pkg.order?.source ?? "API") : null;
}

function analyse(rows: Row[]) {
  const errors: ImportRowError[] = [];
  const parsed: MockImport["rows"] = [];
  const orders = new Map<string, ImportSampleRow["action"]>();
  for (const r of rows) {
    const rowNo = Number(r.__row);
    const rowErrors: ImportRowError[] = [];
    for (const col of ["platform_order_sn", "tracking_number", "product_name"]) {
      if (!r[col]?.trim()) rowErrors.push({ row: rowNo, column: col, message: "Bỏ trống" });
    }
    const qty = Number(r.quantity);
    if (!Number.isInteger(qty) || qty < 1)
      rowErrors.push({ row: rowNo, column: "quantity", message: "Phải là số nguyên ≥ 1" });
    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      continue;
    }
    const source = sourceOf(r.tracking_number!.trim(), r.platform_order_sn!.trim());
    const action = source === "API" ? "SKIP" : source === "CSV" ? "UPDATE" : "NEW";
    orders.set(r.platform_order_sn!.trim(), action);
    parsed.push({
      row: rowNo,
      tracking_number: r.tracking_number!.trim(),
      platform_order_sn: r.platform_order_sn!.trim(),
      product_name: r.product_name!.trim(),
      variation: r.variation?.trim() || null,
      quantity: qty,
      action,
      sku: r.sku?.trim() ?? "",
      buyer_note: r.buyer_note?.trim() ?? "",
    });
  }
  const counts: ImportCounts = {
    new: 0,
    updated: 0,
    skipped: 0,
    error: new Set(errors.map((e) => e.row)).size,
  };
  for (const action of orders.values()) {
    if (action === "NEW") counts.new += 1;
    else if (action === "UPDATE") counts.updated += 1;
    else counts.skipped += 1;
  }
  return { errors, parsed, counts };
}

/**
 * Lấy phần `file` của multipart. Tự tách thay vì `request.formData()`: trong test (jsdom + undici) bước đọc
 * FormData của MSW từ chối File của Node. `.xlsx` không cần nội dung (mock không đọc).
 */
async function readFilePart(request: Request): Promise<{ name: string; size: number; text: string } | null> {
  const boundary = /boundary=(.+)$/.exec(request.headers.get("content-type") ?? "")?.[1];
  if (!boundary) return null;
  const bytes = new Uint8Array(await request.arrayBuffer());
  const raw = new TextDecoder().decode(bytes);
  for (const part of raw.split(`--${boundary}`)) {
    const [head, ...rest] = part.split("\r\n\r\n");
    if (!head || !/name="file"/.test(head)) continue;
    const name = /filename="([^"]*)"/.exec(head)?.[1];
    if (!name) return null;
    const text = rest.join("\r\n\r\n").replace(/\r\n$/, "");
    return { name, size: new TextEncoder().encode(text).length, text };
  }
  return null;
}

const fileInvalid = (message: string, details: Record<string, unknown> = {}) =>
  apiError(422, "FILE_INVALID", message, details);

function toPreview(imp: MockImport): ImportPreview {
  return {
    id: imp.id,
    status: imp.status,
    file_name: imp.file_name,
    counts: imp.counts,
    errors: imp.errors,
    sample: imp.sample,
    expires_at: imp.expires_at,
  };
}

function toHistory(imp: MockImport): ImportHistoryItem {
  return {
    id: imp.id,
    status: imp.status,
    file_name: imp.file_name,
    counts: imp.counts,
    created_by: imp.created_by,
    created_at: imp.created_at,
    committed_at: imp.committed_at,
  };
}

function applyImport(imp: MockImport) {
  for (const r of imp.rows) {
    if (r.action === "SKIP") continue;
    const existing = mockPackages.find((p) => p.tracking_number === r.tracking_number);
    const item = {
      product_name: r.product_name,
      variation: r.variation,
      quantity: r.quantity,
      image_url: null,
    };
    if (existing?.order) {
      existing.order.items = [item];
      existing.order.buyer_note = r.buyer_note || null;
      continue;
    }
    mockPackages.push({
      id: `pkg-csv-${r.tracking_number}`,
      tracking_number: r.tracking_number,
      warehouse_status: "NEW",
      platform_logistics_status: null,
      verified: true,
      created_at: new Date().toISOString(),
      order: {
        id: `ord-csv-${r.platform_order_sn}`,
        platform: "SHOPEE",
        platform_order_sn: r.platform_order_sn,
        platform_status: null,
        buyer_note: r.buyer_note || null,
        source: "CSV",
        items: [item],
      },
      sessions: [],
      timeline: [],
    });
  }
}

export const importsHandlers = [
  http.post(`${API}/imports`, async ({ request }) => {
    const [user, denied] = requireRole(request, [...MANAGERS]);
    if (denied) return denied;
    const file = await readFilePart(request);
    if (!file) return fileInvalid("Chưa chọn file.");
    const name = file.name.toLowerCase();
    if (!name.endsWith(".csv") && !name.endsWith(".xlsx"))
      return fileInvalid("File phải là .csv hoặc .xlsx.");
    if (file.size > MAX_BYTES) return fileInvalid("File lớn hơn 5 MB.");
    const now = Date.now();
    const base = {
      id: `imp-${now}-${mockImports.length}`,
      status: "PREVIEW" as const,
      file_name: file.name,
      created_by: { id: user.id, display_name: user.display_name },
      created_at: new Date(now).toISOString(),
      committed_at: null,
      expires_at: new Date(now + PREVIEW_MINUTES * 60_000).toISOString(),
    };
    let rows: Row[];
    let content = "";
    if (name.endsWith(".xlsx")) {
      rows = [1, 2, 3].map((i) => ({
        __row: String(i + 1),
        platform_order_sn: `2410XLSX0000${i}`,
        tracking_number: `SPXXLSX000000${i}`,
        product_name: "Áo thun basic",
        variation: "Đen / L",
        quantity: "1",
      }));
    } else {
      content = file.text.replace(/^\uFEFF/, "");
      const [header, ...data] = parseCsv(content);
      const columns = (header ?? []).map((h) => h.trim());
      const missing = REQUIRED.filter((c) => !columns.includes(c));
      if (missing.length > 0)
        return fileInvalid(`File thiếu cột bắt buộc: ${missing.join(", ")}.`, { missing_columns: missing });
      if (data.length > MAX_ROWS) return fileInvalid("File có hơn 5.000 dòng.");
      rows = data.map((cells, i) => {
        const r: Row = { __row: String(i + 2) };
        columns.forEach((c, j) => (r[c] = cells[j] ?? ""));
        return r;
      });
    }
    const { errors, parsed, counts } = analyse(rows);
    const imp: MockImport = {
      ...base,
      counts,
      errors,
      rows: parsed,
      sample: parsed.slice(0, 20).map(({ sku, buyer_note, ...s }) => (void sku, void buyer_note, s)),
      content,
    };
    mockImports.unshift(imp);
    return HttpResponse.json(toPreview(imp), { status: 201 });
  }),

  http.post(`${API}/imports/:id/commit`, ({ request, params }) => {
    const [user, denied] = requireRole(request, [...MANAGERS]);
    if (denied) return denied;
    const imp = mockImports.find((i) => i.id === params.id);
    if (!imp) return apiError(404, "NOT_FOUND", "Không tìm thấy lần nhập.");
    if (imp.created_by?.id !== user.id)
      return apiError(403, "FORBIDDEN", "Chỉ người tải file lên mới xác nhận nhập được.");
    if (imp.status === "EXPIRED" || Date.parse(imp.expires_at) < Date.now()) {
      imp.status = "EXPIRED";
      return apiError(409, "IMPORT_EXPIRED", "Bản xem trước đã hết hạn. Tải file lại.");
    }
    if (imp.status !== "PREVIEW")
      return apiError(409, "IMPORT_EXPIRED", "Bản xem trước đã hết hạn. Tải file lại.");
    if (imp.counts.error > 0)
      return apiError(409, "IMPORT_HAS_ERRORS", "File có dòng lỗi. Sửa file rồi tải lại.");
    applyImport(imp);
    imp.status = "COMMITTED";
    imp.committed_at = new Date().toISOString();
    return HttpResponse.json({ id: imp.id, status: imp.status, counts: imp.counts });
  }),

  http.get(`${API}/imports`, ({ request }) => {
    const [, denied] = requireRole(request, [...MANAGERS]);
    if (denied) return denied;
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? 1);
    const pageSize = Number(url.searchParams.get("page_size") ?? 20);
    const items = mockImports.slice((page - 1) * pageSize, page * pageSize).map(toHistory);
    return HttpResponse.json({ items, page, page_size: pageSize, total: mockImports.length });
  }),

  http.get(`${API}/imports/template`, ({ request }) => {
    const [, denied] = requireRole(request, [...MANAGERS]);
    if (denied) return denied;
    return new HttpResponse(`${TEMPLATE_COLUMNS.join(",")}\n`, {
      headers: { "Content-Type": "text/csv; charset=utf-8" },
    });
  }),

  http.get(`${API}/imports/:id/file`, ({ request, params }) => {
    const [, denied] = requireRole(request, [...MANAGERS]);
    if (denied) return denied;
    const imp = mockImports.find((i) => i.id === params.id);
    if (!imp) return apiError(404, "NOT_FOUND", "Không tìm thấy lần nhập.");
    if (imp.fileExpired) return apiError(410, "FILE_EXPIRED", "File gốc đã quá 90 ngày, không còn lưu.");
    return new HttpResponse(imp.content, { headers: { "Content-Type": "text/csv; charset=utf-8" } });
  }),
];
