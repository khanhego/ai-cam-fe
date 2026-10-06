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

/**
 * S3 — Lệch mã (01 §10.4). Âm lỗi lặp do store phát. Item 02 (FR-03.13, L3): nguồn "Vừa quét" hướng dẫn hai tình huống
 * (quên quét kiện đã đóng / dán nhầm phiếu) — không có câu nào khiến người đứng bàn dán phiếu của kiện này lên kiện
 * khác; nguồn Cam 2 chỉ bảo bỏ phiếu lạ khỏi khay.
 */
export function MismatchPanel({ state, onCallManager }: { state: StationState; onCallManager: () => void }) {
  const mismatch = state.session!.mismatch!;
  const scan = mismatch.source === "SCAN";
  const t = COPY.mismatchScanCases;
  return (
    <StationStatePanel tone="error" icon="error" title={scan ? t.title : COPY.mismatch.title}>
      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-8 gap-y-4 text-title-lg">
        <dt>{COPY.mismatch.expected}</dt>
        <dd>
          <span className="font-mono text-display-sm tracking-wide">{mismatch.expected}</span>
        </dd>
        <dt>{scan ? COPY.mismatch.scanned : COPY.mismatch.cam2}</dt>
        <dd>
          <CodeDiff value={mismatch.actual} against={mismatch.expected} />
        </dd>
      </dl>
      {scan ? (
        <ol className="flex flex-col gap-4 text-headline-sm">
          <li>
            <p className="font-medium">{t.forgot(mismatch.expected)}</p>
            <p className="pl-6">{t.forgotAction(mismatch.expected)}</p>
            <p className="pl-6">{t.forgotNote(mismatch.actual)}</p>
          </li>
          <li>
            <p className="font-medium">{t.wrongLabel(mismatch.actual)}</p>
            <p className="pl-6">{t.wrongLabelAction(mismatch.actual, mismatch.expected)}</p>
          </li>
        </ol>
      ) : (
        <p className="text-headline-md">{t.cam2(mismatch.actual)}</p>
      )}
      <div className="mt-auto">
        <Button variant="tonal" icon="support_agent" className="h-14 px-8" onClick={onCallManager}>
          {COPY.packing.callManager}
        </Button>
      </div>
    </StationStatePanel>
  );
}
