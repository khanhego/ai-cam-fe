import { useEffect, useRef, useState, type ReactNode } from "react";

import type { StationSession, StationState } from "@/lib/api/station";
import { canBeOk, INSPECTION_LIMITS, RETURN_KIND } from "@/shared/returns/inspection";
import { Alert, Button, StatusChip, TextAreaField } from "@/shared/ui";

import { CancelSessionDialog } from "../CancelSessionDialog";
import { COPY } from "../copy";
import { StationStatePanel } from "../StationStatePanel";
import { useStationStore, type InlineAlert } from "../stationStore";
import { mmss, useServerNow } from "../useServerClock";
import { ConclusionPicker } from "./ConclusionPicker";
import { InspectionTable } from "./InspectionTable";
import type { SaveStatus } from "./inspectionDraft";

const C = COPY.returns.inspecting;
/** Flush nháp 30 giây trước `abandon_at` (DEC-272). */
const FLUSH_BEFORE_ABANDON_MS = 30_000;

/** Mã đã quét / mã gốc / chip loại / đơn / lý do khách (01 §10.4 R2). */
export function ReturnHeader({ session }: { session: StationSession }) {
  const rc = session.return_case;
  const shown = rc?.return_tracking_number ?? session.package.tracking_number;
  const [kindLabel, kindTone] = rc ? RETURN_KIND[rc.kind] : ["", "neutral" as const];
  const reason = [rc?.reason_label, rc?.reason_text].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="font-mono text-display-md tracking-wide">{shown}</span>
        {rc && (
          <StatusChip tone={kindTone} className="h-8 px-3 text-title-md">
            {kindLabel}
          </StatusChip>
        )}
        {session.package.order && (
          <span className="text-title-lg">{C.order(session.package.order.platform_order_sn)}</span>
        )}
        {shown !== session.package.tracking_number && (
          <span className="text-title-lg">{C.original(session.package.tracking_number)}</span>
        )}
      </div>
      {reason && (
        <p className="text-title-lg">
          {C.reason} {reason}
        </p>
      )}
    </div>
  );
}

/** Chip trạng thái lưu nháp; lỗi → bấm để thử lại. */
export function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === "saved")
    return (
      <StatusChip tone="success" icon="cloud_done">
        {C.saved}
      </StatusChip>
    );
  if (status === "saving")
    return (
      <StatusChip tone="neutral" icon="cloud_upload">
        {C.saving}
      </StatusChip>
    );
  if (status === "error")
    return (
      <Button variant="tonal" size="sm" icon="cloud_off" onClick={onRetry}>
        {C.saveFailed}
      </Button>
    );
  return null;
}

/** Gửi nháp khi tới `warn_at` và 30 giây trước `abandon_at` theo đồng hồ server (DEC-272). */
function useDeadlineFlush(session: StationSession) {
  const offset = useStationStore((s) => s.clockOffsetMs);
  useEffect(() => {
    const now = Date.now() + offset;
    const at = [Date.parse(session.warn_at), Date.parse(session.abandon_at) - FLUSH_BEFORE_ABANDON_MS];
    const timers = at
      .filter((t) => Number.isFinite(t) && t > now)
      .map((t) => setTimeout(() => void useStationStore.getState().flushDraft(), t - now));
    return () => timers.forEach(clearTimeout);
  }, [session.id, session.warn_at, session.abandon_at, offset]);
}

/**
 * R2 — Đang kiểm hàng hoàn (01 §10.4, FR-04.02, 04.03, 04.05, 04.09). Nền `secondary-container`. Khối Kết luận + hướng
 * dẫn quét đóng dính đáy (DEC-239). `aside` = cột "Lúc đóng gói", `snapshots` = dải ảnh (T-134).
 */
