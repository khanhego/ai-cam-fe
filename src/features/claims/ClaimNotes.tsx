import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { claimsApi, type ClaimDetail } from "@/lib/api/claims";
import { isApiError } from "@/lib/api/errors";
import { fmtShort } from "@/shared/format";
import { Alert, Button, TextAreaField } from "@/shared/ui";

import { COPY } from "./copy";

const N = COPY.notes;
const MAX = 1000;

/**
 * Ghi chú hồ sơ (01 §10.5 D17, FR-08.02, API-135): dòng thời gian (giờ, người / "Hệ thống", nội dung — đổi trạng thái tự
 * ghi) + ô thêm 1–1000 ký tự. Hồ sơ đã Đóng vẫn thêm được. API-135 không tăng `version` (BE DEC-312 c) → chỉ tải lại.
 */
export function ClaimNotes({ claim }: { claim: ClaimDetail }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const add = useMutation({
    mutationFn: (t: string) => claimsApi.addNote(claim.id, t),
    onSuccess: () => {
      setText("");
      setTouched(false);
      void qc.invalidateQueries({ queryKey: ["claim", claim.id] });
    },
  });
  const t = text.trim();
  const error = t.length < 1 || t.length > MAX ? N.rule : undefined;
  const fieldError =
    isApiError(add.error) && add.error.code === "VALIDATION_ERROR" ? add.error.fieldErrors.text : undefined;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!error) add.mutate(t);
  };
  return (
    <div className="flex flex-col gap-3">
      {claim.notes.length === 0 ? (
        <p className="text-body-md text-on-surface-variant">{N.empty}</p>
      ) : (
        <ol className="flex flex-col gap-2" aria-label={N.title}>
          {claim.notes.map((n) => (
            <li key={n.id} className="flex flex-col text-body-md text-on-surface sm:flex-row sm:gap-3">
              <span className="shrink-0 text-on-surface-variant tabular-nums sm:w-40">
                {fmtShort(n.at)} · {n.author?.display_name ?? N.system}
              </span>
              <span className="whitespace-pre-wrap">{n.text}</span>
            </li>
          ))}
        </ol>
      )}
      <form onSubmit={submit} noValidate className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
        <TextAreaField
          name="claim-note-new"
          label={N.add}
          rows={2}
          className="flex-1"
          value={text}
          error={(touched ? error : undefined) ?? fieldError}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" variant="tonal" disabled={add.isPending} className="sm:mt-2">
          {N.send}
        </Button>
      </form>
      {add.error && !fieldError && (
        <Alert kind="error">{isApiError(add.error) ? add.error.message : COPY.generic}</Alert>
      )}
    </div>
  );
}
