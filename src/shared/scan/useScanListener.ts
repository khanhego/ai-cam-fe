import { useEffect, useLayoutEffect, useRef } from "react";

import { MAX_GAP_MS, ScanBuffer } from "./scanBuffer";

type Editable = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

const isEditable = (target: EventTarget | null): target is Editable =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement;

/** Đặt `value` qua setter gốc rồi phát `input` để React (ô có kiểm soát) nhận giá trị mới. */
function setNativeValue(el: Editable, value: string) {
  const proto = Object.getPrototypeOf(el) as object;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  if (el instanceof HTMLSelectElement) el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Chèn lại các phím đã chặn khi chuỗi nhanh hóa ra không phải lần quét (người gõ nhanh). */
function insertText(el: Editable, text: string) {
  if (el instanceof HTMLSelectElement || !text) return;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  setNativeValue(el, el.value.slice(0, start) + text + el.value.slice(end));
  el.setSelectionRange(start + text.length, start + text.length);
}

/**
 * Nghe máy quét toàn trang. Mặc định bỏ qua khi đang gõ trong ô nhập (form đăng nhập, ghi chú);
 * `allowInInputs` cho ô tìm kiếm D3 nhận mã quét (ký tự vẫn vào ô);
 * `captureInInputs` (02b-station §4, DEC-237): trong ô nhập vẫn nhận lần quét **và không để mã lọt vào ô** — ký tự
 * đầu của chuỗi nhanh đã vào ô được gỡ lại khi chuỗi kết thúc bằng Enter, các ký tự sau bị chặn; chuỗi nhanh không
 * kết thúc bằng Enter (gõ tay nhanh) → ký tự đã chặn được chèn trả lại. Gõ tay chậm vào ô bình thường.
 */
export function useScanListener(
  onScan: (code: string) => void,
  {
    enabled = true,
    allowInInputs = false,
    captureInInputs = false,
  }: { enabled?: boolean; allowInInputs?: boolean; captureInInputs?: boolean } = {},
) {
  const handler = useRef(onScan);
  useLayoutEffect(() => {
    handler.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;
    const buffer = new ScanBuffer();
    // Chế độ captureInInputs: ô đang nhận chuỗi nhanh, giá trị trước ký tự đầu, ký tự đã chặn.
    let field: { el: Editable; before: string; held: string } | null = null;
    let lastAt = -Infinity;
    let flushTimer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      clearTimeout(flushTimer);
      if (field?.held) insertText(field.el, field.held);
      field = null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const typing = isTyping(e.target);
      if (typing && !allowInInputs && !captureInInputs) return;
      // Đo theo lúc phím được tạo (timeStamp), không theo lúc JS xử lý: máy trạm bận (encode, live view) làm luồng
      // chính trễ > 50 ms giữa hai phím thì lần quét vẫn được nhận (lỗi thấy ở QA G4 với E2E dưới tải).
      const at = e.timeStamp > 0 ? e.timeStamp : performance.now();
      const fast = at - lastAt <= MAX_GAP_MS;
      lastAt = at;
      const capture = captureInInputs && !allowInInputs && typing && isEditable(e.target);
      if (capture && e.key.length === 1) {
        if (!fast || field?.el !== e.target) {
          flush();
          field = { el: e.target as Editable, before: (e.target as Editable).value, held: "" };
        } else {
          e.preventDefault();
          field.held += e.key;
          clearTimeout(flushTimer);
          flushTimer = setTimeout(flush, MAX_GAP_MS * 2);
        }
      }
      const code = buffer.push(e.key, at);
      if (code) {
        e.preventDefault();
        clearTimeout(flushTimer);
        if (field) {
          if (field.el.value !== field.before) setNativeValue(field.el, field.before);
          field = null;
        }
        handler.current(code);
      } else if (e.key === "Enter" && field) {
        flush();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      clearTimeout(flushTimer);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [enabled, allowInInputs, captureInInputs]);
}
