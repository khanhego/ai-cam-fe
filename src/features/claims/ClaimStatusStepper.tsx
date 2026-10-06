import { useEffect, useRef, useState } from "react";

import { claimsApi, type ClaimDetail, type ClaimStatus } from "@/lib/api/claims";
import { isApiError } from "@/lib/api/errors";
import { CLAIM_STATUS } from "@/shared/returns/labels";
import { Alert, Button, cx, Dialog, Icon, TextAreaField, TextField } from "@/shared/ui";

import { COPY } from "./copy";
import { claimErrorText, useClaimMutation } from "./useClaimMutation";

const T = COPY.transition;
const D = COPY.detail;
const EARLY_CLOSE: ClaimStatus[] = ["NEW", "SUBMITTED", "WAITING"];
const STEP_INDEX: Record<ClaimStatus, number> = {
  NEW: 0,
  SUBMITTED: 1,
  WAITING: 2,
  WON: 3,
  LOST: 3,
  CLOSED: 4,
};

/** Tiến trình Mới → Đã gửi → Đang chờ → Thắng / Thua → Đóng (01 §10.5 D17) — `ol` + `aria-current="step"` (02b §9). */
export function ClaimSteps({ status, outcome }: { status: ClaimStatus; outcome?: "WON" | "LOST" | null }) {
  const current = STEP_INDEX[status];
  const result = status === "WON" || status === "LOST" ? status : outcome;
  const labels = [
    CLAIM_STATUS.NEW[0],
    CLAIM_STATUS.SUBMITTED[0],
    CLAIM_STATUS.WAITING[0],
    result ? CLAIM_STATUS[result][0] : `${CLAIM_STATUS.WON[0]} / ${CLAIM_STATUS.LOST[0]}`,
    CLAIM_STATUS.CLOSED[0],
  ];
  return (
    <ol aria-label={D.stepper} className="flex flex-wrap items-center gap-1 text-label-lg">
      {labels.map((label, i) => (
        <li key={i} aria-current={i === current ? "step" : undefined} className="flex items-center gap-1">
          {i > 0 && <Icon name="chevron_right" size={16} className="text-on-surface-variant" />}
          <span
            className={cx(
              "rounded-sm px-2 py-0.5",
              i === current
                ? "bg-primary text-on-primary"
                : i < current
                  ? "bg-secondary-container text-on-secondary-container"
                  : "text-on-surface-variant",
            )}
          >
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

type TransitionVars = { to: ClaimStatus; ref: string; reason: string; amount: string };

/**
 * Dialog theo trạng thái đích (01 §10.5 D17, 02b §5): "Đã gửi" cần mã tham chiếu sàn (hoặc ghi chú "Gửi qua chat
 * sàn"); "Thắng" cần số tiền thu hồi (số nguyên ≥ 0 đ); "Đóng" từ Mới / Đã gửi / Đang chờ cần lý do 5–500 + cảnh báo
 * xóa theo thời hạn lưu. Lỗi server: `VALIDATION_ERROR.fields`, `INVALID_TRANSITION`, `VERSION_CONFLICT` (giữ giá trị
 * đang nhập).
 */
function TransitionDialog({
  claim,
  to,
  onClose,
}: {
  claim: ClaimDetail;
  to: ClaimStatus;
  onClose: () => void;
}) {
  const [ref, setRef] = useState(claim.platform_claim_ref ?? "");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState(claim.recovered_amount != null ? String(claim.recovered_amount) : "");
  const [touched, setTouched] = useState(false);
  const save = useClaimMutation<TransitionVars>(
    claim.id,
    (v, current) =>
      claimsApi.patch(claim.id, {
        version: current.version,
        status: v.to,
        platform_claim_ref: v.to === "SUBMITTED" && v.ref.trim() ? v.ref.trim() : null,
        recovered_amount: v.to === "WON" ? Number(v.amount) : null,
        reason: v.reason.trim() || null,
      }),
    onClose,
  );

  const r = reason.trim();
  const reasonBad = r.length > 0 && (r.length < 5 || r.length > 500);
  const errors: Record<string, string | undefined> = {
    ref:
      to === "SUBMITTED" && !ref.trim() && !r ? T.refOrReason : ref.trim().length > 64 ? D.refMax : undefined,
    amount: to === "WON" && !/^\d+$/.test(amount.trim()) ? T.amountRule : undefined,
    reason:
      (to === "CLOSED" && EARLY_CLOSE.includes(claim.status) && !r) || reasonBad ? T.reasonRule : undefined,
  };
  const valid = !Object.values(errors).some(Boolean);
  const fields =
    isApiError(save.error) && save.error.code === "VALIDATION_ERROR" ? save.error.fieldErrors : {};
  const show = (k: string, server: string) => (touched ? errors[k] : undefined) ?? fields[server];
  const alert = claimErrorText(save.error);
  const label = CLAIM_STATUS[to][0];

  return (
    <Dialog
      open
      title={T.title(label)}
      onClose={onClose}
      actions={
        <Button
          variant={to === "CLOSED" ? "danger" : "filled"}
          disabled={save.isPending}
          onClick={() => {
            setTouched(true);
            if (valid) save.mutate({ to, ref, reason, amount: amount.trim() });
          }}
        >
          {T.confirm}
        </Button>
      }
    >
      {to === "SUBMITTED" && (
        <>
          <p className="mb-3">{T.submittedHint}</p>
          <TextField
            name="transition-ref"
            label={T.ref}
            value={ref}
            maxLength={80}
            error={show("ref", "platform_claim_ref")}
            onChange={(e) => setRef(e.target.value)}
          />
        </>
      )}
      {to === "WON" && (
        <TextField
          name="transition-amount"
          label={T.amount}
          inputMode="numeric"
          value={amount}
          error={show("amount", "recovered_amount")}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
        />
      )}
      {to === "CLOSED" && <Alert kind="warning">{T.closeWarn}</Alert>}
      {(to === "SUBMITTED" || to === "CLOSED" || to === "LOST" || to === "WAITING" || to === "WON") && (
        <TextAreaField
          name="transition-reason"
          label={to === "SUBMITTED" ? T.sentNote : T.reason}
          rows={2}
          value={reason}
          error={show("reason", "reason")}
          onChange={(e) => setReason(e.target.value)}
        />
      )}
      {alert && <Alert kind="error">{alert}</Alert>}
    </Dialog>
  );
}

/**
 * Nút "Đổi trạng thái" (menu chỉ các bước hợp lệ — `allowed_transitions`, RF-21) + Dialog theo đích.
 * Hồ sơ đã Đóng (`allowed_transitions` rỗng) → không có nút.
 */
export function ClaimStatusMenu({ claim }: { claim: ClaimDetail }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<ClaimStatus | null>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [open]);
  if (claim.allowed_transitions.length === 0) return null;
  return (
    <div className="relative">
      <Button
        variant="tonal"
        trailingIcon="arrow_drop_down"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {D.changeStatus}
      </Button>
      {open && (
        <ul
          ref={menuRef}
          role="menu"
          aria-label={D.changeStatus}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          className="absolute z-10 mt-1 min-w-48 rounded-md bg-surface-container py-1 shadow-elevation-2"
        >
          {claim.allowed_transitions.map((s) => (
            <li key={s} role="none">
              <button
                type="button"
                role="menuitem"
                className="state-layer w-full px-4 py-2 text-left text-body-md text-on-surface"
                onClick={() => {
                  setOpen(false);
                  setTo(s);
                }}
              >
                {CLAIM_STATUS[s][0]}
              </button>
            </li>
          ))}
        </ul>
      )}
      {to && <TransitionDialog claim={claim} to={to} onClose={() => setTo(null)} />}
    </div>
  );
}
