import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { clipsApi } from "@/lib/api/clips";
import { isApiError } from "@/lib/api/errors";
import type { Clip, PackageSession } from "@/lib/api/packages";
import { daysBetween, fmtDuration, fmtTime, shortHash, vnDay } from "@/shared/format";
import { CAMERA_ROLE, SESSION_FLAG } from "@/shared/labels";
import { ClipPlayer } from "@/shared/media/ClipPlayer";
import { Button, EmptyState, Icon, StatusChip, toast } from "@/shared/ui";

import { COPY } from "./copy";

const OPEN = new Set(["OPEN", "MISMATCH", "WAITING_APPROVAL"]);
const WARN_FLAGS = new Set([
  "VIDEO_INCOMPLETE",
  "CAM2_UNVERIFIED",
  "UNVERIFIED",
  "LABEL_ON_TRAY",
  "HAD_MISMATCH",
]);

function HashLine({ clip }: { clip: Clip }) {
  const [copied, setCopied] = useState(false);
  if (!clip.sha256) return null;
  return (
    <span className="inline-flex items-center gap-1">
      SHA-256 {CAMERA_ROLE[clip.camera_role]}{" "}
      <span className="font-mono text-on-surface" title={clip.sha256}>
        {shortHash(clip.sha256)}
      </span>
      <button
        type="button"
        className="state-layer inline-flex h-8 w-8 items-center justify-center rounded-full"
        aria-label={copied ? "Đã copy" : `Copy SHA-256 ${CAMERA_ROLE[clip.camera_role]}`}
        title={copied ? "Đã copy" : "Copy"}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(clip.sha256!);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          } catch {
            setCopied(false);
          }
        }}
      >
        <Icon name={copied ? "check" : "content_copy"} size={18} />
      </button>
    </span>
  );
}

/** Ngày giữ theo chính sách tại lúc tạo clip: `retention_until − ngày kết thúc phiên` (DEC-76). */
function retentionDays(session: PackageSession): number | null {
  const deleted = session.clips.find((c) => c.status === "DELETED" && c.retention_until);
  if (!deleted?.retention_until || !session.ended_at) return null;
  return daysBetween(vnDay(session.ended_at), vnDay(deleted.retention_until));
}

/** Khối Clip của D4: player, thông tin phiên, cờ, SHA-256, nút cắt lại (ADMIN/SUPERVISOR), hành động phụ. */
export function SessionPanel({
  packageId,
  session,
  canRebuild,
  actions,
}: {
  packageId: string;
  session: PackageSession;
  canRebuild: boolean;
  actions?: ReactNode;
}) {
  const qc = useQueryClient();
  const rebuild = useMutation({
    mutationFn: () => clipsApi.rebuild(session.id),
    onSuccess: () => toast(COPY.detail.rebuildOk),
    onError: (err) =>
      toast(
        isApiError(err) && err.code === "CLIP_NOT_FAILED"
          ? COPY.detail.notFailed
          : isApiError(err)
            ? err.message
            : "Có lỗi hệ thống. Thử lại sau ít phút.",
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: ["package", packageId] }),
  });

  const ready = session.clips.filter((c) => c.status === "READY");
  const held = ready.length > 0 && ready.every((c) => c.held);
  const cam2Ok = session.status === "COMPLETED" && !session.flags.includes("CAM2_UNVERIFIED");

  return (
    <div>
      {OPEN.has(session.status) && session.clips.length === 0 ? (
        <EmptyState icon="videocam" title={COPY.detail.openSession} />
      ) : (
        <ClipPlayer
          key={session.id}
          clips={session.clips}
          sideBySide
          retentionDays={retentionDays(session)}
          failedAction={
            canRebuild ? (
              <Button
                variant="elevated"
                size="sm"
                disabled={rebuild.isPending}
                onClick={() => rebuild.mutate()}
              >
                Thử lại
              </Button>
            ) : undefined
          }
        />
      )}
      <p className="mt-1 text-body-md text-on-surface tabular-nums">
        {session.station_name} · {fmtTime(session.started_at)} → {fmtTime(session.ended_at)} ·{" "}
        {fmtDuration(session.duration_s)}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {cam2Ok && (
          <StatusChip tone="success" icon="verified">
            {COPY.detail.cam2Match}
          </StatusChip>
        )}
        {session.flags.map((f) => (
          <StatusChip key={f} tone={WARN_FLAGS.has(f) ? "warning" : "neutral"}>
            {SESSION_FLAG[f] ?? f}
          </StatusChip>
        ))}
        {held && (
          <StatusChip tone="info" icon="bookmark">
            {COPY.detail.held}
          </StatusChip>
        )}
      </div>
      <div className="mt-2 flex flex-col text-body-sm text-on-surface-variant">
        {session.clips.map((c) => (
          <HashLine key={c.id} clip={c} />
        ))}
      </div>
      {actions && <div className="mt-3 flex flex-wrap justify-end gap-2">{actions}</div>}
    </div>
  );
}
