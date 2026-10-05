import { COPY } from "./copy";
import { usePendingApprovals } from "./usePendingApprovals";

/**
 * Badge số yêu cầu PENDING trên mục "Yêu cầu duyệt" của drawer (01 §10.5 D13, 02b-admin §9 a11y).
 * Không phải live region (drawer cố định và drawer mobile cùng render → trình đọc màn hình đọc 2 lần): số hiện bằng
 * mắt `aria-hidden`, câu đầy đủ ẩn bằng `sr-only` nên thành một phần tên link nav ("Yêu cầu duyệt, 2 yêu cầu đang chờ").
 */
export function ApprovalBadge() {
  const { data } = usePendingApprovals();
  const n = data?.total ?? data?.items.length ?? 0;
  if (n === 0) return null;
  return (
    <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1.5 text-label-sm text-on-error tabular-nums">
      <span aria-hidden="true">{n > 99 ? "99+" : n}</span>
      <span className="sr-only">, {COPY.badge(n)}</span>
    </span>
  );
}
