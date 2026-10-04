import { IconButton } from "./ui";

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between border-t border-outline-variant px-4 py-2 text-body-md text-on-surface-variant">
      <span className="tabular-nums">{total} kết quả</span>
      <div className="flex items-center gap-1">
        <IconButton icon="chevron_left" label="Trước" disabled={page <= 1} onClick={() => onPage(page - 1)} />
        <span className="px-2 tabular-nums">
          Trang {page} / {pages}
        </span>
        <IconButton
          icon="chevron_right"
          label="Sau"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        />
      </div>
    </div>
  );
}
