import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { claimsApi, type AffectedShare, type ClaimDetail, type ClaimEvidence } from "@/lib/api/claims";
import { isApiError } from "@/lib/api/errors";
import { fmtDate, fmtDuration, fmtShort } from "@/shared/format";
import { MEDIA_MISSING_LABEL, SESSION_FLAG, SESSION_STATUS, type SessionStatus } from "@/shared/labels";
import { ClipPlayer } from "@/shared/media/ClipPlayer";
import { SnapshotStrip } from "@/shared/media/SnapshotStrip";
import { SESSION_TYPE } from "@/shared/returns/labels";
import { Alert, Button, EmptyState, Icon, IconButton, StatusChip, useMenuButton } from "@/shared/ui";

import { COPY } from "./copy";
import { evidenceLabel, hasStatusChip, sessionChips, type SessionEvidence } from "./evidenceChips";
import { useAuth } from "../auth/useAuth";
import { AffectedSharesDialog } from "./AffectedSharesDialog";
import { PriorReturnAlert } from "./PriorReturnAlert";
import { RemoveEvidenceDialog } from "./RemoveEvidenceDialog";
import { RemovedEvidenceList } from "./RemovedEvidenceList";
import { ReviewSessionDialog, type ReviewMode } from "./ReviewSessionDialog";
import { claimErrorText, useClaimMutation } from "./useClaimMutation";
import { useReviewSession } from "./useReviewSession";

const E = COPY.evidence;
type SnapshotEvidence = Extract<ClaimEvidence, { kind: "SNAPSHOT" }>;
const WARN_FLAGS = new Set([
  "VIDEO_INCOMPLETE",
  "CAM2_UNVERIFIED",
  "UNVERIFIED",
  "LABEL_ON_TRAY",
  "HAD_MISMATCH",
]);
const MISSING_TEXT = {
  NO_PACK_CLIP: E.noPackClip,
  PACK_CLIP_DELETED: E.packClipDeleted,
  RETURN_CLIP_PENDING: E.returnClipPending,
} as const;

type EvidenceVars = { sessionIds: string[]; snapshotIds: string[]; note?: string };

/** Menu "⋮ → Đánh dấu quét nhầm" (01 §10.5 D17 v0.4): phiên mở hoàn Đã hủy / Bỏ dở chưa bị loại. */
const canMarkWrongScan = (ev: SessionEvidence) =>
  ev.session.type === "RETURN" &&
  (ev.session.status === "CANCELLED" || ev.session.status === "ABANDONED") &&
  !ev.session.evidence_exclusion;

const sessionLabel = (s: SessionEvidence["session"]) =>
  `${s.type === "RETURN" ? E.return : E.pack} ${fmtShort(s.started_at)}`;

