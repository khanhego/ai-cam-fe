import { useState, type FormEvent } from "react";

import type { WorkMode } from "@/lib/api/station";
import { Alert, Button, Dialog, TextField } from "@/shared/ui";

import { COPY, operatorCopy } from "../copy";

const NAME_MIN = 2;
const NAME_MAX = 40;

/**
 * R5 — Người kiểm hàng hoàn (01 §10.4, FR-04.10, BR-28, UC-14). `required` (chưa có tên): Esc không đóng, không có nút
 * "Đóng"; station "Cả hai" vẫn có lối "Chuyển sang đóng gói" (DEC-322). Item 03 (FR-03.16): `mode = "PACK"` → "Người đóng
 * gói" (mở từ thanh trạng thái hoặc khi quét bị `OPERATOR_REQUIRED`; không bắt buộc lúc tải — DEC-481).
 */
export function OperatorDialog({
  open,
  mode = "RETURN",
  required,
  current,
  onSubmit,
  onClose,
  onSwitchToPack,
}: {
  open: boolean;
  mode?: WorkMode;
  required: boolean;
  current: string | null;
  /** API-101 → chữ lỗi (null = xong). */
  onSubmit: (name: string) => Promise<string | null>;
  onClose: () => void;
  onSwitchToPack?: () => void;
}) {
  return (
    <Dialog open={open} title={operatorCopy(mode).title} onClose={onClose} dismissible={!required}>
      {/* key: mở lại → form mới với tên hiện tại. */}
      {open && (
        <OperatorForm
          key={`${mode}:${String(current)}`}
          mode={mode}
          current={current}
          onSubmit={onSubmit}
          onSwitchToPack={onSwitchToPack}
        />
      )}
    </Dialog>
  );
}

function OperatorForm({
  mode,
  current,
  onSubmit,
  onSwitchToPack,
}: {
  mode: WorkMode;
  current: string | null;
  onSubmit: (name: string) => Promise<string | null>;
  onSwitchToPack?: () => void;
}) {
  const [name, setName] = useState(current ?? "");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const C = operatorCopy(mode);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = name.trim().split(/\s+/).filter(Boolean).join(" ");
    if (!value) return setError(C.required);
    if (value.length < NAME_MIN || value.length > NAME_MAX) return setError(C.length);
    setBusy(true);
    const err = await onSubmit(value);
    setBusy(false);
    setError(err ?? undefined);
  }

  return (
    <form onSubmit={submit} noValidate>
      <TextField
        label={C.label}
        name="operator_name"
        autoFocus
        autoComplete="off"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(undefined);
        }}
        error={error === C.sessionActive ? undefined : error}
      />
      {error === C.sessionActive && <Alert kind="warning">{error}</Alert>}
      <div className="flex flex-wrap justify-between gap-3">
        {onSwitchToPack ? (
          <Button variant="text" onClick={onSwitchToPack}>
            {COPY.workMode.toPack}
          </Button>
        ) : (
          <span />
        )}
        <Button
          type="submit"
          className="h-14 px-8"
          disabled={busy}
          icon={busy ? "progress_activity" : undefined}
        >
          {COPY.operator.submit}
        </Button>
      </div>
    </form>
  );
}
