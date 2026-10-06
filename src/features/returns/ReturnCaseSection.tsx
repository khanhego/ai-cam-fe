import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import type { PackageSession } from "@/lib/api/packages";
import { returnsApi, type ReturnListItem } from "@/lib/api/returns";
import { fmtDate, fmtShort } from "@/shared/format";
import { SnapshotStrip } from "@/shared/media/SnapshotStrip";
import { RETURN_CASE_STATUS, RETURN_KIND } from "@/shared/returns/labels";
import { StatusChip, TrackingNumber } from "@/shared/ui";

import { ClaimChips } from "../claims/ClaimChips";
import { COPY } from "./copy";
import { InspectionView } from "./InspectionView";

const C = COPY.section;

/**
 * Khối "Hàng hoàn" của D4 (01 §10.5 D4, FR-07.02, 02.11): loại, mã yêu cầu, mã chiều về, lý do, sàn báo, hạn phản hồi
 * (API-111), kết quả kiểm theo dòng của từng phiên hoàn (`InspectionView`), ảnh, hồ sơ khiếu nại liên quan.
 * `caseActions` (Gắn đơn) và `inspectionActions` (Sửa kết luận) do D4 truyền theo quyền.
 */
export function ReturnCaseSection({
  returnCase,
  sessions,
  caseActions,
  inspectionActions,
  onSnapshotExpired,
}: {
  returnCase: ReturnListItem;
  sessions: PackageSession[];
  caseActions?: ReactNode;
  inspectionActions?: (session: PackageSession) => ReactNode;
  onSnapshotExpired?: () => void;
}) {
  // API-111: mã yêu cầu, lý do của khách, hạn phản hồi (item API-31 `return_cases[]` chỉ có phần như API-110).
  const detail = useQuery({
    queryKey: ["returns", "detail", returnCase.id],
    queryFn: () => returnsApi.get(returnCase.id),
  });
  const d = detail.data;
  const [kindLabel, kindTone] = RETURN_KIND[returnCase.kind] ?? ["—", "neutral"];
  const [statusLabel, statusTone] = RETURN_CASE_STATUS[returnCase.status] ?? ["—", "neutral"];
  const returnSessions = sessions.filter((s) => s.type === "RETURN" && s.inspection);
  const snapshots = returnSessions.flatMap((s) => s.snapshots ?? []);
  const reason = d?.reason_label ?? returnCase.reason_label;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-body-md text-on-surface">
        <StatusChip tone={kindTone}>{kindLabel}</StatusChip>
        <StatusChip tone={statusTone}>{statusLabel}</StatusChip>
        <span className="font-mono">{returnCase.code}</span>
        {d?.platform_return_sn && <span>· {C.request(d.platform_return_sn)}</span>}
        {returnCase.packages.length > 1 && <span>· {C.packages(returnCase.packages.length)}</span>}
        {returnCase.return_tracking_number && (
          <span className="inline-flex items-center gap-1">
            · {C.returnTracking} <TrackingNumber value={returnCase.return_tracking_number} />
          </span>
        )}
        {caseActions && <span className="ml-auto flex gap-2">{caseActions}</span>}
      </div>
      {(reason || returnCase.reported_at || d?.seller_due_at) && (
        <p className="text-body-md text-on-surface-variant">
          {reason && (
            <>
              {C.reason}: {reason}
              {d?.reason_text ? ` — “${d.reason_text}”` : ""}
            </>
          )}
          {returnCase.reported_at && (
            <>
              {reason ? " · " : ""}
              {C.reported} <span className="tabular-nums">{fmtShort(returnCase.reported_at)}</span>
            </>
          )}
          {d?.seller_due_at && (
            <>
              {" "}
              · {C.due} <span className="tabular-nums">{fmtDate(d.seller_due_at)}</span>
            </>
          )}
        </p>
      )}
      {returnSessions.length > 0 ? (
        returnSessions.map((s) => <InspectionView key={s.id} session={s} actions={inspectionActions?.(s)} />)
      ) : (
        <p className="text-body-md text-on-surface-variant">{C.noInspection}</p>
      )}
      {snapshots.length > 0 && (
        <SnapshotStrip snapshots={snapshots} label={C.photos} onExpired={onSnapshotExpired} />
      )}
      {returnCase.claims.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-title-sm text-on-surface">{C.claims}:</span>
          <ClaimChips claims={returnCase.claims} />
        </div>
      )}
    </div>
  );
}
