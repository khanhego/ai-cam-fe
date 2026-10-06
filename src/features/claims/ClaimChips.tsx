import { Link } from "react-router-dom";

import type { ClaimStatus } from "@/lib/api/claims";
import { CLAIM_STATUS, CLAIM_TYPE } from "@/shared/returns/labels";
import type { ClaimBrief } from "@/shared/returns/types";
import { StatusChip } from "@/shared/ui";

import { screenReady } from "../shell/nav";
import { claimPath } from "./paths";

/** Chip hồ sơ khiếu nại "KN-000124 Mới [Mở]" (01 §10.5 D4) — link D17 khi màn có (DEC-51). */
export function ClaimChips({ claims }: { claims: ClaimBrief[] }) {
  const d17 = screenReady("D17");
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {claims.map((c) => {
        const [label, tone] = CLAIM_STATUS[c.status as ClaimStatus] ?? [c.status, "neutral"];
        const type = c.type ? CLAIM_TYPE[c.type as keyof typeof CLAIM_TYPE] : null;
        return (
          <li key={c.id} className="flex items-center gap-1 text-body-md">
            <span className="font-mono text-on-surface">{c.code}</span>
            {type && <span className="text-on-surface-variant">{type}</span>}
            <StatusChip tone={tone}>{label}</StatusChip>
            {d17 && (
              <Link
                to={claimPath(c.id)}
                aria-label={`Mở ${c.code}`}
                className="px-1 text-label-lg text-primary hover:underline"
              >
                Mở
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