/** Một dòng phiên bằng chứng (01 §10.5 D17: "✔ Phiên đóng gói 02/10 14:25 · Station 01 · 02:14 · Cam 2 khớp mã [▶] [Bỏ]"). */
function SessionRow({
  ev,
  selected,
  editable,
  busy,
  onPlay,
  onRemove,
  onMarkWrongScan,
}: {
  ev: SessionEvidence;
  selected: boolean;
  editable: boolean;
  busy: boolean;
  onPlay: () => void;
  onRemove: () => void;
  onMarkWrongScan: () => void;
}) {
  // G3-FE-6: menu ⋮ theo mẫu menu button chung (Esc / bấm ra ngoài đóng, focus vào mục — DEC-904).
  const { open, setOpen, menuRef, triggerRef, wrapRef, onMenuKeyDown, onTriggerKeyDown } =
    useMenuButton<HTMLSpanElement>();
  const s = ev.session;
  const label = sessionLabel(s);
  const duration = s.ended_at != null ? (Date.parse(s.ended_at) - Date.parse(s.started_at)) / 1000 : null;
  const deleted = s.clips.find((c) => c.status === "DELETED");
  const cam2Ok = s.type === "PACK" && s.status === "COMPLETED" && !s.flags.includes("CAM2_UNVERIFIED");
  const statusLabel = SESSION_STATUS[s.status as SessionStatus]?.[0];
  // G3-FE-7: ✔ xanh chỉ cho bằng chứng dùng được — phiên bị loại (BR-39) / chỉ còn clip "Thiếu tệp" → icon trung tính.
  const onlyMissing = s.clips.length > 0 && s.clips.every((c) => c.status === "MISSING");
  const [rowIcon, rowTone] =
    s.type === "RETURN" && s.evidence_exclusion
      ? ["do_not_disturb_on", "text-on-surface-variant"]
      : onlyMissing
        ? ["videocam_off", "text-on-surface-variant"]
        : ["check_circle", "text-success"];
  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <Icon name={rowIcon} size={20} className={rowTone} />
      <span className="text-body-md text-on-surface">
        {label} · {s.station_name}
        {s.operator_name ? ` · ${s.operator_name}` : ""} ·{" "}
        <span className="tabular-nums">{fmtDuration(duration)}</span>
      </span>
      {sessionChips(ev).map((c) => (
        <StatusChip key={c.label} tone={c.tone}>
          {c.label}
        </StatusChip>
      ))}
      {statusLabel && s.status !== "COMPLETED" && !hasStatusChip(ev) && (
        <StatusChip>{statusLabel}</StatusChip>
      )}
      {cam2Ok && (
        <StatusChip tone="success" icon="verified">
          Cam 2 khớp mã
        </StatusChip>
      )}
      {s.flags.map((f) => (
        <StatusChip key={f} tone={WARN_FLAGS.has(f) ? "warning" : "neutral"}>
          {SESSION_FLAG[f] ?? f}
        </StatusChip>
      ))}
      {ev.auto && <StatusChip tone="info">{E.auto}</StatusChip>}
      {s.clips.length === 0 && <span className="text-body-sm text-on-surface-variant">{E.noClip}</span>}
      {/* item 03 (02b-admin §9): clip thiếu tệp trên máy chủ → chip xám; player hiện `MissingMediaBlock`. */}
      {s.clips.some((c) => c.status === "MISSING") && (
        <StatusChip icon="videocam_off">{MEDIA_MISSING_LABEL}</StatusChip>
      )}
      {deleted?.deleted_at && (
        <span className="text-body-sm text-error">{E.clipDeleted(fmtDate(deleted.deleted_at))}</span>
      )}
      <span className="ml-auto flex gap-1">
        <IconButton
          icon="play_arrow"
          label={E.play(label)}
          variant={selected ? "tonal" : "standard"}
          aria-pressed={selected}
          disabled={s.clips.length === 0}
          onClick={onPlay}
        />
        {editable && (
          <Button
            variant="text-danger"
            size="sm"
            disabled={busy}
            onClick={onRemove}
            aria-label={`${E.remove} ${label}`}
          >
            {E.remove}
          </Button>
        )}
        {editable && canMarkWrongScan(ev) && (
          <span ref={wrapRef} className="relative">
            <IconButton
              ref={triggerRef}
              icon="more_vert"
              label={E.rowMenu(label)}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-controls={open ? `ev-menu-${ev.id}` : undefined}
              disabled={busy}
              onClick={() => setOpen((v) => !v)}
              onKeyDown={onTriggerKeyDown}
            />
            {open && (
              <ul
                id={`ev-menu-${ev.id}`}
                ref={menuRef}
                role="menu"
                aria-label={E.rowMenu(label)}
                onKeyDown={onMenuKeyDown}
                className="absolute right-0 z-10 mt-1 min-w-48 rounded-md bg-surface-container py-1 shadow-elevation-2"
              >
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    className="state-layer w-full px-4 py-2 text-left text-body-md text-on-surface"
                    onClick={() => {
                      setOpen(false);
                      onMarkWrongScan();
                    }}
                  >
                    {E.markWrongScan}
                  </button>
                </li>
              </ul>
            )}
          </span>
        )}
      </span>
    </li>
  );
}

