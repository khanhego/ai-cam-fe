import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { backupApi, type BackupIssue, type ResolveIssueAction } from "@/lib/api/backup";
import { fmtShort, shortHash } from "@/shared/format";
import { BACKUP_ISSUE_KIND } from "@/shared/labels";
import { Alert, Button, Skeleton, TrackingNumber } from "@/shared/ui";

import { COPY } from "./copy";
import { ResolveIssueDialog } from "./ResolveIssueDialog";
import type { IssueAlertKind } from "./rules";

const I = COPY.issues;

/** Nút theo loại vấn đề (FE chỉ hiện hành động hợp lệ — 02 §6.2 API-188, DEC-525). */
const ACTIONS: Record<IssueAlertKind, ResolveIssueAction[]> = {
  HASH_MISMATCH: ["UPLOAD_ANYWAY", "IGNORE"],
  SOURCE_MISSING: ["RETRY", "IGNORE"],
};
const ACTION_LABEL: Record<ResolveIssueAction, string> = {
  UPLOAD_ANYWAY: I.uploadAnyway,
  IGNORE: I.ignore,
  RETRY: I.retry,
};

function IssueRow({
  issue,
  kind,
  onAction,
}: {
  issue: BackupIssue;
  kind: IssueAlertKind;
  onAction: (action: ResolveIssueAction) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-body-md text-on-surface">
          <span className="text-label-md text-on-surface-variant">{I.type[issue.kind] ?? issue.kind}</span>
          {issue.tracking_number && issue.package_id ? (
            <TrackingNumber value={issue.tracking_number} to={`/admin/packages/${issue.package_id}`} />
          ) : (
            <span className="text-on-surface-variant">{issue.tracking_number ?? I.noTracking}</span>
          )}
        </p>
        <p className="text-body-sm text-on-surface-variant tabular-nums">
          {I.detectedAt(fmtShort(issue.detected_at))}
          {issue.sha256_expected && issue.sha256_actual && (
            <span className="ml-2 font-mono">
              · {I.hashes(shortHash(issue.sha256_expected), shortHash(issue.sha256_actual))}
            </span>
          )}
        </p>
      </div>
      <div className="flex gap-2">
        {ACTIONS[kind].map((a) => (
          <Button
            key={a}
            size="sm"
            variant={a === "IGNORE" ? "text" : "tonal"}
            aria-label={`${ACTION_LABEL[a]} — ${issue.tracking_number ?? I.noTracking}`}
            onClick={() => onAction(a)}
          >
            {ACTION_LABEL[a]}
          </Button>
        ))}
      </div>
    </li>
  );
}

/** Danh sách tệp một loại vấn đề (API-185, mặc định chỉ mục chưa xử lý; trang 1 — ≤ 20 mục). */
function IssueItems({ kind }: { kind: IssueAlertKind }) {
  const [pending, setPending] = useState<{ issue: BackupIssue; action: ResolveIssueAction } | null>(null);
  const q = useQuery({
    queryKey: ["backup", "issues", kind],
    queryFn: () => backupApi.issues({ kind }),
  });
  if (q.isPending) return <Skeleton lines={2} className="h-8" />;
  if (q.isError)
    return (
      <Alert
        kind="error"
        action={
          <Button variant="text" onClick={() => q.refetch()}>
            {COPY.retry}
          </Button>
        }
      >
        {I.loadError}
      </Alert>
    );
  return (
    <>
      <ul className="divide-y divide-outline-variant" aria-label={I.listLabel(BACKUP_ISSUE_KIND[kind])}>
        {q.data.items.map((it) => (
          <IssueRow
            key={it.object_id}
            issue={it}
            kind={kind}
            onAction={(action) => setPending({ issue: it, action })}
          />
        ))}
      </ul>
      {q.data.total > q.data.items.length && (
        <p className="pt-2 text-body-sm text-on-surface-variant">
          {I.more(q.data.items.length, q.data.total)}
        </p>
      )}
      {pending && (
        <ResolveIssueDialog
          issue={pending.issue}
          issueKind={kind}
          action={pending.action}
          onClose={() => setPending(null)}
        />
      )}
    </>
  );
}

/**
 * Alert đỏ + "Xem danh sách" (01 §10.5 D23): `HASH_MISMATCH` (EX-K6) theo `evidence.hash_mismatch`, `SOURCE_MISSING`
 * (EX-K9) theo `evidence.source_missing`. Một danh sách theo `kind` (DEC-525), đếm = 0 → không hiện.
 */
export function IssueAlert({ kind, count }: { kind: IssueAlertKind; count: number }) {
  const [open, setOpen] = useState(false);
  if (count <= 0) return null;
  return (
    <div className="mb-4">
      <Alert
        kind="error"
        action={
          <Button variant="text" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? I.hide : I.show}
          </Button>
        }
      >
        {kind === "HASH_MISMATCH" ? I.hashAlert(count) : I.sourceAlert(count)}
      </Alert>
      {open && (
        <div className="card -mt-2 mb-4 px-4 py-2">
          <IssueItems kind={kind} />
        </div>
      )}
    </div>
  );
}
