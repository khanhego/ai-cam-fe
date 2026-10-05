import { useState, type ReactNode } from "react";

import type { LiveCamera } from "@/lib/api/live";
import type { WhepStatus } from "@/shared/media/whep";
import { Button, Icon, StatusChip } from "@/shared/ui";

import { COPY } from "./copy";
import { useLiveStream } from "./useLiveStream";

/** `pnpm dev:mock`: không có MediaMTX → `whep_url` của mock là file video, phát lặp (02b-admin §12). */
const MOCK_LIVE = import.meta.env.DEV && import.meta.env.VITE_MOCK === "1";

function Overlay({ status, onRetry }: { status: WhepStatus; onRetry: () => void }) {
  if (status === "playing") return null;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-inverse-on-surface">
      {status === "connecting" && (
        <>
          <span
            role="progressbar"
            aria-label={COPY.connecting}
            className="h-8 w-8 animate-spin rounded-full border-4 border-inverse-on-surface/30 border-t-inverse-on-surface"
          />
          <p className="text-body-md">{COPY.connecting}</p>
        </>
      )}
      {status === "lost" && (
        <>
          <Icon name="videocam_off" size={32} />
          <p className="text-title-md">{COPY.lost}</p>
          <Button variant="elevated" size="sm" icon="refresh" onClick={onRetry}>
            {COPY.retry}
          </Button>
        </>
      )}
      {status === "unsupported" && <p className="text-body-md">{COPY.unsupported}</p>}
    </div>
  );
}

function Frame({
  label,
  status,
  onRetry,
  children,
}: {
  label: string;
  status: WhepStatus;
  onRetry: () => void;
  children: ReactNode;
}) {
  return (
    <figure
      aria-label={label}
      data-status={status}
      className="relative aspect-video w-full overflow-hidden rounded-md bg-inverse-surface"
    >
      {children}
      <Overlay status={status} onRetry={onRetry} />
      <figcaption className="absolute top-2 left-2 rounded-sm bg-scrim/60 px-2 py-0.5 text-label-md text-inverse-on-surface">
        {label}
      </figcaption>
      {status === "playing" && (
        <StatusChip tone="live" icon="fiber_manual_record" className="absolute top-2 right-2">
          REC
        </StatusChip>
      )}
    </figure>
  );
}

function WhepTile({
  camera,
  label,
  onRefresh,
}: {
  camera: LiveCamera;
  label: string;
  onRefresh: () => void;
}) {
  const offline = camera.status === "OFFLINE";
  const { videoRef, status, retry } = useLiveStream(camera.whep_url, offline);
  return (
    <Frame label={label} status={status} onRetry={offline ? onRefresh : retry}>
      <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-contain" />
    </Frame>
  );
}

function MockTile({
  camera,
  label,
  onRefresh,
}: {
  camera: LiveCamera;
  label: string;
  onRefresh: () => void;
}) {
  const [status, setStatus] = useState<WhepStatus>(camera.status === "OFFLINE" ? "lost" : "connecting");
  const [key, setKey] = useState(0);
  return (
    <Frame
      label={label}
      status={status}
      onRetry={() => {
        if (camera.status === "OFFLINE") return onRefresh();
        setStatus("connecting");
        setKey((k) => k + 1);
      }}
    >
      {camera.status === "ONLINE" && (
        <video
          key={key}
          src={camera.whep_url}
          autoPlay
          muted
          loop
          playsInline
          onPlaying={() => setStatus("playing")}
          onError={() => setStatus("lost")}
          className="h-full w-full object-contain"
        />
      )}
    </Frame>
  );
}

/** Ô live một camera (01 §10.5 D11): đang kết nối / REC / "Mất tín hiệu" + "Thử lại". */
export function CameraTile(props: { camera: LiveCamera; label: string; onRefresh: () => void }) {
  return MOCK_LIVE ? <MockTile {...props} /> : <WhepTile {...props} />;
}
