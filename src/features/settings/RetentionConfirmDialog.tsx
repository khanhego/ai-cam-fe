import { useQuery } from "@tanstack/react-query";

import { settingsApi, type RetentionImpact } from "@/lib/api/settings";
import { fmtHourMinute, fmtNumber } from "@/shared/format";
import { Alert, Button, Dialog, LinearProgress } from "@/shared/ui";

import { COPY } from "./copy";
import { fmtBytes } from "./rules";

const C = COPY.reduce;

/**
 * Dialog "Giảm thời gian lưu?" (01 §10.5 D8, BR-25, FR-02.10): số clip / dung lượng / giờ video thô lần dọn kế tiếp sẽ
 * xóa. Số liệu lấy từ `details.impact` của `409 RETENTION_REDUCTION_UNCONFIRMED` khi có, không thì gọi API-82 lúc mở
 * (không cache — 02b-admin §4); đang tính → `LinearProgress`; API-82 lỗi → khóa "Giảm và lưu" + "Thử lại".
 */
export function RetentionConfirmDialog({
  retention,
  impact: given,
  saving,
  onConfirm,
  onCancel,
}: {
  retention: { retention_raw_days: number; retention_clip_days: number };
  impact?: RetentionImpact | null;
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const query = useQuery({
    queryKey: ["retention-impact", retention],
    queryFn: () => settingsApi.retentionImpact(retention),
    enabled: !given,
    gcTime: 0,
    staleTime: 0,
    retry: false,
  });
  const impact = given ?? query.data;
  return (
    <Dialog
      open
      title={C.title}
      onClose={onCancel}
      closeLabel={C.cancel}
      actions={
        <Button variant="danger" disabled={!impact || saving} onClick={onConfirm}>
          {C.confirm}
        </Button>
      }
    >
      {!impact && query.isFetching && <LinearProgress label={C.loading} />}
      {!impact && query.isError && (
        <Alert
          kind="error"
          action={
            <Button variant="text" onClick={() => query.refetch()}>
              {C.retry}
            </Button>
          }
        >
          {C.error}
        </Alert>
      )}
      {impact && (
        <div className="flex flex-col gap-2">
          <p className="text-on-surface">
            {C.body(
              fmtHourMinute(impact.next_run_at),
              fmtNumber(impact.clips),
              fmtBytes(impact.clip_bytes),
              fmtNumber(impact.raw_hours),
            )}
          </p>
          <p>
            {C.protected}
            {impact.protected_clips > 0 && <> {C.protectedCount(fmtNumber(impact.protected_clips))}</>}
          </p>
        </div>
      )}
    </Dialog>
  );
}
