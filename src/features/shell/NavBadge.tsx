import { useQuery } from "@tanstack/react-query";

import { reportsApi } from "@/lib/api/reports";
import { vnDay } from "@/shared/format";

import { usePendingApprovals } from "../approvals/usePendingApprovals";
import { COPY } from "./copy";

export type BadgeKind = "approvals" | "recon" | "claims";

/**
 * Số trên badge drawer (02b-admin §3 `NavBadge`, DEC-243): yêu cầu duyệt PENDING (API-20), cảnh báo lệch mức Cao
 * đang mở (`counts.recon_open.HIGH`) và hồ sơ sắp hết hạn (`counts.claims_due_soon`) từ API-32 — dùng chung query
 * `['daily', today]` của D2 (WS `report.updated` làm mới). Không phải live region (DEC-174 item 01): số `aria-hidden`,
 * câu đầy đủ `sr-only` thành một phần tên link.
 */
function useDailyCount(kind: "recon" | "claims", enabled: boolean) {
  const today = vnDay();
  const { data } = useQuery({
    queryKey: ["daily", today],
    queryFn: () => reportsApi.daily(today),
    refetchInterval: 60_000,
    enabled,
  });
  if (!data) return 0;
  return kind === "recon" ? (data.counts.recon_open?.HIGH ?? 0) : (data.counts.claims_due_soon ?? 0);
}

function Badge({ n, label }: { n: number; label: string }) {
  if (n === 0) return null;
  return (
    <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1.5 text-label-sm text-on-error tabular-nums">
      <span aria-hidden="true">{n > 99 ? "99+" : n}</span>
      <span className="sr-only">, {label}</span>
    </span>
  );
}

function ApprovalsBadge() {
  const { data } = usePendingApprovals();
  const n = data?.total ?? data?.items.length ?? 0;
  return <Badge n={n} label={COPY.badge.approvals(n)} />;
}

function DailyBadge({ kind }: { kind: "recon" | "claims" }) {
  const n = useDailyCount(kind, true);
  return <Badge n={n} label={COPY.badge[kind](n)} />;
}

export function NavBadge({ kind }: { kind: BadgeKind }) {
  return kind === "approvals" ? <ApprovalsBadge /> : <DailyBadge kind={kind} />;
}
