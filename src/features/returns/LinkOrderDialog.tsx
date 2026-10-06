import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { isApiError } from "@/lib/api/errors";
import { packagesApi, type PackageListItem } from "@/lib/api/packages";
import { returnsApi, type ReturnListItem } from "@/lib/api/returns";
import { WAREHOUSE_STATUS } from "@/shared/labels";
import type { ReturnCaseStatus } from "@/shared/returns/types";
import { Alert, Button, Dialog, LinearProgress, StatusChip, TextField, toast } from "@/shared/ui";

import { COPY } from "./copy";

const C = COPY.link;
const OPEN: ReturnCaseStatus[] = ["EXPECTED", "INSPECTING", "PARTIALLY_RECEIVED", "MISSING"];
const MIN = 6;

/** Kiện đích có hồ sơ hàng hoàn đang mở → API-112 gộp hồ sơ chưa xác định vào đó (DEC-248). */
const mergeTarget = (p: PackageListItem, self: string) =>
  p.return_case && p.return_case.id !== self && OPEN.includes(p.return_case.status) ? p.return_case : null;

function Candidate({ p, self }: { p: PackageListItem; self: string }) {
  const merge = mergeTarget(p, self);
  const [label, tone] = WAREHOUSE_STATUS[p.warehouse_status] ?? ["—", "neutral"];
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-on-surface">{p.tracking_number}</span>
      {p.platform_order_sn && <span>{C.order(p.platform_order_sn)}</span>}
      <StatusChip tone={tone}>{label}</StatusChip>
      {merge && <StatusChip tone="info">{C.mergeInto(merge.code)}</StatusChip>}
    </span>
  );
}

/**
 * Dialog "Gắn đơn" cho hồ sơ hàng hoàn chưa xác định (01 §10.5 D4, UC-13, FR-04.13): ô "Mã đơn sàn hoặc mã vận đơn
 * gốc" → xem trước bằng API-30 (đơn nhiều kiện → chọn kiện; đơn đã có hồ sơ hàng hoàn mở → "Sẽ gộp vào HH-…") →
 * "Gắn đơn này" (API-112). Xong → toast (+ "Đã gộp KN-… vào KN-…" cho `merged_claims`) và mở D4 kiện đích (kiện tạm
 * bị xóa).
 */
export function LinkOrderDialog({
  returnCase,
  onClose,
}: {
  returnCase: ReturnListItem;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [q, setQ] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | undefined>();
  const [picked, setPicked] = useState<string | null>(null);

  const found = useQuery({
    queryKey: ["packages", { q, page: 1, page_size: 20 }],
    enabled: Boolean(q),
    queryFn: () => packagesApi.search({ q: q!, page: 1, page_size: 20 }),
  });
  const candidates = (found.data?.items ?? []).filter((p) => !p.is_placeholder);
  const chosen = candidates.length === 1 ? candidates[0]!.id : picked;

  const link = useMutation({
    mutationFn: (packageId: string) => returnsApi.linkOrder(returnCase.id, packageId),
    onSuccess: (result, packageId) => {
      toast(C.done(result.order?.platform_order_sn ?? ""));
      for (const m of result.merged_claims) toast(C.mergedClaim(m.from, m.into));
      for (const key of [["package"], ["packages"], ["returns"], ["claims"], ["daily"]])
        void qc.invalidateQueries({ queryKey: key });
      onClose();
      navigate(`/admin/packages/${packageId}`);
    },
    onError: (err) => {
      if (isApiError(err) && ["NOT_UNIDENTIFIED", "NOT_ELIGIBLE"].includes(err.code)) {
        void qc.invalidateQueries({ queryKey: ["package"] });
        void qc.invalidateQueries({ queryKey: ["returns"] });
      }
    },
  });

  const search = (e?: FormEvent) => {
    e?.preventDefault();
    const next = code.trim().toUpperCase();
    if (next.length < MIN) {
      setCodeError(C.min);
      return;
    }
    setCodeError(undefined);
    setPicked(null);
    link.reset();
    setQ(next);
  };

  const err = link.error;
  const errorText = !err
    ? null
    : isApiError(err) && err.code === "PACKAGE_ALREADY_RETURNED"
      ? C.alreadyReturned
      : isApiError(err)
        ? err.message
        : COPY.generic;

  return (
    <Dialog
      open
      wide
      title={C.title}
      onClose={onClose}
      actions={
        <Button disabled={!chosen || link.isPending} onClick={() => chosen && link.mutate(chosen)}>
          {C.submit}
        </Button>
      }
    >
      <form onSubmit={search} noValidate className="flex items-start gap-2">
        <TextField
          name="link-code"
          label={C.code}
          hint={C.codeHint}
          error={codeError}
          value={code}
          className="flex-1"
          autoFocus
          onChange={(e) => setCode(e.target.value)}
        />
        <Button type="submit" variant="tonal" className="mt-1">
          {C.find}
        </Button>
      </form>
      {found.isFetching && <LinearProgress label={C.searching} />}
      {found.isError && (
        <Alert kind="error">{isApiError(found.error) ? found.error.message : COPY.generic}</Alert>
      )}
      {q && found.isSuccess && candidates.length === 0 && <Alert kind="warning">{C.notFound}</Alert>}
      {candidates.length === 1 && (
        <div className="mb-2 rounded-md bg-surface-container p-3" aria-label={C.preview} role="group">
          <Candidate p={candidates[0]!} self={returnCase.id} />
        </div>
      )}
      {candidates.length > 1 && (
        <fieldset className="mb-2 flex flex-col gap-1">
          <legend className="mb-1 text-label-lg text-on-surface">{C.pick}</legend>
          {candidates.map((p) => (
            <label key={p.id} className="flex items-center gap-3 rounded-md px-2 py-1">
              <input
                type="radio"
                name="link-package"
                aria-label={p.tracking_number}
                checked={picked === p.id}
                onChange={() => setPicked(p.id)}
              />
              <Candidate p={p} self={returnCase.id} />
            </label>
          ))}
        </fieldset>
      )}
      {errorText && <Alert kind="error">{errorText}</Alert>}
    </Dialog>
  );
}
