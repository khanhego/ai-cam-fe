import { useState, type FormEvent } from "react";

import { SESSION_FLAG, SESSION_STATUS, SOURCE, WAREHOUSE_STATUS, type SessionStatus } from "@/shared/labels";
import { Button, Icon, SelectField, StatusChip, TextField } from "@/shared/ui";

import { COPY } from "./copy";
import { validateFilters, type FilterKey, type Filters } from "./filters";

type Errors = Partial<Record<FilterKey, string>>;

/**
 * Thanh lọc D3 (01 §10.5): ô tìm tự focus (nhận máy quét, Enter là tìm), ngày từ–đến, station, trạng thái kho, nguồn.
 * Select / ngày áp dụng ngay; ô tìm áp dụng khi Enter. Lọc theo phiên (từ thẻ D2) hiện thành chip bỏ được.
 */
export function PackageFilters({
  value,
  valueKey,
  stations,
  serverErrors,
  onApply,
  onClear,
}: {
  value: Filters;
  /** Chuỗi URL hiện tại: đổi từ ngoài (Xóa bộ lọc, link D2, Back) → bản nháp theo URL. */
  valueKey: string;
  stations: { id: string; name: string }[];
  serverErrors?: Errors;
  onApply: (next: Filters, fromSearch: boolean) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState<Filters>(value);
  const [errors, setErrors] = useState<Errors>({});
  const [synced, setSynced] = useState(valueKey);
  if (synced !== valueKey) {
    setSynced(valueKey);
    setDraft(value);
    setErrors({});
  }
  const shown = { ...serverErrors, ...errors };

  function apply(next: Filters, fromSearch = false) {
    setDraft(next);
    const errs = validateFilters(next);
    setErrors(errs);
    if (Object.keys(errs).length === 0) onApply({ ...next, page: undefined }, fromSearch);
  }
  const set = (k: FilterKey) => (e: { target: { value: string } }) =>
    apply({ ...draft, [k]: e.target.value });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    apply({ ...draft, q: draft.q?.trim() }, Boolean(draft.q?.trim()));
  }

  const sessionChips: [FilterKey, string][] = [];
  if (value.session_status)
    sessionChips.push([
      "session_status",
      SESSION_STATUS[value.session_status as SessionStatus]?.[0] ?? value.session_status,
    ]);
  if (value.session_flag)
    sessionChips.push(["session_flag", SESSION_FLAG[value.session_flag] ?? value.session_flag]);

  return (
    <form role="search" aria-label="Lọc kiện" onSubmit={onSubmit} className="card mb-4 p-4 pb-0" noValidate>
      <div className="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,2fr)_repeat(2,minmax(9.5rem,1fr))_repeat(3,minmax(0,1fr))]">
        <TextField
          name="q"
          label={COPY.search.q}
          hint={COPY.search.qHint}
          error={shown.q}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          value={draft.q ?? ""}
          maxLength={80}
          onChange={(e) => setDraft({ ...draft, q: e.target.value })}
          className="sm:col-span-2 lg:col-span-1"
        />
        <TextField
          name="date_from"
          type="date"
          label={COPY.search.from}
          error={shown.date_from}
          value={draft.date_from ?? ""}
          onChange={set("date_from")}
        />
        <TextField
          name="date_to"
          type="date"
          label={COPY.search.to}
          error={shown.date_to}
          value={draft.date_to ?? ""}
          onChange={set("date_to")}
        />
        <SelectField
          name="station_id"
          label={COPY.search.station}
          value={draft.station_id ?? ""}
          onChange={set("station_id")}
        >
          <option value="">{COPY.search.all}</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          name="warehouse_status"
          label={COPY.search.warehouse}
          value={draft.warehouse_status ?? ""}
          onChange={set("warehouse_status")}
        >
          <option value="">{COPY.search.all}</option>
          {Object.entries(WAREHOUSE_STATUS).map(([k, [label]]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </SelectField>
        <SelectField
          name="source"
          label={COPY.search.source}
          value={draft.source ?? ""}
          onChange={set("source")}
        >
          <option value="">{COPY.search.all}</option>
          {Object.entries(SOURCE).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {sessionChips.length > 0 && (
          <span className="flex flex-wrap items-center gap-1" aria-label={COPY.search.sessionFilter}>
            <span className="text-body-sm text-on-surface-variant">{COPY.search.sessionFilter}:</span>
            {sessionChips.map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-label={COPY.search.removeSessionFilter(label)}
                className="state-layer rounded-sm"
                onClick={() => apply({ ...value, [k]: undefined })}
              >
                <StatusChip tone="info">
                  {label} <Icon name="close" size={14} />
                </StatusChip>
              </button>
            ))}
          </span>
        )}
        <span className="flex-1" />
        <Button variant="text" onClick={onClear}>
          {COPY.search.clear}
        </Button>
        <Button type="submit" icon="search">
          {COPY.search.submit}
        </Button>
      </div>
    </form>
  );
}
