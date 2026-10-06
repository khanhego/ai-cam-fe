import { useQuery } from "@tanstack/react-query";
import { useRef, useState, type ReactNode } from "react";

import { useAuth } from "@/features/auth/useAuth";
import { api } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { Alert, Button, EmptyState, Tabs } from "@/shared/ui";

import { CLIP_COPY, clipStateError } from "./copy";

export type ClipRef = {
  id: string;
  camera_role: "CAM1" | "CAM2";
  status: string;
  /** Ngày xóa theo lưu trữ (clip `DELETED`) — 01 §10.5 D4. */
  retention_until?: string | null;
};

type Tab = "CAM1" | "CAM2" | "SIDE";

/**
 * URL phát có chữ ký (API-40), hết hạn 10 phút → giữ 8 phút. URL ký theo uid người xem (audit VIEW_CLIP) → uid nằm
 * trong query key để người đăng nhập sau không dùng lại URL của người trước (review G3 F15).
 */
function useClipUrl(clipId: string | undefined) {
  const uid = useAuth((s) => s.me?.id ?? null);
  return useQuery({
    queryKey: ["clip-url", uid, clipId],
    enabled: Boolean(clipId),
    staleTime: 8 * 60_000,
    retry: (count, error) => isApiError(error) && error.code === "SIGNATURE_INVALID" && count < 1,
    queryFn: () => api.get<{ url: string; expires_at: string }>(`/clips/${clipId}/play-url`),
  });
}

const LABEL = { CAM1: "Cam 1", CAM2: "Cam 2", SIDE: "Ghép" } as const;

/**
 * Một `<video>` có URL ký. Lỗi phát (URL hết hạn → API-41 403 SIGNATURE_INVALID) → lấy lại API-40 một lần rồi mới
 * báo lỗi (02b-admin §8). `preload="none"`: chỉ tải khi bấm phát để audit VIEW_CLIP đúng nghĩa (02b-admin §10).
 */
function SignedVideo({
  clip,
  videoRef,
  label,
  onPlay,
  onPause,
  onSeeked,
  forbiddenText,
}: {
  forbiddenText?: string;
  clip: ClipRef;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  label: string;
  onPlay?: () => void;
  onPause?: () => void;
  onSeeked?: () => void;
}) {
  const url = useClipUrl(clip.id);
  const [failures, setFailures] = useState(0);
  if (url.isPending)
    return <div className="aspect-video w-full animate-pulse rounded-md bg-surface-container-highest" />;
  const state = url.isError ? clipStateError(url.error) : null;
  if (state?.kind === "deleted")
    return <EmptyState icon="delete" title={CLIP_COPY.deleted(state.deletedAt, state.days)} />;
  if (state?.kind === "pending") return <EmptyState icon="autorenew" title={CLIP_COPY.pending} />;
  if (state?.kind === "failed") return <Alert kind="error">{CLIP_COPY.failedRebuild}</Alert>;
  if (forbiddenText && url.isError && isApiError(url.error) && url.error.status === 403)
    return <Alert kind="warning">{forbiddenText}</Alert>;
  if (url.isError || failures > 1) {
    return (
      <Alert
        kind="error"
        action={
          <Button
            variant="text"
            onClick={() => {
              setFailures(0);
              void url.refetch();
            }}
          >
            {CLIP_COPY.retry}
          </Button>
        }
      >
        {CLIP_COPY.playError}
      </Alert>
    );
  }
  return (
    <video
      key={url.data.url}
      ref={videoRef}
      src={url.data.url}
      aria-label={label}
      controls
      preload="none"
      playsInline
      className="aspect-video w-full rounded-md bg-black"
      onPlay={onPlay}
      onPause={onPause}
      onSeeked={onSeeked}
      onError={() => {
        setFailures((n) => n + 1);
        if (failures === 0) void url.refetch();
      }}
    />
  );
}

/** Tab "Ghép" (DEC-21): 2 `<video>` cạnh nhau, Cam 1 điều khiển, Cam 2 theo `currentTime`. */
function SideBySide({ cam1, cam2, forbiddenText }: { cam1: ClipRef; cam2: ClipRef; forbiddenText?: string }) {
  const a = useRef<HTMLVideoElement>(null);
  const b = useRef<HTMLVideoElement>(null);
  const sync = () => {
    if (a.current && b.current && Math.abs(a.current.currentTime - b.current.currentTime) > 0.2)
      b.current.currentTime = a.current.currentTime;
  };
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <SignedVideo
        clip={cam1}
        videoRef={a}
        label="Cam 1 (điều khiển cả hai)"
        forbiddenText={forbiddenText}
        onPlay={() => {
          sync();
          void b.current?.play().catch(() => undefined);
        }}
        onPause={() => b.current?.pause()}
        onSeeked={sync}
      />
      <SignedVideo clip={cam2} videoRef={b} label="Cam 2" forbiddenText={forbiddenText} />
    </div>
  );
}

/**
 * Trình phát clip Cam 1 / Cam 2 / Ghép (dùng chung station S1 và dashboard D4 — 02b-admin §3).
 * Trạng thái clip theo 01 §10.5 D4: đang cắt · đã xóa theo lưu trữ (kèm ngày) · lỗi tạo clip (`failedAction`: "Thử lại").
 */
export function ClipPlayer({
  clips,
  sideBySide = false,
  retentionDays,
  failedAction,
  forbiddenText,
}: {
  /** Có → API-40 403 hiện chữ này thay lỗi phát (station xem clip đóng gói — 02b-station §7). */
  forbiddenText?: string;
  clips: ClipRef[];
  /** Hiện tab "Ghép" khi cả hai clip READY. */
  sideBySide?: boolean;
  retentionDays?: number | null;
  failedAction?: ReactNode;
}) {
  const byRole = (r: "CAM1" | "CAM2") => clips.find((c) => c.camera_role === r);
  const cam1 = byRole("CAM1");
  const cam2 = byRole("CAM2");
  const canSide = sideBySide && cam1?.status === "READY" && cam2?.status === "READY";
  const tabs: Tab[] = [...clips.map((c) => c.camera_role), ...(canSide ? (["SIDE"] as const) : [])];
  const [tab, setTab] = useState<Tab>(tabs[0] ?? "CAM1");
  const current: Tab = tabs.includes(tab) ? tab : (tabs[0] ?? "CAM1");
  const clip = current === "SIDE" ? undefined : byRole(current);

  if (clips.length === 0 || clips.every((c) => c.status === "PENDING")) {
    return <EmptyState icon="autorenew" title={CLIP_COPY.pending} />;
  }
  return (
    <div>
      {current === "SIDE" && cam1 && cam2 && (
        <SideBySide key="side" cam1={cam1} cam2={cam2} forbiddenText={forbiddenText} />
      )}
      {clip?.status === "READY" && (
        <SignedVideo
          key={clip.id}
          clip={clip}
          label={LABEL[clip.camera_role]}
          forbiddenText={forbiddenText}
        />
      )}
      {clip?.status === "PENDING" && <EmptyState icon="autorenew" title={CLIP_COPY.pending} />}
      {clip?.status === "DELETED" && (
        <EmptyState icon="delete" title={CLIP_COPY.deleted(clip.retention_until, retentionDays)} />
      )}
      {clip?.status === "FAILED" && (
        <Alert kind="error" action={failedAction}>
          {CLIP_COPY.failed}
        </Alert>
      )}
      <div className="mt-2">
        <Tabs label="Camera" value={current} onChange={setTab} items={tabs.map((t) => [t, LABEL[t]])} />
      </div>
    </div>
  );
}
