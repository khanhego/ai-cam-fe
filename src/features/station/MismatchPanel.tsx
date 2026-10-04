import type { StationState } from "@/lib/api/station";
import { Button } from "@/shared/ui";

import { COPY } from "./copy";
import { StationStatePanel } from "./StationStatePanel";

/** In đậm ký tự khác nhau giữa hai mã (02b-station §3 CodeDiff). */
export function CodeDiff({ value, against }: { value: string; against: string }) {
  return (
    <span className="font-mono text-display-sm tracking-wide">
      {[...value].map((ch, i) => (
        <span key={i} className={ch !== against[i] ? "font-bold underline" : undefined}>
          {ch}
        </span>
      ))}
    </span>
  );
}

/** S3 — Lệch mã (01 §10.4). Âm lỗi lặp do store phát. */
export function MismatchPanel({ state, onCallManager }: { state: StationState; onCallManager: () => void }) {
  const mismatch = state.session!.mismatch!;
  return (
    <StationStatePanel tone="error" icon="error" title={COPY.mismatch.title}>
      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-8 gap-y-4 text-title-lg">
        <dt>{COPY.mismatch.expected}</dt>
        <dd>
          <span className="font-mono text-display-sm tracking-wide">{mismatch.expected}</span>
        </dd>
        <dt>{mismatch.source === "CAM2" ? COPY.mismatch.cam2 : COPY.mismatch.scanned}</dt>
        <dd>
          <CodeDiff value={mismatch.actual} against={mismatch.expected} />
        </dd>
      </dl>
      <p className="text-headline-md">{COPY.mismatch.hint(mismatch.expected)}</p>
      <div className="mt-auto">
        <Button variant="tonal" icon="support_agent" className="h-14 px-8" onClick={onCallManager}>
          {COPY.packing.callManager}
        </Button>
      </div>
    </StationStatePanel>
  );
}
