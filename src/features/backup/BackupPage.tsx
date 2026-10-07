import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { backupApi, type BackupStatus } from "@/lib/api/backup";
import { isApiError } from "@/lib/api/errors";
import { fmtDate, fmtShort } from "@/shared/format";
import { BACKUP_STATE } from "@/shared/labels";
import { Alert, Button, Dialog, EmptyState, PageHeader, Skeleton, StatusChip, toast } from "@/shared/ui";

import { BackupCards } from "./BackupCards";
import { BackupHistoryTable } from "./BackupHistoryTable";
import { BackupOptions } from "./BackupOptions";
import { ConfirmKeyDialog } from "./ConfirmKeyDialog";
import { COPY } from "./copy";
import { IssueAlert } from "./IssuesList";
import { writeLockTip } from "./rules";

/** Poll khi có lượt DB đang chạy (02b-admin §4); ngoài ra chỉ WS `backup.updated` invalidate. */
const RUNNING_POLL_MS = 15_000;

/** Nút khóa có tooltip: bọc `span` vì nút `disabled` không nhận sự kiện chuột. */
function Guarded({ tip, children }: { tip: string | null; children: ReactNode }) {
  return tip ? (
    <span title={tip} className="inline-flex">
      {children}
    </span>
  ) : (
    <>{children}</>
  );
}

function StatusHeader({
  s,
  onToggle,
  toggleBusy,
}: {
  s: BackupStatus;
  onToggle: (next: boolean) => void;
  toggleBusy: boolean;
}) {
  const [label, tone] = BACKUP_STATE[s.state];
  const { key } = s;
  const showSwitch = s.state === "ON" || s.state === "DISABLED" || s.state === "RESTORE_PENDING";
  return (
    <section aria-label={COPY.title} className="card mb-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <StatusChip tone={tone}>{label}</StatusChip>
        {s.storage && (
          <span className="text-body-md text-on-surface">
            {COPY.storage(s.storage.endpoint_host, s.storage.bucket)}
          </span>
        )}
      </div>
      {key.fingerprint && (
        <p className="mt-2 text-body-md text-on-surface">
          <span className="tabular-nums">{COPY.keyLine(key.fingerprint)}</span>
          {" · "}
          <span className="text-on-surface-variant">
            {key.confirmed_fingerprint === key.fingerprint && key.confirmed_at
              ? COPY.keyConfirmed(fmtDate(key.confirmed_at), key.confirmed_by?.display_name ?? "—")
              : COPY.keyNotConfirmed}
          </span>
        </p>
      )}
      {showSwitch && (
        <label className="mt-4 flex items-center gap-3 text-body-lg text-on-surface">
          <input
            type="checkbox"
            role="switch"
            checked={s.state === "ON"}
            aria-checked={s.state === "ON"}
            disabled={toggleBusy || s.state === "RESTORE_PENDING"}
            onChange={(e) => onToggle(e.target.checked)}
          />
          {COPY.enabledSwitch}
        </label>
      )}
    </section>
  );
}

/** Banner theo `state` (01 §10.5 D23): vàng chưa xác nhận, đỏ khóa đổi, vàng chờ kiểm khôi phục. */
function KeyBanner({ s, onConfirm }: { s: BackupStatus; onConfirm: () => void }) {
  const confirm = (
    <Button variant="text" onClick={onConfirm}>
      {COPY.banner.confirm}
    </Button>
  );
  if (s.state === "KEY_UNCONFIRMED")
    return (
      <Alert kind="warning" action={confirm}>
        {COPY.banner.unconfirmed}
      </Alert>
    );
  if (s.state === "KEY_CHANGED")
    return (
      <Alert kind="error" action={confirm}>
        {COPY.banner.changed}
      </Alert>
    );
  if (s.state === "RESTORE_PENDING") return <Alert kind="warning">{COPY.banner.restorePending}</Alert>;
  return null;
}

function testErrorText(e: unknown): string {
  if (!isApiError(e)) return COPY.generic;
  if (e.code === "CLOUD_AUTH_FAILED") return COPY.testAuthFailed;
  if (e.code === "CLOUD_UNREACHABLE") return COPY.testUnreachable;
  return e.message;
}

