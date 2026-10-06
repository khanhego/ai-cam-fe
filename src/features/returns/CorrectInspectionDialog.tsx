import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { isApiError } from "@/lib/api/errors";
import type { PackageSession } from "@/lib/api/packages";
import { returnsApi, type ReturnListItem } from "@/lib/api/returns";
import {
  canBeOk,
  CONCLUSION_LABEL,
  CONCLUSIONS,
  CONDITION_LABEL,
  INSPECTION_LIMITS,
} from "@/shared/returns/inspection";
import type { Conclusion, InspectionLine, LineCondition } from "@/shared/returns/types";
import { Alert, Button, Dialog, TextAreaField, toast } from "@/shared/ui";

import { COPY } from "./copy";

const C = COPY.correct;
const REASON = { min: 5, max: 500 };

/**
 * Dialog "Sửa kết luận" phiên hoàn đã đóng (01 §10.5 D4, FR-04.11, API-113): dòng (số nhận, tình trạng — `FULL`),
 * kết luận (BR-22 qua `canBeOk` dùng chung station — DEC-236), ghi chú (bắt buộc khi "Khác"), "Lý do sửa" 5–500.
 * Hồ sơ nhiều kiện một phiên → "Áp cho cả {n} kiện của hồ sơ HH-…". Lỗi: `CONCLUSION_INCONSISTENT`,
 * `CORRECTION_WINDOW_EXPIRED` ("Đã quá 7 ngày, không sửa được."), `VALIDATION_ERROR.fields`.
 */
