import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { isApiError } from "@/lib/api/errors";
import { packagesApi, type AdjustStatusResult } from "@/lib/api/packages";
import { WAREHOUSE_STATUS, type WarehouseStatus } from "@/shared/labels";
import { Alert, Button, StatusChip, TextAreaField, toast } from "@/shared/ui";

import { COPY } from "./copy";

const C = COPY.adjust;
const REASON = { min: 5, max: 500 };

/**
 * Form "Điều chỉnh trạng thái kho" (01 §10.5 D4 / D15, FR-06.05, API-122) — dùng ở D4 (Dialog) và D15
 * (`ResolveAlertDialog`, `alertId`). Chỉ hiện trạng thái đích server cho phép (`allowed_status_targets`); "Lý do"
 * 5–500. `TRANSITION_NOT_ALLOWED` → thay danh sách bằng `details.allowed` + tải lại kiện; `SESSION_ACTIVE` → Alert.
 */
export function AdjustStatusForm({
  packageId,
  currentStatus,
  allowedTargets,
  alertId = null,
  onDone,
  extraActions,
  successMessage,
}: {
  packageId: string;
  currentStatus: WarehouseStatus;
  allowedTargets: WarehouseStatus[];
  alertId?: string | null;
  onDone?: (result: AdjustStatusResult) => void;
  /** Nút phụ đặt cạnh "Xác nhận" (vd. "Đóng" của Dialog). */
  extraActions?: ReactNode;
  /** Chữ toast khi xong (mặc định "Đã điều chỉnh trạng thái kho."; D15: "Đã xử lý cảnh báo."). */
  successMessage?: (result: AdjustStatusResult) => string;
}) {
  const qc = useQueryClient();
  const [targets, setTargets] = useState<WarehouseStatus[]>(allowedTargets);
  const [target, setTarget] = useState<WarehouseStatus | null>(
    allowedTargets.length === 1 ? allowedTargets[0]! : null,
  );
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  const adjust = useMutation({
    mutationFn: () =>
      packagesApi.adjustStatus(packageId, {
        to_status: target!,
        reason: reason.trim(),
        recon_alert_id: alertId,
      }),
    onSuccess: (result) => {
      toast(successMessage?.(result) ?? C.done);
      for (const key of [["package", packageId], ["packages"], ["recon"], ["daily"]])
        void qc.invalidateQueries({ queryKey: key });
      onDone?.(result);
    },
    onError: (err) => {
      if (isApiError(err) && err.code === "TRANSITION_NOT_ALLOWED") {
        const allowed = Array.isArray(err.details.allowed) ? (err.details.allowed as WarehouseStatus[]) : [];
        setTargets(allowed);
        setTarget((t) => (t && allowed.includes(t) ? t : null));
        void qc.invalidateQueries({ queryKey: ["package", packageId] });
      }
    },
  });

  const reasonText = reason.trim();
  const reasonError =
    reasonText.length < REASON.min || reasonText.length > REASON.max ? C.reasonRule : undefined;
  const err = adjust.error;
  const fields = isApiError(err) && err.code === "VALIDATION_ERROR" ? err.fieldErrors : {};
  const alert =
    err && !(isApiError(err) && err.code === "VALIDATION_ERROR")
      ? isApiError(err)
        ? err.message
        : COPY.generic
      : null;
  const [currentLabel, currentTone] = WAREHOUSE_STATUS[currentStatus] ?? ["—", "neutral"];

  return (
    <div>
      <p className="mb-3 flex items-center gap-2 text-on-surface">
        {C.current}: <StatusChip tone={currentTone}>{currentLabel}</StatusChip>
      </p>
      {targets.length === 0 ? (
        <Alert kind="warning">{C.noTargets}</Alert>
      ) : (
        <fieldset className="mb-4">
          <legend className="mb-2 text-label-lg text-on-surface">{C.target}</legend>
          <div className="flex flex-col gap-1">
            {targets.map((t) => (
              <label key={t} className="flex items-center gap-3 text-on-surface">
                <input
                  type="radio"
                  name="adjust-target"
                  checked={target === t}
                  onChange={() => setTarget(t)}
                />
                {WAREHOUSE_STATUS[t]?.[0] ?? t}
              </label>
            ))}
          </div>
          {touched && !target && <p className="mt-1 text-body-sm text-error">{C.targetRequired}</p>}
        </fieldset>
      )}
      <TextAreaField
        name="adjust-reason"
        label={C.reason}
        hint={C.reasonHint}
        rows={2}
        value={reason}
        error={(touched ? reasonError : undefined) ?? fields.reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {alert && <Alert kind="error">{alert}</Alert>}
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        {extraActions}
        <Button
          disabled={adjust.isPending || targets.length === 0}
          onClick={() => {
            setTouched(true);
            if (target && !reasonError) adjust.mutate();
          }}
        >
          {C.submit}
        </Button>
      </div>
    </div>
  );
}