function BackupView({ s }: { s: BackupStatus }) {
  const qc = useQueryClient();
  const [keyDialog, setKeyDialog] = useState(false);
  const [disableDialog, setDisableDialog] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["backup"] });

  const test = useMutation({
    mutationFn: backupApi.test,
    onMutate: () => setTestError(null),
    onSuccess: () => toast(COPY.testOk),
    onError: (e) => setTestError(testErrorText(e)),
  });

  const runDb = useMutation({
    mutationFn: backupApi.runDb,
    onSuccess: () => {
      toast(COPY.runDbStarted);
      void refresh();
    },
    onError: (e) => {
      if (isApiError(e) && e.code === "BACKUP_KEY_UNCONFIRMED") {
        void refresh();
        return setKeyDialog(true);
      }
      if (isApiError(e) && e.code === "BACKUP_RUNNING") toast(COPY.runDbRunning);
      else toast(isApiError(e) ? e.message : COPY.generic);
      void refresh();
    },
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => backupApi.updateSettings({ enabled }),
    onSuccess: (data, enabled) => {
      qc.setQueryData(["backup"], data);
      void qc.invalidateQueries({ queryKey: ["health"] });
      setDisableDialog(false);
      toast(enabled ? COPY.enabledToast : COPY.disabledToast);
    },
    onError: (e) => {
      setDisableDialog(false);
      if (isApiError(e) && e.code === "BACKUP_KEY_UNCONFIRMED") setKeyDialog(true);
      else toast(isApiError(e) ? e.message : COPY.generic);
      void refresh();
    },
  });

  const runTip = writeLockTip(s) ?? (s.db.running ? COPY.cards.running : null);
  const showKeyDialog = keyDialog && !!s.key.fingerprint;

  return (
    <>
      <PageHeader
        title={COPY.title}
        subtitle={COPY.subtitle}
        actions={
          <>
            <Button variant="outlined" icon="lan" disabled={test.isPending} onClick={() => test.mutate()}>
              {test.isPending ? COPY.testing : COPY.testConnection}
            </Button>
            <Guarded tip={runTip}>
              <Button
                icon="backup"
                disabled={runTip !== null || runDb.isPending}
                onClick={() => runDb.mutate()}
              >
                {COPY.runDb}
              </Button>
            </Guarded>
          </>
        }
      />
      {testError && <Alert kind="error">{testError}</Alert>}
      <KeyBanner s={s} onConfirm={() => setKeyDialog(true)} />
      <StatusHeader
        s={s}
        toggleBusy={toggle.isPending}
        onToggle={(next) => (next ? toggle.mutate(true) : setDisableDialog(true))}
      />
      {s.last_error && (
        <Alert kind="warning">{COPY.lastError(fmtShort(s.last_error.at), s.last_error.message)}</Alert>
      )}
      <IssueAlert kind="HASH_MISMATCH" count={s.evidence.hash_mismatch} />
      <BackupCards status={s} />
      <BackupHistoryTable history={s.history} currentFp={s.key.fingerprint} />
      <BackupOptions status={s} />

      {showKeyDialog && (
        <ConfirmKeyDialog fingerprint={s.key.fingerprint!} onClose={() => setKeyDialog(false)} />
      )}
      {disableDialog && (
        <Dialog
          open
          title={COPY.disable.title}
          onClose={() => setDisableDialog(false)}
          closeLabel={COPY.disable.cancel}
          actions={
            <Button variant="danger" disabled={toggle.isPending} onClick={() => toggle.mutate(false)}>
              {COPY.disable.confirm}
            </Button>
          }
        >
          {COPY.disable.body}
        </Dialog>
      )}
    </>
  );
}

/** D23 — Sao lưu cloud (01 §10.5 D23, UC-20; API-180..185, 187, 188). Chỉ ADMIN (guard nhánh `settings`). */
export default function BackupPage() {
  const q = useQuery({
    queryKey: ["backup"],
    queryFn: backupApi.get,
    refetchInterval: (query) => (query.state.data?.db.running ? RUNNING_POLL_MS : false),
  });
  if (q.isPending)
    return (
      <>
        <PageHeader title={COPY.title} subtitle={COPY.subtitle} />
        <div className="card p-6">
          <Skeleton lines={6} className="h-8" />
        </div>
      </>
    );
  if (q.isError)
    return (
      <>
        <PageHeader title={COPY.title} subtitle={COPY.subtitle} />
        <Alert
          kind="error"
          action={
            <Button variant="text" onClick={() => q.refetch()}>
              {COPY.retry}
            </Button>
          }
        >
          {COPY.loadError}
        </Alert>
      </>
    );
  if (q.data.state === "NOT_CONFIGURED")
    return (
      <>
        <PageHeader title={COPY.title} subtitle={COPY.subtitle} />
        <EmptyState icon="cloud_off" title={COPY.notConfiguredTitle}>
          {COPY.notConfiguredBody}
        </EmptyState>
      </>
    );
  return <BackupView s={q.data} />;
}
