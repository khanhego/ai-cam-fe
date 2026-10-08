/** D20 `ReportFilters` ↔ URL + validate kỳ (02b-admin §5, §13 unit "ReportFilters validate kỳ", "định dạng tỷ lệ —"). */
import { fmtPct, fmtSeconds } from "./reportFormat";
import {
  claimsLink,
  packagesLink,
  paramsFromReportFilters,
  presetOf,
  reportFiltersFromParams,
  returnsLink,
  toReportQuery,
  validatePeriod,
} from "./reportParams";

const TODAY = "2026-10-05";
const p = (s: string) => new URLSearchParams(s);

test("URL rỗng → tab Hàng hoàn, kỳ 30 ngày tới hôm nay; ngày sai định dạng → kỳ mặc định", () => {
  expect(reportFiltersFromParams(p(""), TODAY)).toEqual({
    tab: "returns",
    from: "2026-09-06",
    to: "2026-10-05",
    platform: null,
    shop: null,
    station: null,
  });
  expect(reportFiltersFromParams(p("tab=xyz&from=06/09/2026&to=2026-10-05"), TODAY)).toMatchObject({
    tab: "returns",
    from: "2026-09-06",
  });
  expect(presetOf("2026-09-06", "2026-10-05", TODAY)).toBe(30);
  expect(presetOf("2026-09-29", "2026-10-05", TODAY)).toBe(7);
  expect(presetOf("2026-09-29", "2026-10-04", TODAY)).toBeNull();
});

test("URL ↔ bộ lọc khứ hồi; station chỉ ở tab Năng suất; query API dùng shop_id / station_id", () => {
  const f = reportFiltersFromParams(
    p("tab=productivity&from=2026-09-01&to=2026-09-30&platform=TIKTOK&shop=s1&station=st1"),
    TODAY,
  );
  expect(paramsFromReportFilters(f)).toEqual({
    tab: "productivity",
    from: "2026-09-01",
    to: "2026-09-30",
    platform: "TIKTOK",
    shop: "s1",
    station: "st1",
  });
  expect(toReportQuery(f)).toEqual({
    from: "2026-09-01",
    to: "2026-09-30",
    platform: "TIKTOK",
    shop_id: "s1",
    station_id: "st1",
  });
  const r = { ...f, tab: "returns" as const };
  expect(paramsFromReportFilters(r)).not.toHaveProperty("station");
  expect(toReportQuery(r)).not.toHaveProperty("station_id");
});

test("validate kỳ: đến < từ, > 366 ngày (tính 2 đầu), tương lai, thiếu", () => {
  expect(validatePeriod("2026-09-10", "2026-09-01", TODAY)).toEqual({ to: "Ngày đến phải sau ngày từ." });
  expect(validatePeriod("2025-10-04", "2026-10-05", TODAY)).toEqual({ from: "Chọn tối đa 366 ngày." });
  expect(validatePeriod("2025-10-05", "2026-10-05", TODAY)).toEqual({});
  expect(validatePeriod("2026-10-01", "2026-10-06", TODAY)).toEqual({
    to: "Không chọn ngày trong tương lai.",
  });
  expect(validatePeriod("", "", TODAY)).toEqual({ from: "Chọn ngày từ.", to: "Chọn ngày đến." });
  expect(validatePeriod("2026-10-05", "2026-10-05", TODAY)).toEqual({});
});

test("bấm số → URL đích (DEC-488): D14 kèm kỳ + sàn / shop; D16 không kỳ; D3 cắt ≤ 92 ngày", () => {
  const f = reportFiltersFromParams(p("from=2026-01-01&to=2026-10-05&platform=SHOPEE&shop=s1"), TODAY);
  expect(returnsLink(f, { tab: "RECEIVED" })).toBe(
    "/admin/returns?tab=RECEIVED&from=2026-01-01&to=2026-10-05&platform=SHOPEE&shop=s1",
  );
  expect(returnsLink(f, { tab: "EXPECTED", period: false })).toBe(
    "/admin/returns?tab=EXPECTED&platform=SHOPEE&shop=s1",
  );
  expect(returnsLink(f, { tab: "ALL", platform: "TIKTOK", shop: "t1" })).toContain("platform=TIKTOK&shop=t1");
  expect(claimsLink(f, { status: "NEW", due: "overdue" })).toBe(
    "/admin/claims?status=NEW&due=overdue&platform=SHOPEE&shop=s1",
  );
  expect(packagesLink(f, { station_id: "st1" })).toBe(
    "/admin/packages?station_id=st1&date_from=2026-07-05&date_to=2026-10-05&platform=SHOPEE&shop=s1",
  );
});

test("định dạng: tỷ lệ 4,0% / — ; giây → phút giây", () => {
  expect(fmtPct(0.04)).toBe("4,0%");
  expect(fmtPct(0.875)).toBe("87,5%");
  expect(fmtPct(null)).toBe("—");
  expect(fmtSeconds(90)).toBe("1 phút 30 giây");
  expect(fmtSeconds(45)).toBe("45 giây");
  expect(fmtSeconds(120)).toBe("2 phút");
  expect(fmtSeconds(3900)).toBe("1 giờ 5 phút");
  expect(fmtSeconds(null)).toBe("—");
});
