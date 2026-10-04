import { ScanBuffer } from "./scanBuffer";

function type(buffer: ScanBuffer, text: string, startMs: number, gapMs: number): string | null {
  let result: string | null = null;
  [...text, "Enter"].forEach((key, i) => {
    const r = buffer.push(key, startMs + i * gapMs);
    if (r) result = r;
  });
  return result;
}

test("máy quét 15 ký tự 10 ms/phím → 1 lần quét", () => {
  expect(type(new ScanBuffer(), "SPXTST0000001", 0, 10)).toBe("SPXTST0000001");
});

test("gõ tay 200 ms/phím → không phải quét", () => {
  expect(type(new ScanBuffer(), "SPXTST0000001", 0, 200)).toBeNull();
});

test("mã ngắn hơn 4 ký tự bị bỏ (nhiễu)", () => {
  expect(type(new ScanBuffer(), "ABC", 0, 5)).toBeNull();
});

test("phím chậm chen giữa reset bộ đệm, lần quét sau vẫn đúng", () => {
  const buffer = new ScanBuffer();
  buffer.push("x", 0);
  buffer.push("y", 500);

  expect(type(buffer, "SPXTST0000002", 1000, 8)).toBe("SPXTST0000002");
});

test("phím đặc biệt (Shift) không thêm ký tự", () => {
  const buffer = new ScanBuffer();
  buffer.push("Shift", 0);
  ["S", "P", "X", "1"].forEach((k, i) => buffer.push(k, 5 + i * 5));

  expect(buffer.push("Enter", 30)).toBe("SPX1");
});
