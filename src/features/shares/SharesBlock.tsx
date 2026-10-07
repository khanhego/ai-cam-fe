import { Link } from "react-router-dom";

import type { ShareBrief } from "@/lib/api/shares";

import { screenReady } from "../shell/nav";
import { LIST } from "./copy";
import { sharesPath, type ShareSourceQuery } from "./filters";
import { ShareActions } from "./ShareActions";
import { ShareExpires, ShareStatusChip } from "./ShareStatus";

/**
 * Khối "Link chia sẻ ({n} đang hoạt động)" ở D4 / D17 (01 §10.5 D21 cuối, FR-07.09; API-31 / 132 `shares[]` ≤ 3 link mới
 * nhất trừ `FAILED`, `shares_active_count`): mỗi dòng gửi cho · hạn · trạng thái (khi khác Đang hoạt động) · [Sao chép]
 * [Thu hồi]; "Xem tất cả" → D21 lọc nguồn (tab Tất cả — khối có cả link đã thu hồi / hết hạn).
 */
export function SharesBlock({
  shares,
  activeCount,
  sourceQuery,
  idPrefix,
}: {
  shares: ShareBrief[];
  activeCount: number;
  sourceQuery: ShareSourceQuery;
  idPrefix: string;
}) {
  const titleId = `${idPrefix}-shares`;
  return (
    <section className="card mb-4 p-4" aria-labelledby={titleId}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 id={titleId} className="text-title-md text-on-surface">
          {LIST.block(activeCount)}
        </h2>
        {shares.length > 0 && screenReady("D21") && (
          <Link to={sharesPath(sourceQuery)} className="text-label-lg text-primary hover:underline">
            {LIST.blockAll}
          </Link>
        )}
      </div>
      {shares.length === 0 ? (
        <p className="text-body-md text-on-surface-variant">{LIST.blockEmpty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-outline-variant">
          {shares.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-body-md">
              <span className="min-w-0 flex-1 break-words text-on-surface">{s.recipient}</span>
              <span className="text-body-sm text-on-surface-variant">
                {LIST.sessionCount(s.session_count)}
              </span>
              <ShareExpires share={s} prefix />
              {s.status !== "ACTIVE" && <ShareStatusChip share={s} />}
              <ShareActions share={s} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
