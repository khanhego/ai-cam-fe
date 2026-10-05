/** Bộ lọc D3 ↔ URL và rule client (02b-admin §5, §13 unit "filter ↔ URL"). TC-07.04 (phía client), TC-07.16. */
import { filtersFromParams, paramsFromFilters, validateFilters } from "./filters";

test("TC-07.16: URL → bộ lọc → URL giữ nguyên (bỏ tham số rỗng / lạ, trang 1 không ghi)", () => {
  const f = filtersFromParams(new URLSearchParams("q=SPX1&warehouse_status=PACKED&source=&page=1&la=x"));
  expect(f).toEqual({ q: "SPX1", warehouse_status: "PACKED" });
  expect(paramsFromFilters({ ...f, page: 3 })).toEqual({ q: "SPX1", warehouse_status: "PACKED", page: "3" });
});

test("TC-07.04: khoảng ngày 93 ngày bị chặn ở client; 92 ngày được", () => {
  expect(validateFilters({ date_from: "2026-07-01", date_to: "2026-10-02" })).toEqual({
    date_to: "Khoảng ngày tối đa 92 ngày.",
  });
  expect(validateFilters({ date_from: "2026-07-01", date_to: "2026-10-01" })).toEqual({});
});

test("ngày đến trước ngày từ; mã dài hơn 64 ký tự", () => {
  expect(validateFilters({ date_from: "2026-10-04", date_to: "2026-10-03" })).toEqual({
    date_to: "Ngày đến phải sau hoặc bằng ngày từ.",
  });
  expect(validateFilters({ q: "x".repeat(65) })).toEqual({ q: "Tối đa 64 ký tự." });
  expect(validateFilters({ q: "x".repeat(64), date_from: "2026-10-04", date_to: "2026-10-04" })).toEqual({});
});