export function InspectingPanel({
  state,
  inline,
  onCallManager,
  aside,
  snapshots,
}: {
  state: StationState;
  inline: InlineAlert | null;
  onCallManager: () => void;
  aside?: ReactNode;
  snapshots?: ReactNode;
}) {
  const session = state.session!;
  const draft = useStationStore((s) => s.draft);
  const editDraft = useStationStore((s) => s.editDraft);
  const flushDraft = useStationStore((s) => s.flushDraft);
  const now = useServerNow();
  const [cancelOpen, setCancelOpen] = useState(false);
  const firstConclusion = useRef<HTMLButtonElement>(null);
  const conclusionBlock = useRef<HTMLDivElement>(null);
  useDeadlineFlush(session);

  const required = inline?.code === "INSPECTION_REQUIRED";
  useEffect(() => {
    if (!required) return;
    conclusionBlock.current?.scrollIntoView?.({ block: "nearest" });
    firstConclusion.current?.focus();
  }, [required]);

  const elapsed = now - Date.parse(session.started_at);
  const warn = now >= Date.parse(session.warn_at);
  const warnMinutes = Math.round((Date.parse(session.warn_at) - Date.parse(session.started_at)) / 60_000);
  const lines = draft?.lines ?? session.inspection?.lines ?? [];
  const mode = draft?.linesMode ?? session.inspection?.lines_mode ?? "FULL";
  const conclusion = draft?.conclusion ?? null;
  const errors = draft?.fieldErrors ?? {};
  const conclusionErr = required ? C.inspectionRequired : errors.conclusion;

  return (
    <StationStatePanel
      tone="secondary"
      icon="assignment_return"
      title={C.title}
      aside={
        <span className="text-title-lg tabular-nums">
          {COPY.packing.timer} <span className="font-mono">{mmss(elapsed)}</span>
        </span>
      }
    >
      {warn && <Alert kind="warning">{C.warn(warnMinutes)}</Alert>}
      {inline?.code === "RETURN_CODE_DIFFERENT" && (
        <Alert kind="warning">
          <span className="text-title-lg">{C.codeDifferent(inline.scanned)}</span>
        </Alert>
      )}
      <ReturnHeader session={session} />
      {/* Bảng dòng + cột "Lúc đóng gói" cuộn trong khung; khối Kết luận bên dưới luôn hiện (DEC-239, RF-12). */}
      <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto lg:grid-cols-[1fr_minmax(0,22rem)]">
        <InspectionTable
          lines={lines}
          mode={mode}
          packageCount={session.return_case?.package_count ?? 1}
          errors={errors}
          onChange={(next) => editDraft({ lines: next })}
        />
        {aside && <div>{aside}</div>}
      </div>
      <div
        ref={conclusionBlock}
        className="flex shrink-0 flex-col gap-3 border-t border-outline-variant pt-4"
      >
        <ConclusionPicker
          ref={firstConclusion}
          value={conclusion}
          disabledOk={!canBeOk(lines, mode)}
          onChange={(c) => editDraft({ conclusion: c })}
          error={conclusionErr}
          hint={draft?.okCleared ? C.okLocked : undefined}
        />
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_auto]">
          <TextAreaField
            label={C.note}
            name="inspection_note"
            rows={2}
            maxLength={INSPECTION_LIMITS.noteMax}
            aria-required={conclusion === "OTHER"}
            value={draft?.note ?? ""}
            onChange={(e) => editDraft({ note: e.target.value })}
            error={errors.note}
            className="mb-0"
          />
          {snapshots}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-headline-sm">{C.hint}</p>
          {draft && <SaveIndicator status={draft.saveStatus} onRetry={() => void flushDraft()} />}
        </div>
        <div className="flex justify-between gap-6">
          <Button variant="elevated" className="h-14 px-8" onClick={() => setCancelOpen(true)}>
            {COPY.packing.cancel}
          </Button>
          <Button variant="tonal" icon="support_agent" className="h-14 px-8" onClick={onCallManager}>
            {COPY.packing.callManager}
          </Button>
        </div>
      </div>
      <CancelSessionDialog open={cancelOpen} onClose={() => setCancelOpen(false)} sessionType="RETURN" />
    </StationStatePanel>
  );
}
