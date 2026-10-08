import { useMutation } from "@tanstack/react-query";

import { isApiError } from "@/lib/api/errors";
import { reportsApi, type ReportQuery, type ReportTab } from "@/lib/api/reports";
import { saveBlob } from "@/shared/download";
import { Button, toast } from "@/shared/ui";

import { REPORT_COPY } from "./reportCopy";
import { csvFileName } from "./reportParams";

/**
 * "Xuất CSV" D20 (FR-09.06; API-153): xuất mọi bảng của tab đang mở theo bộ lọc đang áp. Xong → Toast "Đã tải file
 * CSV."; lỗi → Toast `message` server (403 / 422 / 503) hoặc chữ chung. Khóa khi kỳ chưa hợp lệ.
 */
export function ExportCsvButton({
  tab,
  query,
  disabled,
}: {
  tab: ReportTab;
  query: ReportQuery;
  disabled?: boolean;
}) {
  const exp = useMutation({
    mutationFn: () => reportsApi.exportCsv(tab, query),
    onSuccess: (blob) => {
      saveBlob(blob, csvFileName(tab, query));
      toast(REPORT_COPY.csv.done);
    },
    onError: (e) => toast(isApiError(e) && e.message ? e.message : REPORT_COPY.csv.error),
  });
  return (
    <Button
      variant="outlined"
      icon="download"
      disabled={disabled || exp.isPending}
      onClick={() => exp.mutate()}
    >
      {REPORT_COPY.csv.button}
    </Button>
  );
}
