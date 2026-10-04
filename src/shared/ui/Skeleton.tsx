import { cx } from "./cx";

/** Khối giữ chỗ khi đang tải (02b §6). NEW — chưa có trong design system (DEC-44). */
export function Skeleton({ className, lines = 1 }: { className?: string; lines?: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={cx("md-skeleton h-4 w-full", className)} />
      ))}
    </div>
  );
}
