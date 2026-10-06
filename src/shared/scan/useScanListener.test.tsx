/** QA G4: máy trạm bận làm JS xử lý phím trễ > 50 ms — lần quét vẫn phải được nhận (đo theo lúc phím được tạo). */
import { render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { hidScan } from "@/test/scan";

import { useScanListener } from "./useScanListener";

/** Như `hidScan` nhưng không có Enter (chuỗi nhanh bị bỏ dở). */
async function hidScanNoEnter(text: string) {
  let t = performance.now();
  const tick = () => (t += 5);
  window.addEventListener("keydown", tick, { capture: true });
  const spy = vi.spyOn(performance, "now").mockImplementation(() => t);
  const base = Date.now();
  const dateSpy = vi.spyOn(Date, "now").mockImplementation(() => base + t);
  try {
    await userEvent.setup({ delay: null }).keyboard(text);
  } finally {
    dateSpy.mockRestore();
    spy.mockRestore();
    window.removeEventListener("keydown", tick, { capture: true });
  }
}

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

describe("captureInInputs (DEC-237, TC-04.47)", () => {
  function Note({ onScan }: { onScan: (code: string) => void }) {
    const [value, setValue] = useState("Hộp móp");
    useScanListener(onScan, { captureInInputs: true });
    return <textarea aria-label="Ghi chú" value={value} onChange={(e) => setValue(e.target.value)} />;
  }

  test("quét HID khi focus ô ghi chú → nhận lần quét, ô không đổi", async () => {
    const onScan = vi.fn();
    render(<Note onScan={onScan} />);
    const box = screen.getByLabelText("Ghi chú");
    box.focus();

    await hidScan("SPXRTTST000041");

    expect(onScan).toHaveBeenCalledExactlyOnceWith("SPXRTTST000041");
    expect(box).toHaveValue("Hộp móp");
  });

  test("gõ tay chậm vào ô bình thường, không phải quét", async () => {
    const onScan = vi.fn();
    render(<Note onScan={onScan} />);
    const box = screen.getByLabelText("Ghi chú");

    await userEvent.setup({ delay: 80 }).type(box, " rách");

    expect(box).toHaveValue("Hộp móp rách");
    expect(onScan).not.toHaveBeenCalled();
  });

  test("chuỗi nhanh không kết thúc Enter (gõ nhanh) → ký tự bị chặn được chèn lại", async () => {
    const onScan = vi.fn();
    render(<Note onScan={onScan} />);
    const box = screen.getByLabelText("Ghi chú") as HTMLTextAreaElement;
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);

    await hidScanNoEnter("xy");
    await new Promise((r) => setTimeout(r, 150));

    expect(box).toHaveValue("Hộp mópxy");
    expect(onScan).not.toHaveBeenCalled();
  });
});
