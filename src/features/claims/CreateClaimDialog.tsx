import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { claimsApi, type ClaimDetail, type ClaimType, type Counterparty } from "@/lib/api/claims";
import { isApiError } from "@/lib/api/errors";
import { packagesApi } from "@/lib/api/packages";
import { WAREHOUSE_STATUS } from "@/shared/labels";
import { CLAIM_TYPE, COUNTERPARTY } from "@/shared/returns/labels";
import {
  Alert,
  Button,
  Dialog,
  LinearProgress,
  SegmentedButtons,
  SelectField,
  TextAreaField,
  TextField,
  toast,
} from "@/shared/ui";

import { screenReady } from "../shell/nav";
import { COPY } from "./copy";
import { claimPath } from "./paths";

const C = COPY.create;
const TYPES = Object.keys(CLAIM_TYPE) as ClaimType[];
const NOTE_MAX = 1000;

/** Kiện chọn bằng mã (D16 "Tạo hồ sơ" — 01 §10.5: Dialog nhập mã kiện). */
function PackagePicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const [code, setCode] = useState("");
  const [q, setQ] = useState<string | null>(null);
  const found = useQuery({
    queryKey: ["packages", { q, page: 1, page_size: 10 }],
    enabled: Boolean(q),
    queryFn: () => packagesApi.search({ q: q!, page: 1, page_size: 10 }),
  });
  const items = found.data?.items ?? [];
  const search = (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = code.trim().toUpperCase();
    onChange(null);
    setQ(next || null);
  };
  return (
    <div className="mb-2">
      <div className="flex items-start gap-2">
        <TextField
          name="claim-code"
          label={C.code}
          hint={C.codeHint}
          value={code}
          className="flex-1"
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") search(e);
          }}
        />
        <Button variant="tonal" className="mt-1" onClick={search}>
          {C.find}
        </Button>
      </div>
      {found.isFetching && (
        <div className="mb-3">
          <LinearProgress label={C.find} />
        </div>
      )}
      {q && found.isSuccess && items.length === 0 && <Alert kind="warning">{C.notFound}</Alert>}
      {found.isError && (
        <Alert kind="error">{isApiError(found.error) ? found.error.message : COPY.generic}</Alert>
      )}
      {items.length > 0 && (
        <fieldset className="mb-4 flex flex-col gap-1">
          <legend className="mb-1 text-label-lg text-on-surface">{C.pickPackage}</legend>
          {items.map((p) => (
            <label key={p.id} className="flex items-center gap-3 rounded-md px-2 py-1 text-on-surface">
              <input
                type="radio"
                name="claim-package"
                checked={value === p.id}
                onChange={() => onChange(p.id)}
              />
              <span className="font-mono">{p.tracking_number}</span>
              <span className="text-body-sm text-on-surface-variant">
                {p.platform_order_sn ?? "—"} · {WAREHOUSE_STATUS[p.warehouse_status]?.[0] ?? "—"}
              </span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}

type CreateClaimProps = {
  packageId?: string;
  returnCaseId?: string | null;
  reconAlertId?: string | null;
  defaultType?: ClaimType;
  defaultCounterparty?: Counterparty;
  onClose: () => void;
  onCreated?: (claim: ClaimDetail) => void;
};

/**
 * Form "Tạo hồ sơ khiếu nại" (01 §10.5 D4 / D14 / D15 / D16, FR-08.01, API-131) — dùng trong `CreateClaimDialog` và
 * Dialog "Xử lý cảnh báo" ở D15 (`reconAlertId`, nút "Xác nhận"). Loại mặc định theo ngữ cảnh (kết luận phiên hoàn /
 * "Khách báo thiếu / sai"; D15 BR-12 / 19: "Thất lạc" + ĐVVC). Trùng loại đang mở (BR-27, `409 CLAIM_EXISTS`) → Alert
 * + "Mở hồ sơ". Không có `packageId` → ô nhập mã kiện (API-30) rồi chọn kiện. Tạo xong → mở D17.
 */
export function CreateClaimForm({
  packageId,
  returnCaseId = null,
  reconAlertId = null,
  defaultType = "BUYER_CLAIM",
  defaultCounterparty = "PLATFORM",
  onClose,
  onCreated,
  submitLabel = C.submit,
  extraActions,
}: CreateClaimProps & { submitLabel?: string; extraActions?: ReactNode }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [picked, setPicked] = useState<string | null>(null);
  const [type, setType] = useState<ClaimType>(defaultType);
  const [counterparty, setCounterparty] = useState<Counterparty>(defaultCounterparty);
  const [note, setNote] = useState("");
  const pkgId = packageId ?? picked;
  const d17 = screenReady("D17");

  const create = useMutation({
    mutationFn: () =>
      claimsApi.create({
        package_id: pkgId!,
        type,
        counterparty,
        note: note.trim() || null,
        return_case_id: returnCaseId,
        recon_alert_id: reconAlertId,
      }),
    onSuccess: (claim) => {
      toast(C.created(claim.code));
      void qc.invalidateQueries({ queryKey: ["package", claim.package.id] });
      void qc.invalidateQueries({ queryKey: ["claims"] });
      void qc.invalidateQueries({ queryKey: ["daily"] });
      void qc.invalidateQueries({ queryKey: ["returns"] });
      if (reconAlertId) void qc.invalidateQueries({ queryKey: ["recon"] });
      onCreated?.(claim);
      onClose();
      if (d17) navigate(claimPath(claim.id));
    },
  });

  const err = create.error;
  const exists = isApiError(err) && err.code === "CLAIM_EXISTS" ? err : null;
  const fields = isApiError(err) && err.code === "VALIDATION_ERROR" ? err.fieldErrors : {};
  const otherError = err && !exists && Object.keys(fields).length === 0;
  const noteError = note.length > NOTE_MAX ? C.noteMax : fields.note;
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!pkgId || note.length > NOTE_MAX) return;
    create.mutate();
  };

  return (
    <div>
      {!packageId && <PackagePicker value={picked} onChange={setPicked} />}
      <form onSubmit={submit} noValidate>
        <SelectField
          name="claim-type"
          label={C.type}
          value={type}
          error={fields.type}
          onChange={(e) => setType(e.target.value as ClaimType)}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {CLAIM_TYPE[t]}
            </option>
          ))}
        </SelectField>
        <p className="mb-2 text-label-lg text-on-surface">{C.counterparty}</p>
        <div className="mb-5">
          <SegmentedButtons
            label={C.counterparty}
            options={[
              ["PLATFORM", COUNTERPARTY.PLATFORM],
              ["CARRIER", COUNTERPARTY.CARRIER],
            ]}
            value={counterparty}
            onChange={setCounterparty}
          />
          {fields.counterparty && <p className="mt-1 px-4 text-body-sm text-error">{fields.counterparty}</p>}
        </div>
        <TextAreaField
          name="claim-note"
          label={C.note}
          hint={C.noteHint}
          error={noteError}
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </form>
      {(fields.return_case_id || fields.recon_alert_id) && (
        <Alert kind="error">{fields.return_case_id ?? fields.recon_alert_id}</Alert>
      )}
      {exists && (
        <Alert
          kind="warning"
          action={
            d17 && typeof exists.details.claim_id === "string" ? (
              <Button
                variant="text"
                onClick={() => {
                  onClose();
                  navigate(claimPath(exists.details.claim_id as string));
                }}
              >
                {C.openExisting}
              </Button>
            ) : undefined
          }
        >
          {C.exists(CLAIM_TYPE[type], String(exists.details.code ?? ""))}
        </Alert>
      )}
      {otherError && <Alert kind="error">{isApiError(err) ? err.message : COPY.generic}</Alert>}
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        {extraActions}
        <Button onClick={() => submit()} disabled={!pkgId || create.isPending || note.length > NOTE_MAX}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

/** Dialog "Tạo hồ sơ khiếu nại" (D4, D14 Chỉ hoàn tiền, D16) — `CreateClaimForm` trong `Dialog`. */
export function CreateClaimDialog(props: CreateClaimProps) {
  return (
    <Dialog open title={C.title} onClose={props.onClose}>
      <CreateClaimForm {...props} />
    </Dialog>
  );
}
