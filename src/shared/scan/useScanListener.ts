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
      const code = buffer.push(e.key, performance.now());
      if (code) {
        e.preventDefault();
        handler.current(code);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled, allowInInputs]);
}
