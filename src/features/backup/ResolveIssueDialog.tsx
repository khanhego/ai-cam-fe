import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { BACKUP_LIMITS, backupApi, type BackupIssue, type ResolveIssueAction } from "@/lib/api/backup";
import { isApiError } from "@/lib/api/errors";
import { Alert, Button, Dialog, TextAreaField, toast } from "@/shared/ui";

import { COPY } from "./copy";
import type { IssueAlertKind } from "./rules";

const R = COPY.resolve;

/**
 * Xử lý một tệp (01 §10.5 D23, EX-K6 / EX-K9; API-188): tiêu đề + chữ hệ quả theo hành động, ô "Lý do*" 5–500.
 * `IGNORE` một tệp không thấy tại kho thêm câu "Thiếu tệp" (DEC-530). Xong → Toast ("Đã xếp thử lại." cho `RETRY`,
 * "Đã ghi nhận." còn lại) + làm mới D23 / danh sách / D2. 409 `BACKUP_ISSUE_RESOLVED` / `BACKUP_ISSUE_ACTION_INVALID` →
 * Toast `message` + tải lại danh sách; 422 `fields.note` → lỗi dưới ô.
 */
export function ResolveIssueDialog({
  issue,
  issueKind,
  action,
  onClose,
}: {
  issue: BackupIssue;
  issueKind: IssueAlertKind;
  action: ResolveIssueAction;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const text = note.trim();
  const invalid = text.length < BACKUP_LIMITS.noteMin || text.length > BACKUP_LIMITS.noteMax;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["backup"] });
    void qc.invalidateQueries({ queryKey: ["daily"] });
  };
  const resolve = useMutation({
    mutationFn: () => backupApi.resolveIssue(issue.object_id, action, text),
    onSuccess: () => {
      toast(action === "RETRY" ? R.retried : R.done);
      refresh();
      onClose();
    },
    onError: (e) => {
      if (isApiError(e) && (e.code === "BACKUP_ISSUE_RESOLVED" || e.code === "BACKUP_ISSUE_ACTION_INVALID")) {
        toast(e.message);
        refresh();
        return onClose();
      }
      if (isApiError(e) && e.fieldErrors.note) return setFieldError(e.fieldErrors.note);
      setError(isApiError(e) ? e.message : COPY.generic);
    },
  });
  const danger = action === "IGNORE";
  return (
    <Dialog
      open
      title={R.title[action]}
      onClose={onClose}
      closeLabel={R.cancel}
      actions={
        <Button
          variant={danger ? "danger" : "filled"}
          disabled={resolve.isPending}
          onClick={() => {
            setTouched(true);
            setFieldError(undefined);
            if (!invalid) resolve.mutate();
          }}
        >
          {action === "UPLOAD_ANYWAY"
            ? COPY.issues.uploadAnyway
            : action === "RETRY"
              ? COPY.issues.retry
              : COPY.issues.ignore}
        </Button>
      }
    >
      {error && <Alert kind="error">{error}</Alert>}
      <p className="mb-2 text-on-surface">
        {COPY.issues.type[issue.kind] ?? issue.kind} · {issue.tracking_number ?? COPY.issues.noTracking}
      </p>
      <p className="mb-2">{R.body[action]}</p>
      {action === "IGNORE" && issueKind === "SOURCE_MISSING" && <p className="mb-2">{R.ignoreMissing}</p>}
      <TextAreaField
        name="backup-issue-note"
        label={R.reason}
        rows={2}
        maxLength={BACKUP_LIMITS.noteMax + 50}
        value={note}
        error={(touched && invalid ? R.reasonRule : undefined) ?? fieldError}
        onChange={(e) => setNote(e.target.value)}
        className="mt-4"
      />
    </Dialog>
  );
}
