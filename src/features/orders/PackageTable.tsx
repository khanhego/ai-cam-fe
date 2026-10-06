import type { PackageListItem } from "@/lib/api/packages";
import { fmtDateTime } from "@/shared/format";
import { ShopChip } from "@/shared/filters/ShopChip";
import { PLATFORM_LABEL, platformStatus, SOURCE, WAREHOUSE_STATUS } from "@/shared/labels";
import { Icon, StatusChip, TrackingNumber } from "@/shared/ui";

import { COPY } from "./copy";

const detail = (p: PackageListItem) => `/admin/packages/${p.id}`;

function WarehouseChip({ status }: { status: PackageListItem["warehouse_status"] }) {
  const [label, tone] = WAREHOUSE_STATUS[status] ?? ["—", "neutral"];
  return <StatusChip tone={tone}>{label}</StatusChip>;
}

/** Chip "Hoàn" (kiện có hồ sơ hàng hoàn — 01 §10.5 D3) + "Kiện tạm" (hàng hoàn chưa xác định, 02b-admin §3). */
function ReturnChips({ p }: { p: PackageListItem }) {
  return (
    <>
      {p.return_case && (
        <StatusChip tone="info" icon="assignment_return" title={`${COPY.returnCase} ${p.return_case.code}`}>
          {COPY.returnChip}
        </StatusChip>
      )}
      {p.is_placeholder && <StatusChip tone="warning">{COPY.detail.placeholder}</StatusChip>}
    </>
  );
}

function ClipMark({ has }: { has: boolean }) {
  return has ? (
    <span title={COPY.hasClip} className="text-primary">
      <Icon name="movie" size={20} />
      <span className="sr-only">{COPY.hasClip}</span>
    </span>
  ) : (
    <span title={COPY.noClip} className="text-on-surface-variant">
      —<span className="sr-only">{COPY.noClip}</span>
    </span>
  );
}

/** Kết quả D3 (01 §10.5): bảng từ `md`, card dưới `md` (design system: trang không cuộn ngang ở 360px). */
export function PackageTable({ items }: { items: PackageListItem[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="md-table">
          <thead>
            <tr>
              <th className="pl-4">{COPY.col.tracking}</th>
              <th>{COPY.col.order}</th>
              <th>{COPY.col.warehouse}</th>
              <th>{COPY.col.shop}</th>
              <th>{COPY.col.platform}</th>
              <th>{COPY.col.station}</th>
              <th>{COPY.col.packedAt}</th>
              <th className="pr-4 text-center">{COPY.col.clip}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td className="pl-4">
                  <TrackingNumber value={p.tracking_number} to={detail(p)} />
                </td>
                <td className="font-mono">{p.platform_order_sn ?? "—"}</td>
                <td>
                  <span className="flex flex-wrap gap-1">
                    <WarehouseChip status={p.warehouse_status} />
                    <ReturnChips p={p} />
                  </span>
                </td>
                <td>
                  <ShopChip platform={p.platform} shop={p.shop} />
                </td>
                <td>{platformStatus(p.platform_status)}</td>
                <td>{p.last_session?.station_name ?? "—"}</td>
                <td className="tabular-nums">{fmtDateTime(p.last_session?.ended_at)}</td>
                <td className="pr-4 text-center">
                  <ClipMark has={p.has_clip} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-outline-variant md:hidden" aria-label="Kết quả">
        {items.map((p) => (
          <li key={p.id} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <TrackingNumber value={p.tracking_number} to={detail(p)} className="text-title-sm" />
              <ClipMark has={p.has_clip} />
            </div>
            <div className="flex flex-wrap gap-1">
              <WarehouseChip status={p.warehouse_status} />
              <ReturnChips p={p} />
              <ShopChip platform={p.platform} shop={p.shop} />
              {p.platform_status && (
                <StatusChip>
                  {p.platform ? PLATFORM_LABEL[p.platform] : COPY.col.platform}:{" "}
                  {platformStatus(p.platform_status)}
                </StatusChip>
              )}
              {p.source === "CSV" && <StatusChip>Nguồn: {SOURCE.CSV}</StatusChip>}
            </div>
            <p className="text-body-sm text-on-surface-variant">
              {p.platform_order_sn ?? "—"} · {p.last_session?.station_name ?? "—"} ·{" "}
              {fmtDateTime(p.last_session?.ended_at)}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
