import { forwardRef } from "react";

import { CONCLUSION_BUTTON, CONCLUSIONS } from "@/shared/returns/inspection";
import type { Conclusion } from "@/shared/returns/types";
import { cx, Icon } from "@/shared/ui";

import { COPY } from "../copy";

const C = COPY.returns.inspecting;

/**
 * 6 nút kết luận cao 56px (01 §10.4 R2) — `radiogroup`. "Nguyên vẹn" khóa khi `disabledOk` (BR-22) + tooltip.
 * `error` (INSPECTION_REQUIRED / lỗi server) → viền đỏ + chữ. Ref trỏ nút đầu để focus khi quét đóng chưa kết luận.
 */
export const ConclusionPicker = forwardRef<
  HTMLButtonElement,
  {
    value: Conclusion | null;
    disabledOk: boolean;
    onChange: (c: Conclusion) => void;
    error?: string;
    hint?: string;
  }
>(function ConclusionPicker({ value, disabledOk, onChange, error, hint }, firstRef) {
  return (
    <div>
      <div
        role="radiogroup"
        aria-label={C.conclusion.replace(":", "")}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "conclusion-error" : hint ? "conclusion-hint" : undefined}
        className={cx("flex flex-wrap items-center gap-3 rounded-lg p-2", error && "ring-4 ring-error")}
      >
        <span className="text-title-lg">{C.conclusion}</span>
        {CONCLUSIONS.map((c, i) => {
          const locked = c === "OK" && disabledOk;
          const checked = value === c;
          return (
            <button
              key={c}
              ref={i === 0 ? firstRef : undefined}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={locked}
              title={locked ? C.okLocked : undefined}
              onClick={() => onChange(c)}
              className={cx(
                "state-layer inline-flex h-14 items-center gap-2 rounded-full border px-6 text-title-md disabled:opacity-38",
                checked
                  ? "border-transparent bg-primary text-on-primary"
                  : "border-outline bg-surface-container-lowest text-on-surface",
              )}
            >
              {checked && <Icon name="check" size={20} />}
              {CONCLUSION_BUTTON[c]}
            </button>
          );
        })}
      </div>
      {error ? (
        <p id="conclusion-error" role="alert" className="mt-2 text-title-md text-error">
          {error}
        </p>
      ) : hint ? (
        <p id="conclusion-hint" className="mt-2 text-title-md">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
