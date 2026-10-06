/** Bộ lọc D16 ↔ URL (02b-admin §13 unit "filters URL D16"). */
import { claimFiltersFromParams, paramsFromClaimFilters, toApiClaimFilters } from "./filters";

test("URL → bộ lọc: tab mặc định Mới, bỏ giá trị lạ, owner chỉ nhận 'me', trang 1 không ghi", () => {
  const f = claimFiltersFromParams(
    new URLSearchParams("type=EMPTY_BOX&counterparty=XX&owner=u-1&due=soon&q=%20KN-000124%20&page=1&la=x"),
  );
  expect(f).toEqual({
    status: "NEW",
    type: "EMPTY_BOX",
    counterparty: undefined,
    owner: undefined,
    due: "soon",
    q: "KN-000124",
    page: undefined,
  });
  expect(paramsFromClaimFilters(f)).toEqual({ type: "EMPTY_BOX", due: "soon", q: "KN-000124" });
});

test("tab Tất cả → API không gửi status; Của tôi → owner=me; trang", () => {
  const f = claimFiltersFromParams(new URLSearchParams("status=ALL&owner=me&page=3"));
  expect(paramsFromClaimFilters(f)).toEqual({ status: "ALL", owner: "me", page: "3" });
  expect(toApiClaimFilters(f)).toMatchObject({ status: undefined, owner: "me", page: 3, page_size: 20 });
  expect(toApiClaimFilters(claimFiltersFromParams(new URLSearchParams("status=WON")))).toMatchObject({
    status: "WON",
    page: 1,
  });
});
