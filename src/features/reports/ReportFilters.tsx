import { useState, type FormEvent } from "react";

import { PlatformFilter } from "@/shared/filters/PlatformFilter";
import { vnDay } from "@/shared/format";
import { Button, SegmentedButtons, SelectField, TextField } from "@/shared/ui";

import { REPORT_COPY } from "./reportCopy";
import {
  hasErrors,
  presetOf,
  presetRange,
  PRESETS,
  validatePeriod,
  type PeriodErrors,
  type Preset,
  type ReportUrlFilters,
} from "./reportParams";

const C = REPORT_COPY.filters;

/**
 * `ReportFilters` D20 (02b-admin §3, §5): kỳ nhanh (`SegmentedButtons`, áp ngay) + 2 ô ngày (áp khi bấm "Xem", nút khóa
 * khi kỳ sai) + Sàn / Shop (`PlatformFilter`, áp ngay) + Station (chỉ tab Năng suất). Mọi giá trị ghi URL do trang làm.
 * `serverErrors`: 422 `fields.from` / `fields.to` từ API-150..152 — hiện dưới ô ngày như lỗi client.
 */
export function ReportFilters({
  filters,
  onChange,
  stations,
  serverErrors,
}: {
  filters: ReportUrlFilters;
  onChange: (next: Partial<ReportUrlFilters>) => void;
  stations?: { id: string; name: string }[];
  serverErrors?: PeriodErrors;
}) {
  const today = vnDay();
  const [draft, setDraft] = useState({ from: filters.from, to: filters.to });
  // Đồng bộ ô ngày khi URL đổi từ ngoài (kỳ nhanh, back / forward) — "adjust state on prop change".
  const [synced, setSynced] = useState({ from: filters.from, to: filters.to });
  if (synced.from !== filters.from || synced.to !== filters.to) {
    setSynced({ from: filters.from, to: filters.to });
    setDraft({ from: filters.from, to: filters.to });
  }
  const errors = validatePeriod(draft.from, draft.to, today);
  const dirty = draft.from !== filters.from || draft.to !== filters.to;
  // Lỗi server chỉ đúng với kỳ đang áp; lỗi client của bản nháp luôn hiện ngay khi gõ.
  const shown: PeriodErrors = hasErrors(errors) ? errors : dirty ? {} : (serverErrors ?? {});
  const preset = presetOf(filters.from, filters.to, today);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (hasErrors(errors)) return;
    onChange({ from: draft.from, to: draft.to });
  }

  return (
    <form
      noValidate
      aria-label={C.label}
      onSubmit={submit}
      className="card mb-4 flex flex-col gap-3 p-4 pb-0"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-label-lg text-on-surface-variant">{C.period}</span>
        <SegmentedButtons
          label={C.period}
          options={PRESETS.map((n) => [String(n), C.presets[String(n) as `${Preset}`]])}
          value={preset ? String(preset) : ""}
          onChange={(v) => onChange(presetRange(Number(v) as Preset, today))}
        />
      </div>
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
        <TextField
          name="from"
          id="report-from"
          type="date"
          label={C.from}
          max={today}
          required
          error={shown.from}
          value={draft.from}
          onChange={(e) => setDraft({ ...draft, from: e.target.value })}
        />
        <TextField
          name="to"
          id="report-to"
          type="date"
          label={C.to}
          max={today}
          required
          error={shown.to}
          value={draft.to}
          onChange={(e) => setDraft({ ...draft, to: e.target.value })}
        />
        <PlatformFilter
          idPrefix="report"
          platform={filters.platform}
          shopId={filters.shop}
          onChange={(v) => onChange({ platform: v.platform, shop: v.shopId })}
        />
        {stations ? (
          <SelectField
            id="report-station"
            name="station"
            label={C.station}
            value={filters.station ?? ""}
            onChange={(e) => onChange({ station: e.target.value || null })}
          >
            <option value="">{C.allStations}</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <span className="hidden lg:block" />
        )}
        <div className="mb-5 flex items-start">
          <Button type="submit" variant="tonal" icon="search" disabled={hasErrors(errors)}>
            {C.apply}
          </Button>
        </div>
      </div>
    </form>
  );
}
