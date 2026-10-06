/** Bộ lọc D14 ↔ URL (02b-admin §13 unit "filters URL D14"). */
import { paramsFromReturnFilters, returnFiltersFromParams, toApiReturnFilters } from "./filters";

test("URL → bộ lọc: tab mặc định Đang về, bỏ giá trị lạ / ngày sai, trang 1 không ghi", () => {
  const f = returnFiltersFromParams(
    new URLSearchParams("kind=BUYER_RETURN&tab=XX&q=%20SPXRTTST000041%20&from=2026-10-01&to=10/10&page=1"),
  );
  expect(f).toEqual({
    tab: "EXPECTED",
    kind: "BUYER_RETURN",
    q: "SPXRTTST000041",
    from: "2026-10-01",
    to: undefined,
    page: undefined,
  });
  expect(paramsFromReturnFilters(f)).toEqual({
    kind: "BUYER_RETURN",
    q: "SPXRTTST000041",
    from: "2026-10-01",
  });
});

test("tab khác mặc định ghi vào URL; from / to → date_from / date_to; trang", () => {
  const f = returnFiltersFromParams(
    new URLSearchParams("tab=NO_PARCEL&from=2026-10-01&to=2026-10-05&page=2"),
  );
  expect(paramsFromReturnFilters(f)).toEqual({
    tab: "NO_PARCEL",
    from: "2026-10-01",
    to: "2026-10-05",
    page: "2",
  });
  expect(toApiReturnFilters(f)).toEqual({
    tab: "NO_PARCEL",
    kind: undefined,
    q: undefined,
    date_from: "2026-10-01",
    date_to: "2026-10-05",
    page: 2,
    page_size: 20,
  });
});
