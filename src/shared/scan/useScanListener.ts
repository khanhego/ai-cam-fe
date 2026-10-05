import { useEffect, useLayoutEffect, useRef } from "react";

import { ScanBuffer } from "./scanBuffer";

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * Nghe máy quét toàn trang. Mặc định bỏ qua khi đang gõ trong ô nhập (form đăng nhập, ghi chú);
 * `allowInInputs` cho ô tìm kiếm D3 nhận mã quét.
 */
export function useScanListener(
  onScan: (code: string) => void,
  { enabled = true, allowInInputs = false }: { enabled?: boolean; allowInInputs?: boolean } = {},
) {
  const handler = useRef(onScan);
  useLayoutEffect(() => {
    handler.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;
    const buffer = new ScanBuffer();
    const onKeyDown = (e: KeyboardEvent) => {
      if (!allowInInputs && isTyping(e.target)) return;
      // Đo theo lúc phím được tạo (timeStamp), không theo lúc JS xử lý: máy trạm bận (encode, live view) làm luồng
      // chính trễ > 50 ms giữa hai phím thì lần quét vẫn được nhận (lỗi thấy ở QA G4 với E2E dưới tải).
      const code = buffer.push(e.key, e.timeStamp > 0 ? e.timeStamp : performance.now());
      if (code) {
        e.preventDefault();
        handler.current(code);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled, allowInInputs]);
}
