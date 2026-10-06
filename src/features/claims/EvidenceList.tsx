import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { claimsApi, type ClaimDetail, type ClaimEvidence } from "@/lib/api/claims";
import { isApiError } from "@/lib/api/errors";
import { fmtDate, fmtDuration, fmtShort } from "@/shared/format";
import { SESSION_FLAG, SESSION_STATUS, type SessionStatus } from "@/shared/labels";
import { ClipPlayer } from "@/shared/media/ClipPlayer";
import { SnapshotStrip } from "@/shared/media/SnapshotStrip";
import { SESSION_TYPE } from "@/shared/returns/labels";
import { Alert, Button, Dialog, EmptyState, Icon, IconButton, StatusChip, TextAreaField } from "@/shared/ui";

import { COPY } from "./copy";
import { claimErrorText, useClaimMutation } from "./useClaimMutation";

const E = COPY.evidence;
type SessionEvidence = Extract<ClaimEvidence, { kind: "SESSION" }>;
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
}: {
  ev: SessionEvidence;
  selected: boolean;
  editable: boolean;
  busy: boolean;
  onPlay: () => void;
  onRemove: () => void;
}) {
  const s = ev.session;
  const label = sessionLabel(s);
  const duration = s.ended_at != null ? (Date.parse(s.ended_at) - Date.parse(s.started_at)) / 1000 : null;
  const deleted = s.clips.find((c) => c.status === "DELETED");
  const cam2Ok = s.type === "PACK" && s.status === "COMPLETED" && !s.flags.includes("CAM2_UNVERIFIED");
  const statusLabel = SESSION_STATUS[s.status as SessionStatus]?.[0];
  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <Icon name="check_circle" size={20} className="text-success" />
      <span className="text-body-md text-on-surface">
        {label} · {s.station_name}
        {s.operator_name ? ` · ${s.operator_name}` : ""} ·{" "}
        <span className="tabular-nums">{fmtDuration(duration)}</span>
      </span>
      {statusLabel && s.status !== "COMPLETED" && <StatusChip>{statusLabel}</StatusChip>}
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
  const [removing, setRemoving] = useState<SessionEvidence | null>(null);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
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
    () => {
      setRemoving(null);
      setNote("");
      setTouched(false);
    },
  );
  const ids = sessions.map((e) => e.session.id);
  const snapIds = snapshots.map((s) => s.id);
  const remove = (ev: SessionEvidence, reason?: string) =>
    save.mutate({ sessionIds: ids.filter((id) => id !== ev.session.id), snapshotIds: snapIds, note: reason });
  const add = (id: string) => save.mutate({ sessionIds: [...ids, id], snapshotIds: snapIds });
  const noteText = note.trim();
  const noteError = noteText.length < 5 || noteText.length > 500 ? E.removeRule : undefined;
  const fields =
    isApiError(save.error) && save.error.code === "VALIDATION_ERROR" ? save.error.fieldErrors : {};
  const alert = claimErrorText(save.error);

  return (
    <div className="flex flex-col gap-3">
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
              onRemove={() => (ev.auto ? setRemoving(ev) : remove(ev))}
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
      {removing && (
        <Dialog
          open
          title={E.removeTitle}
          onClose={() => setRemoving(null)}
          actions={
            <Button
              variant="danger"
              disabled={save.isPending}
              onClick={() => {
                setTouched(true);
                if (!noteError) remove(removing, noteText);
              }}
            >
              {E.removeConfirm}
            </Button>
          }
        >
          <p className="mb-3">
            {sessionLabel(removing.session)} — {E.removeHint}
          </p>
          <TextAreaField
            name="evidence-note"
            label={E.removeTitle}
            rows={2}
            value={note}
            error={(touched ? noteError : undefined) ?? fields.note}
            onChange={(e) => setNote(e.target.value)}
          />
          {alert && <Alert kind="error">{alert}</Alert>}
        </Dialog>
      )}
    </div>
  );
}
