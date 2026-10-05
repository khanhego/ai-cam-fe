import { COPY } from "./copy";
import { usePendingApprovals } from "./usePendingApprovals";

/** Badge số yêu cầu PENDING trên mục "Yêu cầu duyệt" của drawer (01 §10.5 D13, 02b-admin §9 a11y). */
export function ApprovalBadge() {
  const { data } = usePendingApprovals();
  const n = data?.total ?? data?.items.length ?? 0;
  if (n === 0) return null;
  return (
    <span
      role="status"
      aria-label={COPY.badge(n)}
      className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1.5 text-label-sm text-on-error tabular-nums"
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}