export function CorrectInspectionDialog({
  session,
  returnCase,
  onClose,
}: {
  session: PackageSession;
  returnCase?: ReturnListItem;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const inspection = session.inspection!;
  const mode = inspection.lines_mode;
  const [lines, setLines] = useState<InspectionLine[]>(inspection.lines);
  const [conclusion, setConclusion] = useState<Conclusion | null>(inspection.conclusion);
  const [note, setNote] = useState(inspection.note ?? "");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  const okAllowed = canBeOk(lines, mode);
  const reasonText = reason.trim();
  const localErrors = {
    conclusion: conclusion === "OK" && !okAllowed ? C.okLocked : undefined,
    note:
      note.length > INSPECTION_LIMITS.noteMax
        ? C.noteMax
        : conclusion === "OTHER" && !note.trim()
          ? C.noteRequired
          : undefined,
    reason: reasonText.length < REASON.min || reasonText.length > REASON.max ? C.reasonRule : undefined,
  };
  const valid = Boolean(conclusion) && !localErrors.conclusion && !localErrors.note && !localErrors.reason;

  const save = useMutation({
    mutationFn: () =>
      returnsApi.correctInspection(session.id, {
        conclusion,
        note,
        // REFERENCE (02 §6.3 #8): không gửi dòng thay đổi — server chỉ kiểm kết luận.
        lines:
          mode === "FULL"
            ? lines.map(({ order_item_id, quantity_received, condition, note: n }) => ({
                order_item_id,
                quantity_received,
                condition,
                note: n,
              }))
            : [],
        reason: reasonText,
      }),
    onSuccess: () => {
      toast(C.done);
      for (const key of [["package"], ["returns"], ["claims"], ["daily"]])
        void qc.invalidateQueries({ queryKey: key });
      onClose();
    },
    onError: (err) => {
      if (isApiError(err) && err.code === "CORRECTION_WINDOW_EXPIRED")
        void qc.invalidateQueries({ queryKey: ["package"] });
    },
  });

  const err = save.error;
  const fields = isApiError(err) && err.code === "VALIDATION_ERROR" ? err.fieldErrors : {};
  const alert = !err
    ? null
    : isApiError(err) && err.code === "CORRECTION_WINDOW_EXPIRED"
      ? C.expired
      : isApiError(err) && err.code === "VALIDATION_ERROR"
        ? null
        : isApiError(err)
          ? err.message
          : COPY.generic;
  const show = (k: keyof typeof localErrors) => (touched ? localErrors[k] : undefined) ?? fields[k];
  const update = (i: number, patch: Partial<InspectionLine>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const many = returnCase && returnCase.packages.length > 1;

  return (
    <Dialog
      open
      wide
      title={C.title}
      onClose={onClose}
      actions={
        <Button
          disabled={save.isPending}
          onClick={() => {
            setTouched(true);
            if (valid) save.mutate();
          }}
        >
          {C.submit}
        </Button>
      }
    >
      {many && <Alert kind="info">{C.applyAll(returnCase.packages.length, returnCase.code)}</Alert>}
      {mode === "REFERENCE" && <p className="mb-3">{C.reference}</p>}
      {lines.length > 0 && (
        <div className="mb-4 overflow-x-auto">
          <table className="md-table">
            <thead>
              <tr>
                <th className="pl-4">{COPY.inspection.product}</th>
                <th className="text-right">{COPY.inspection.requested}</th>
                <th>{COPY.inspection.received}</th>
                <th className="pr-4">{COPY.inspection.condition}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const name = [l.product_name, l.variation].filter(Boolean).join(" · ");
                const qtyError = fields[`lines.${i}.quantity_received`];
                return (
                  <tr key={l.order_item_id}>
                    <td className="pl-4">{name}</td>
                    <td className="text-right tabular-nums">{l.quantity_requested}</td>
                    <td>
                      {mode === "FULL" ? (
                        <>
                          <input
                            type="number"
                            min={INSPECTION_LIMITS.quantityMin}
                            max={INSPECTION_LIMITS.quantityMax}
                            aria-label={C.received(name)}
                            aria-invalid={qtyError ? true : undefined}
                            className="md-input h-10 w-20"
                            value={l.quantity_received}
                            onChange={(e) => {
                              const v = Math.trunc(Number(e.target.value));
                              const { quantityMin: lo, quantityMax: hi } = INSPECTION_LIMITS;
                              update(i, {
                                quantity_received: Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo,
                              });
                            }}
                          />
                          {qtyError && <p className="text-body-sm text-error">{qtyError}</p>}
                        </>
                      ) : (
                        <span className="tabular-nums">{l.quantity_received}</span>
                      )}
                    </td>
                    <td className="pr-4">
                      {mode === "FULL" ? (
                        <select
                          aria-label={C.condition(name)}
                          className="md-input h-10"
                          value={l.condition ?? "OK"}
                          onChange={(e) => update(i, { condition: e.target.value as LineCondition })}
                        >
                          {CONCLUSIONS.map((c) => (
                            <option key={c} value={c}>
                              {CONDITION_LABEL[c]}
                            </option>
                          ))}
                        </select>
                      ) : l.condition ? (
                        CONDITION_LABEL[l.condition]
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <fieldset className="mb-4">
        <legend className="mb-2 text-label-lg text-on-surface">{C.conclusion}</legend>
        <div role="radiogroup" aria-label={C.conclusion} className="flex flex-wrap gap-2">
          {CONCLUSIONS.map((c) => {
            const locked = c === "OK" && !okAllowed;
            return (
              <label
                key={c}
                title={locked ? C.okLocked : undefined}
                className="flex items-center gap-2 rounded-full border border-outline px-3 py-1 text-on-surface has-[:disabled]:opacity-38"
              >
                <input
                  type="radio"
                  name="correct-conclusion"
                  checked={conclusion === c}
                  disabled={locked}
                  onChange={() => setConclusion(c)}
                />
                {CONCLUSION_LABEL[c]}
              </label>
            );
          })}
        </div>
        {(show("conclusion") ?? fields.conclusion) && (
          <p className="mt-1 text-body-sm text-error">{show("conclusion") ?? fields.conclusion}</p>
        )}
      </fieldset>
      <TextAreaField
        name="correct-note"
        label={C.note}
        rows={2}
        value={note}
        error={show("note")}
        onChange={(e) => setNote(e.target.value)}
      />
      <TextAreaField
        name="correct-reason"
        label={C.reason}
        hint={C.reasonHint}
        rows={2}
        value={reason}
        error={show("reason")}
        onChange={(e) => setReason(e.target.value)}
      />
      {alert && <Alert kind="error">{alert}</Alert>}
    </Dialog>
  );
}
