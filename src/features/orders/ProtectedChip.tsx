import { Link } from "react-router-dom";

import type { PackageSession } from "@/lib/api/packages";
import { fmtDate } from "@/shared/format";
import { StatusChip } from "@/shared/ui";

import { claimPath } from "../claims/paths";
import { screenReady } from "../shell/nav";
import { COPY } from "./copy";
import { sessionProtection } from "./protection";

const C = COPY.protection;

/**
 * Chip "Đang được giữ: …" thay nút "Giữ clip" (01 §10.5 D4, FR-02.06, 02.09, ADR-009, DEC-242). Hồ sơ khiếu nại → link
 * D17 (khi màn có); hàng hoàn → mã HH; "tới {ngày}" khi lý do có hạn (Chỉ hoàn tiền 30 ngày; đã nhận + 7 ngày —
 * DEC-268). Không được bảo vệ mà còn clip → gợi ý "Muốn giữ clip? Tạo hồ sơ khiếu nại." (R-1, RF-23).
 */
export function ProtectedChip({ session }: { session: PackageSession }) {
  const protection = sessionProtection(session);
  const hasClip = session.clips.some((c) => c.status !== "DELETED");
  if (!protection) {
    return hasClip ? <p className="mt-2 text-body-sm text-on-surface-variant">{C.hint}</p> : null;
  }
  const ids = new Map(session.protected_by_claims.map((c) => [c.code, c.id] as const));
  const until = protection.until ? ` ${C.until(fmtDate(protection.until))}` : "";
  const d17 = screenReady("D17");
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1" aria-label={C.label}>
      {protection.claims.map((code) => {
        const id = ids.get(code);
        const chip = (
          <StatusChip tone="info" icon="shield">
            {C.claim(code)}
          </StatusChip>
        );
        return id && d17 ? (
          <Link key={code} to={claimPath(id)} className="rounded-sm hover:underline">
            {chip}
          </Link>
        ) : (
          <span key={code}>{chip}</span>
        );
      })}
      {protection.return_cases.map((code) => (
        <StatusChip key={code} tone="info" icon="shield">
          {C.returnCase(code)}
          {until}
        </StatusChip>
      ))}
      {protection.reasons.includes("HELD") && (
        <StatusChip tone="info" icon="shield">
          {C.held}
        </StatusChip>
      )}
    </div>
  );
}
