import userEvent from "@testing-library/user-event";

/**
 * Giả lập máy quét HID trong test: gõ liền + Enter, đồng hồ `performance.now` đứng yên và chỉ tăng 5 ms mỗi lần
 * có phím nhấn (React cũng gọi `performance.now` nên không được tăng theo số lần gọi).
 * Không phụ thuộc tốc độ máy chạy test — trước đây khi cả suite chạy nặng, khoảng cách thật giữa 2 phím có lúc
 * > 50 ms nên chuỗi không được coi là quét (test EX-P9 chập chờn).
 */
export async function hidScan(code: string): Promise<void> {
  let t = performance.now();
  const tick = () => (t += 5);
  window.addEventListener("keydown", tick, { capture: true });
  const spy = vi.spyOn(performance, "now").mockImplementation(() => t);
  try {
    await userEvent.setup({ delay: null }).keyboard(`${code}{Enter}`);
  } finally {
    spy.mockRestore();
    window.removeEventListener("keydown", tick, { capture: true });
  }
}
