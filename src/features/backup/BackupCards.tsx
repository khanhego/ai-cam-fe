import type { ReactNode } from "react";

import type { BackupStatus } from "@/lib/api/backup";
import { fmtHourMinute, fmtShort, vnDay } from "@/shared/format";
import { cx, Icon } from "@/shared/ui";

import { COPY } from "./copy";
import { fmtSize, fmtWhen, n } from "./format";

const C = COPY.cards;

function Card({ title, danger, children }: { title: string; danger?: boolean; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      className={cx("card p-4", danger && "ring-2 ring-error")}
      data-danger={danger ? "true" : undefined}
    >
      <h2 className="mb-2 text-title-sm text-on-surface-variant">{title}</h2>
      <div className="flex flex-col gap-1 text-body-md text-on-surface">{children}</div>
    </section>
  );
}

function Danger({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-1 text-body-md text-error">
      <Icon name="error" size={18} />
      {children}
    </p>
  );
}

/** "Lần kế 19:00" (hôm nay) / "Lần kế 07/10 01:00". */
const nextText = (iso: string) => C.next(vnDay(iso) === vnDay() ? fmtHourMinute(iso) : fmtShort(iso));

/**
 * 3 thẻ D23 (01 §10.5 D23, FR-02.15): DB đỏ khi `db.late` ("Chưa sao lưu được {giờ} giờ") hoặc
 * `consecutive_failures ≥ 2` ("2 lần sao lưu DB gần nhất không thành công" — DEC-500); Bằng chứng đỏ khi `late_count > 0`.
 */
export function BackupCards({ status }: { status: BackupStatus }) {
  const { db, evidence } = status;
  const failedTwice = db.consecutive_failures >= 2;
  const late = db.late && db.hours_since_success !== null;
  return (
    <div className="mb-6 grid gap-4 md:grid-cols-3">
      <Card title={C.db} danger={late || failedTwice}>
        <p className="tabular-nums">
          {db.last_success_at
            ? C.lastSuccess(fmtWhen(db.last_success_at), fmtSize(db.last_size_bytes))
            : C.never}
        </p>
        {db.running ? (
          <p className="text-on-surface-variant">{C.running}</p>
        ) : (
          db.next_run_at && <p className="text-on-surface-variant tabular-nums">{nextText(db.next_run_at)}</p>
        )}
        {late && <Danger>{C.late(Math.floor(db.hours_since_success!))}</Danger>}
        {failedTwice && <Danger>{C.failedTwice}</Danger>}
      </Card>
      <Card title={C.evidence} danger={evidence.late_count > 0}>
        <p className="tabular-nums">{C.uploaded(n(evidence.uploaded))}</p>
        <p className="tabular-nums text-on-surface-variant">{C.pending(n(evidence.pending))}</p>
        {evidence.late_count > 0 && <Danger>{C.lateFiles(n(evidence.late_count))}</Danger>}
      </Card>
      <Card title={C.cloud}>
        <p className="text-title-lg tabular-nums">{fmtSize(status.cloud_bytes)}</p>
      </Card>
    </div>
  );
}
