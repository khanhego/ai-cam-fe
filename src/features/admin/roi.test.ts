/** RoiEditor — toạ độ → tỉ lệ (02b-admin §13 Unit), FR-01.04. */
import { describeRoi, rectFromPoints, roiValid, sameRoi, toRatio } from "./roi";

const box = { left: 100, top: 50, width: 640, height: 360 };

test("toRatio: px trong ảnh → tỉ lệ 0–1; ngoài ảnh kẹp về mép", () => {
  expect(toRatio(100, 50, box)).toEqual({ x: 0, y: 0 });
  expect(toRatio(420, 230, box)).toEqual({ x: 0.5, y: 0.5 });
  expect(toRatio(2000, -10, box)).toEqual({ x: 1, y: 0 });
  expect(toRatio(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
});

test("TC-01.05: kéo từ (0.2, 0.2) tới (0.8, 0.8) → {x:0.2, y:0.2, w:0.6, h:0.6}; kéo ngược cho cùng kết quả", () => {
  expect(rectFromPoints({ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 })).toEqual({ x: 0.2, y: 0.2, w: 0.6, h: 0.6 });
  expect(rectFromPoints({ x: 0.8, y: 0.8 }, { x: 0.2, y: 0.2 })).toEqual({ x: 0.2, y: 0.2, w: 0.6, h: 0.6 });
  expect(rectFromPoints({ x: 0.123456, y: 0 }, { x: 0.5, y: 1 })).toEqual({
    x: 0.1235,
    y: 0,
    w: 0.3765,
    h: 1,
  });
});

test("TC-01.06 (FE): w hoặc h < 5% → không hợp lệ (khóa Lưu); đúng 5% → hợp lệ", () => {
  expect(roiValid({ x: 0.2, y: 0.2, w: 0.04, h: 0.6 })).toBe(false);
  expect(roiValid({ x: 0.2, y: 0.2, w: 0.6, h: 0.049 })).toBe(false);
  expect(roiValid({ x: 0.2, y: 0.2, w: 0.05, h: 0.05 })).toBe(true);
  expect(roiValid({ x: 0.6, y: 0.2, w: 0.5, h: 0.5 })).toBe(false);
  expect(roiValid(null)).toBe(false);
});

test("sameRoi, describeRoi", () => {
  expect(sameRoi({ x: 0.2, y: 0.2, w: 0.6, h: 0.6 }, { x: 0.2, y: 0.2, w: 0.6, h: 0.6 })).toBe(true);
  expect(sameRoi(null, { x: 0, y: 0, w: 1, h: 1 })).toBe(false);
  expect(sameRoi(null, null)).toBe(true);
  expect(describeRoi({ x: 0.2, y: 0.205, w: 0.6, h: 0.6 })).toBe("x 20% · y 20,5% · rộng 60% · cao 60%");
});
