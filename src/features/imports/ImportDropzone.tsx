import { useRef, useState } from "react";

import { Button, cx, Icon, LinearProgress } from "@/shared/ui";

import { COPY } from "./copy";

/** Vùng chọn / kéo thả file (D5). `busy`: đang đọc file (API-50) → LinearProgress không giá trị. */
export function ImportDropzone({ busy, onFile }: { busy: boolean; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
    if (input.current) input.current.value = "";
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!busy) take(e.dataTransfer.files);
      }}
      className={cx(
        "card flex flex-col items-center gap-3 border-2 border-dashed px-6 py-8 text-center",
        over ? "border-primary bg-secondary-container/40" : "border-outline-variant",
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
        <Icon name="upload_file" size={26} />
      </span>
      <p className="max-w-md text-body-md text-on-surface-variant">{COPY.dropHint}</p>
      <input
        ref={input}
        type="file"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        aria-label={COPY.fileLabel}
        className="sr-only"
        disabled={busy}
        onChange={(e) => take(e.target.files)}
      />
      <Button icon="folder_open" disabled={busy} onClick={() => input.current?.click()}>
        {COPY.pick}
      </Button>
      {busy && (
        <div className="w-full max-w-sm">
          <p className="mb-2 text-body-sm text-on-surface-variant">{COPY.reading}</p>
          <LinearProgress label={COPY.reading} />
        </div>
      )}
    </div>
  );
}
