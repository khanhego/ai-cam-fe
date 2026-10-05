import type { Roi } from "@/lib/api/stations";

/** Cạnh nhỏ nhất của vùng đọc mã: 5% khung hình (02 §6.2 API-64, 02b-admin §5). */
export const ROI_MIN = 0.05;

export type Point = { x: number; y: number };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** 4 chữ số thập phân: đủ chính xác cho ảnh 4K, gửi API gọn. */
const round4 = (v: number) => Math.round(v * 10_000) / 10_000;

/** Toạ độ con trỏ (px màn hình) → tỉ lệ 0–1 trong khung ảnh; ra ngoài ảnh thì kẹp về mép. */
export function toRatio(
  clientX: number,
  clientY: number,
  box: { left: number; top: number; width: number; height: number },
): Point {
  if (box.width <= 0 || box.height <= 0) return { x: 0, y: 0 };
  return { x: clamp01((clientX - box.left) / box.width), y: clamp01((clientY - box.top) / box.height) };
}

/** Hai góc (kéo theo hướng bất kỳ) → khung `{x, y, w, h}` tỉ lệ 0–1, luôn nằm trong ảnh. */
export function rectFromPoints(a: Point, b: Point): Roi {
  const x1 = clamp01(Math.min(a.x, b.x));
  const y1 = clamp01(Math.min(a.y, b.y));
  const x2 = clamp01(Math.max(a.x, b.x));
  const y2 = clamp01(Math.max(a.y, b.y));
  return { x: round4(x1), y: round4(y1), w: round4(x2 - x1), h: round4(y2 - y1) };
}

/** Hợp lệ theo 02 §6.2: trong [0,1], w,h ≥ 5% (BE kiểm lại — `ROI_INVALID`). */
export function roiValid(roi: Roi | null): roi is Roi {
  if (!roi) return false;
  const inside = roi.x >= 0 && roi.y >= 0 && roi.x + roi.w <= 1.0001 && roi.y + roi.h <= 1.0001;
  return inside && roi.w >= ROI_MIN && roi.h >= ROI_MIN;
}

export const sameRoi = (a: Roi | null, b: Roi | null) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

/** `x 20% · y 20% · rộng 60% · cao 60%` cho dòng mô tả dưới ảnh. */
export function describeRoi(roi: Roi): string {
  const pct = (v: number) => `${Math.round(v * 1000) / 10}%`.replace(".", ",");
  return `x ${pct(roi.x)} · y ${pct(roi.y)} · rộng ${pct(roi.w)} · cao ${pct(roi.h)}`;
}

/** Khung mặc định khi bắt đầu bằng bàn phím (chưa có khung): giữa ảnh, 50% × 50%. */
export const ROI_DEFAULT: Roi = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };

/**
 * Bàn phím (a11y 02b §9, review G3 F37): `move` dời khung `dx`, `dy`; `resize` đổi rộng / cao. Luôn nằm trong ảnh,
 * cạnh không nhỏ hơn 1% (vẫn có thể < 5% để nút Lưu khóa như khi kéo chuột).
 */
export function nudgeRoi(roi: Roi, mode: "move" | "resize", dx: number, dy: number): Roi {
  if (mode === "move") {
    const x = Math.min(Math.max(0, roi.x + dx), 1 - roi.w);
    const y = Math.min(Math.max(0, roi.y + dy), 1 - roi.h);
    return { x: round4(x), y: round4(y), w: roi.w, h: roi.h };
  }
  const w = Math.min(Math.max(0.01, roi.w + dx), 1 - roi.x);
  const h = Math.min(Math.max(0.01, roi.h + dy), 1 - roi.y);
  return { x: roi.x, y: roi.y, w: round4(w), h: round4(h) };
}
