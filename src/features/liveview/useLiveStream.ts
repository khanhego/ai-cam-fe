import { useCallback, useEffect, useRef, useState } from "react";

import { refreshAccessToken } from "@/lib/api/client";
import { useSession } from "@/lib/api/session";
import { connectWhep, whepSupported, type WhepStatus } from "@/shared/media/whep";

/** Mất tín hiệu → tự thử lại sau 5 giây, tối đa 3 lần liên tiếp; sau đó chờ người bấm "Thử lại". */
export const AUTO_RETRY_MS = 5000;
export const AUTO_RETRY_MAX = 3;

/**
 * Một luồng WHEP gắn vào `<video>` (02b-admin §3 `CameraTile`, DEC-22). `offline`: API-65 / WS `camera.status`
 * báo camera mất tín hiệu → không gọi WHEP, hiện "Mất tín hiệu" ngay (WS đổi lại ONLINE → tile được mount lại).
 */
export function useLiveStream(url: string, offline: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const supported = whepSupported();
  const [status, setStatus] = useState<WhepStatus>("connecting");
  const [attempt, setAttempt] = useState(0);
  const autoRetries = useRef(0);

  useEffect(() => {
    if (!supported || offline) return;
    let cancelled = false;
    let session: { close: () => void } | null = null;
    connectWhep(
      url,
      {
        onStream: (stream) => {
          // Lượt kết nối cũ (đã hủy) không được gắn luồng chết vào <video> của lượt mới.
          if (cancelled) return;
          if (videoRef.current) videoRef.current.srcObject = stream;
        },
        onStatus: (s) => {
          if (cancelled) return;
          if (s === "playing") autoRetries.current = 0;
          setStatus(s);
        },
      },
      { getToken: () => useSession.getState().accessToken, refresh: refreshAccessToken },
    )
      .then((s) => {
        if (cancelled) s.close();
        else session = s;
      })
      .catch(() => {
        if (!cancelled) setStatus("lost");
      });
    return () => {
      cancelled = true;
      session?.close();
    };
  }, [url, offline, supported, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    if (status !== "lost" || offline || autoRetries.current >= AUTO_RETRY_MAX) return;
    const t = setTimeout(() => {
      autoRetries.current += 1;
      retry();
    }, AUTO_RETRY_MS);
    return () => clearTimeout(t);
  }, [status, offline, retry]);

  const shown: WhepStatus = !supported ? "unsupported" : offline ? "lost" : status;
  return {
    videoRef,
    status: shown,
    retry: () => {
      autoRetries.current = 0;
      retry();
    },
  };
}
