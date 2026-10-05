import { useEffect, useState } from "react";

import { COPY } from "./copy";
import { StationStatePanel } from "./StationStatePanel";

/** S6 — Mất kết nối máy chủ (01 §10.4, NFR-09). Không nhận quét. */
export function DisconnectedOverlay() {
  const [since] = useState(() => Date.now());
  const [now, setNow] = useState(since);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <StationStatePanel tone="error" icon="cloud_off" title={COPY.disconnected.title}>
      <p className="text-headline-md">{COPY.disconnected.hint}</p>
      <p className="text-title-lg tabular-nums">
        {COPY.disconnected.since(Math.floor((now - since) / 1000))}
      </p>
    </StationStatePanel>
  );
}
