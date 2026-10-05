/** QA G4: máy trạm bận làm JS xử lý phím trễ > 50 ms — lần quét vẫn phải được nhận (đo theo lúc phím được tạo). */
import { renderHook } from "@testing-library/react";

import { useScanListener } from "./useScanListener";

function keyEvents(code: string, start: number, gapMs: number): KeyboardEvent[] {
  const keys = [...code, "Enter"];
  return keys.map((key, i) => {
    vi.spyOn(Date, "now").mockReturnValue(start + i * gapMs); // jsdom: timeStamp = Date.now() lúc tạo
    const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    vi.mocked(Date.now).mockRestore();
    return ev;
  });
}

test("phím tạo cách nhau 5 ms nhưng xử lý trễ 200 ms/phím → vẫn là 1 lần quét", () => {
  const onScan = vi.fn();
  renderHook(() => useScanListener(onScan));
  let clock = 1_000;
  const perf = vi.spyOn(performance, "now").mockImplementation(() => clock);

  for (const ev of keyEvents("SPXTST0000001", 1_000_000, 5)) {
    clock += 200; // luồng chính bận: mỗi phím được xử lý trễ 200 ms
    window.dispatchEvent(ev);
  }
  perf.mockRestore();

  expect(onScan).toHaveBeenCalledExactlyOnceWith("SPXTST0000001");
});

test("phím thật sự cách nhau 120 ms (gõ tay) → không phải quét, dù xử lý ngay", () => {
  const onScan = vi.fn();
  renderHook(() => useScanListener(onScan));

  for (const ev of keyEvents("SPXTST0000001", 2_000_000, 120)) window.dispatchEvent(ev);

  expect(onScan).not.toHaveBeenCalled();
});
