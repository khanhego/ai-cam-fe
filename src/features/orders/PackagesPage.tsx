import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { isApiError } from "@/lib/api/errors";
import { packagesApi } from "@/lib/api/packages";
import { reportsApi } from "@/lib/api/reports";
import { useScanListener } from "@/shared/scan/useScanListener";
import { vnDay } from "@/shared/format";
import { Alert, Button, EmptyState, PageHeader, Pagination, Skeleton } from "@/shared/ui";

import { COPY } from "./copy";
import {
  filtersFromParams,
  hasFilters,
  PAGE_SIZE,
  paramsFromFilters,
  toApiFilters,
  type Filters,
} from "./filters";
import { PackageFilters } from "./PackageFilters";
import { PackageTable } from "./PackageTable";

/**
 * D3 — Tra cứu đơn (01 §10.5, FR-07.01, 07.03, UC-03). Bộ lọc ở URL (back / reload giữ nguyên, link từ thẻ D2).
 * Tìm bằng ô tìm (hoặc máy quét khi focus ngoài ô nhập) ra đúng 1 kiện → mở thẳng D4.
 */
export default function PackagesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filters = filtersFromParams(params);
  const apiFilters = toApiFilters(filters);
  /** Mã vừa tìm từ ô tìm / máy quét: kết quả 1 kiện thì mở D4 (chỉ lần tìm đó, không khi bấm Back). */
  const jumpFor = useRef<string | null>(null);
  const [searchSeq, setSearchSeq] = useState(0);

  const result = useQuery({
    queryKey: ["packages", apiFilters],
    queryFn: () => packagesApi.search(apiFilters),
    placeholderData: keepPreviousData,
  });
  // Danh sách station cho bộ lọc: API-60 chỉ ADMIN nên lấy từ API-32 (cả 3 vai đọc được — DEC-75).
  const today = vnDay();
  const daily = useQuery({ queryKey: ["daily", today], queryFn: () => reportsApi.daily(today) });
  const stations = daily.data?.stations.map((s) => ({ id: s.id, name: s.name })) ?? [];

  function apply(next: Filters, fromSearch: boolean) {
    jumpFor.current = fromSearch ? (next.q ?? null) : null;
    if (fromSearch) setSearchSeq((n) => n + 1);
    setParams(paramsFromFilters(next));
  }

  useScanListener((code) => apply({ ...filters, q: code }, true));

  const data = result.data;
  useEffect(() => {
    if (!data || result.isPlaceholderData || !jumpFor.current || jumpFor.current !== filters.q) return;
    jumpFor.current = null;
    if (data.total === 1 && data.items[0]) navigate(`/admin/packages/${data.items[0].id}`);
  }, [data, result.isPlaceholderData, filters.q, navigate, searchSeq]);

  const validation =
    isApiError(result.error) && result.error.code === "VALIDATION_ERROR" ? result.error : null;
  const clear = () => {
    jumpFor.current = null;
    setParams({});
  };

  return (
    <>
      <PageHeader title={COPY.search.title} subtitle={COPY.search.subtitle} />
      <PackageFilters
        valueKey={params.toString()}
        value={filters}
        stations={stations}
        serverErrors={validation?.fieldErrors}
        onApply={apply}
        onClear={clear}
      />
      {result.isError && !validation && (
        <Alert
          kind="error"
          action={
            <Button variant="text" onClick={() => result.refetch()}>
              {COPY.search.retry}
            </Button>
          }
        >
          {COPY.search.error}
        </Alert>
      )}
      {result.isPending && (
        <div className="card p-4" aria-busy="true" aria-label="Đang tải">
          <Skeleton lines={10} className="h-8" />
        </div>
      )}
      {data && data.total === 0 && !result.isError && (
        <EmptyState
          icon="search_off"
          title={filters.q ? COPY.search.notFoundCode(filters.q) : COPY.search.notFound}
          action={
            hasFilters(filters) ? (
              <Button variant="tonal" onClick={clear}>
                {COPY.search.clear}
              </Button>
            ) : undefined
          }
        />
      )}
      {data && data.total > 0 && !result.isError && (
        <div className="card" aria-busy={result.isFetching}>
          <PackageTable items={data.items} />
          <Pagination
            page={data.page}
            pageSize={data.page_size || PAGE_SIZE}
            total={data.total}
            onPage={(page) => apply({ ...filters, page }, false)}
          />
        </div>
      )}
    </>
  );
}