/**
 * Bằng chứng của hồ sơ (01 §10.5 D17, FR-08.06, API-134): phiên (tự chọn / thêm tay) + ảnh; "Bỏ" bằng chứng tự chọn →
 * Dialog "Lý do bỏ" 5–500 bắt buộc (02 §6.3 #10); "Thêm" phiên khác của kiện; phần thiếu (`missing`); chọn phiên →
 * `ClipPlayer` (Cam 1 | Cam 2 | Ghép). `editable = false` khi hồ sơ Đóng.
 */
export function EvidenceList({ claim, editable }: { claim: ClaimDetail; editable: boolean }) {
  const sessions = claim.evidence.filter((e): e is SessionEvidence => e.kind === "SESSION");
  const snapshots = claim.evidence.flatMap((e) => (e.kind === "SNAPSHOT" ? [e.snapshot] : []));
  const [playing, setPlaying] = useState<string | null>(null);
  // Ảnh URL ký hết hạn → tải lại API-132 một lần cho mỗi bộ URL (như D4 / station — C-02, DEC-357). Ghi nhớ theo
  // URL đang dùng: dữ liệu mới (URL ký mới) thì được tải lại tiếp khi hết hạn lần sau (G3 V2-3).
  const qc = useQueryClient();
  const urlsKey = snapshots.map((s) => s.url ?? "").join("|");
  const reloadedFor = useRef<string | null>(null);
  const onSnapshotExpired = () => {
    if (reloadedFor.current === urlsKey) return;
    reloadedFor.current = urlsKey;
    void qc.invalidateQueries({ queryKey: ["claim", claim.id] });
  };
  const [removing, setRemoving] = useState<ClaimEvidence | null>(null);
  const [reviewing, setReviewing] = useState<{
    mode: ReviewMode;
    sessionId: string;
    startedAt: string;
    keepUntil: string | null;
  } | null>(null);
  const me = useAuth((s) => s.me);
  const [affected, setAffected] = useState<AffectedShare[]>([]);
  const review = useReviewSession(claim.id, (_vars, shares) => {
    setReviewing(null);
    setAffected(shares);
  });
  const openReview = (mode: ReviewMode, sessionId: string, startedAt: string) =>
    setReviewing({
      mode,
      sessionId,
      startedAt,
      keepUntil: sessions.find((e) => e.session.id === sessionId)?.removal_keep_until ?? null,
    });
  const snapshotEvidence = claim.evidence.filter((e): e is SnapshotEvidence => e.kind === "SNAPSHOT");
  const current =
    sessions.find((e) => e.session.id === playing) ?? sessions.find((e) => e.session.clips.length > 0);

  const save = useClaimMutation<EvidenceVars>(
    claim.id,
    (v, c) =>
      claimsApi.setEvidence(claim.id, {
        version: c.version,
        session_ids: v.sessionIds,
        snapshot_ids: v.snapshotIds,
        note: v.note ?? null,
      }),
    () => setRemoving(null),
  );
  const ids = sessions.map((e) => e.session.id);
  const snapIds = snapshots.map((s) => s.id);
  // Item 03 (BR-38): bỏ **mọi** bằng chứng cần lý do 5–500 → luôn qua `RemoveEvidenceDialog`.
  const remove = (ev: ClaimEvidence, reason: string) =>
    save.mutate(
      ev.kind === "SESSION"
        ? { sessionIds: ids.filter((id) => id !== ev.session.id), snapshotIds: snapIds, note: reason }
        : { sessionIds: ids, snapshotIds: snapIds.filter((id) => id !== ev.snapshot.id), note: reason },
    );
  const add = (id: string) => save.mutate({ sessionIds: [...ids, id], snapshotIds: snapIds });
  /** "Thêm lại" bằng chứng đã bỏ = gửi lại id (API-134 khôi phục). */
  const restore = (ev: ClaimEvidence) =>
    save.mutate(
      ev.kind === "SESSION"
        ? { sessionIds: [...ids, ev.session.id], snapshotIds: snapIds }
        : { sessionIds: ids, snapshotIds: [...snapIds, ev.snapshot.id] },
    );
  const fields =
    isApiError(save.error) && save.error.code === "VALIDATION_ERROR" ? save.error.fieldErrors : {};
  const alert = claimErrorText(save.error);

  return (
    <div className="flex flex-col gap-3">
      <PriorReturnAlert
        claim={claim}
        editable={editable}
        canOverride={me?.role === "ADMIN" || me?.role === "SUPERVISOR"}
        busy={save.isPending || review.isPending}
        onAdd={add}
        onReview={openReview}
      />
      {claim.missing.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {claim.missing.map((m) => (
            <li key={m}>
              <StatusChip tone="warning" icon="warning">
                {MISSING_TEXT[m] ?? m}
              </StatusChip>
            </li>
          ))}
        </ul>
      )}
      {claim.evidence.length === 0 ? (
        <EmptyState icon="folder_off" title={E.empty} />
      ) : (
        <ul className="divide-y divide-outline-variant">
          {sessions.map((ev) => (
            <SessionRow
              key={ev.id}
              ev={ev}
              selected={current?.id === ev.id}
              editable={editable}
              busy={save.isPending}
              onPlay={() => setPlaying(ev.session.id)}
              onRemove={() => setRemoving(ev)}
              onMarkWrongScan={() => openReview("MARK", ev.session.id, ev.session.started_at)}
            />
          ))}
        </ul>
      )}
      {snapshots.length > 0 && (
        <SnapshotStrip
          label={E.photos(snapshots.length)}
          snapshots={snapshots}
          onExpired={onSnapshotExpired}
        />
      )}
      {editable && snapshotEvidence.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label={E.photos(snapshotEvidence.length)}>
          {snapshotEvidence.map((ev) => {
            const label = evidenceLabel(ev);
            return (
              <li key={ev.id} className="inline-flex items-center gap-1 text-body-sm text-on-surface-variant">
                {label}
                <Button
                  variant="text-danger"
                  size="sm"
                  disabled={save.isPending}
                  aria-label={`${E.remove} ${label}`}
                  onClick={() => setRemoving(ev)}
                >
                  {E.remove}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {claim.other_sessions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-body-md text-on-surface">
          <span className="text-on-surface-variant">{E.others}</span>
          {claim.other_sessions.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1">
              ○ {SESSION_TYPE[s.type]} {fmtShort(s.started_at)}{" "}
              {SESSION_STATUS[s.status as SessionStatus]?.[0] ?? s.status}
              {editable && (
                <Button
                  variant="text"
                  size="sm"
                  icon="add"
                  disabled={save.isPending}
                  onClick={() => add(s.id)}
                >
                  {E.add}
                </Button>
              )}
            </span>
          ))}
        </div>
      )}
      {!removing && alert && <Alert kind="error">{alert}</Alert>}
      {!removing && Object.keys(fields).length > 0 && (
        <Alert kind="error">{Object.values(fields).join(" ")}</Alert>
      )}
      {current && (
        <section aria-label={E.player}>
          <ClipPlayer key={current.session.id} clips={current.session.clips} sideBySide />
        </section>
      )}
      <RemovedEvidenceList
        items={claim.removed_evidence}
        editable={editable}
        busy={save.isPending}
        onRestore={restore}
      />
      {affected.length > 0 && <AffectedSharesDialog shares={affected} onClose={() => setAffected([])} />}
      {reviewing && (
        <ReviewSessionDialog
          key={`${reviewing.mode}-${reviewing.sessionId}`}
          mode={reviewing.mode}
          sessionId={reviewing.sessionId}
          label={`${E.return} ${fmtShort(reviewing.startedAt)}`}
          keepUntil={reviewing.keepUntil}
          busy={review.isPending}
          error={review.error}
          onSubmit={(vars) => review.mutate(vars)}
          onClose={() => {
            review.reset();
            setReviewing(null);
          }}
        />
      )}
      {removing && (
        <RemoveEvidenceDialog
          label={evidenceLabel(removing)}
          kind={removing.kind}
          keepUntil={removing.removal_keep_until}
          busy={save.isPending}
          serverError={alert}
          fieldError={fields.note}
          onConfirm={(reason) => remove(removing, reason)}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
