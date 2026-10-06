import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { isApiError } from "@/lib/api/errors";
import { stationApi, type ReturnLookupItem } from "@/lib/api/station";
import { WAREHOUSE_STATUS, type WarehouseStatus } from "@/shared/labels";
import { RETURN_KIND } from "@/shared/returns/inspection";
import { Alert, Button, Dialog, LinearProgress, StatusChip, TextField } from "@/shared/ui";

import { COPY } from "../copy";

const L = COPY.lookup;
const MIN_Q = 4;

function Row({ item, onOpen, busy }: { item: ReturnLookupItem; onOpen: () => void; busy: boolean }) {
  const kind = item.return_case ? RETURN_KIND[item.return_case.kind] : null;
  const status = WAREHOUSE_STATUS[item.warehouse_status as WarehouseStatus]?.[0] ?? item.warehouse_status;
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-title-lg text-on-surface">{item.tracking_number}</p>
        <p className="flex flex-wrap items-center gap-2 text-body-lg">
          {item.platform_order_sn && <span className="font-mono">{item.platform_order_sn}</span>}
          {kind && <StatusChip tone={kind[1]}>{kind[0]}</StatusChip>}
          <span>{status}</span>
        </p>
      </div>
      {item.can_open ? (
        <Button className="h-14 px-8" disabled={busy} onClick={onOpen}>
          {L.open}
        </Button>
      ) : (
        item.blocked_reason && <StatusChip tone="warning">{COPY.alert[item.blocked_reason]}</StatusChip>
      )}
    </li>
  );
}

/**
 * R3 — Tìm kiện hoàn (01 §10.4, FR-04.07, 04.13): API-104 khi bấm "Tìm" / Enter (không tự tìm khi gõ), "Mở phiên"
 * → API-105 `package_id`; không có kết quả → "Mở phiên chưa xác định" (API-105 `unidentified_code`).
 */
export function ReturnLookupDialog({
  open,
  initialQuery,
  busy,
  onOpen,
  onClose,
}: {
  open: boolean;
  initialQuery: string;
  busy: boolean;
  onOpen: (body: { package_id: string } | { unidentified_code: string }) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} title={L.title} onClose={onClose} wide>
      {open && <LookupBody key={initialQuery} initialQuery={initialQuery} busy={busy} onOpen={onOpen} />}
    </Dialog>
  );
}

function LookupBody({
  initialQuery,
  busy,
  onOpen,
}: {
  initialQuery: string;
  busy: boolean;
  onOpen: (body: { package_id: string } | { unidentified_code: string }) => void;
}) {
  const [text, setText] = useState(initialQuery);
  const [q, setQ] = useState(initialQuery.trim().length >= MIN_Q ? initialQuery.trim().toUpperCase() : "");
  const [error, setError] = useState<string | undefined>();
  const result = useQuery({
    queryKey: ["return-lookup", q],
    queryFn: () => stationApi.returnLookup(q),
    enabled: q.length >= MIN_Q,
    staleTime: 0,
    gcTime: 0,
    meta: { forbidden: "inline" },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim().toUpperCase();
    if (value.length < MIN_Q) return setError(L.minLength);
    setError(undefined);
    if (value === q) void result.refetch();
    else setQ(value);
  }

  const validation = isApiError(result.error) && result.error.code === "VALIDATION_ERROR";
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <TextField
          label={L.label}
          name="return_lookup_q"
          autoFocus
          autoComplete="off"
          maxLength={40}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(undefined);
          }}
          error={error ?? (validation ? L.minLength : undefined)}
          className="mb-0 flex-1"
        />
        <Button type="submit" icon="search" className="h-14 px-8">
          {L.submit}
        </Button>
      </div>
      {(result.isFetching || busy) && <LinearProgress label={L.title} />}
      {result.isError && !validation && <Alert kind="error">{L.error}</Alert>}
      {result.isSuccess && result.data.items.length === 0 && (
        <div className="flex flex-col items-start gap-3 py-2">
          <p className="text-title-md text-on-surface">{L.empty}</p>
          <Button
            variant="tonal"
            icon="help_center"
            className="h-14 px-8"
            disabled={busy}
            onClick={() => onOpen({ unidentified_code: q })}
          >
            {L.openUnidentified}
          </Button>
        </div>
      )}
      {result.isSuccess && result.data.items.length > 0 && (
        <ul className="flex flex-col divide-y divide-outline-variant">
          {result.data.items.map((item) => (
            <Row
              key={item.package_id}
              item={item}
              busy={busy}
              onOpen={() => onOpen({ package_id: item.package_id })}
            />
          ))}
        </ul>
      )}
    </form>
  );
}
