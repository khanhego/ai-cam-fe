import { useQuery } from "@tanstack/react-query";
import { useId } from "react";

import { sharesApi } from "@/lib/api/shares";
import { Button } from "@/shared/ui";

import { COPY } from "./copy";

/**
 * D4 "Tạo link chia sẻ" cho một phiên (01 §10.5 D4). G3V-2 (02b DEC-934): phiên RETURN bị loại theo BR-39
 * (`excluded`) hoặc "Cần soát" chưa xác nhận (`review_needed`) — đọc API-164 nguồn phiên (cùng cache với
 * ShareLinkDialog) → nút khóa + tooltip + chữ ngắn (API-160 sẽ 409 `SESSION_EXCLUDED`). Đang tải / lỗi → nút bấm được
 * (dialog tự báo lỗi).
 */
export function SessionShareButton({
  session,
  onOpen,
}: {
  session: { id: string; type: "PACK" | "RETURN" };
  onOpen: () => void;
}) {
  const hintId = useId();
  const query = { session_id: session.id };
  const options = useQuery({
    queryKey: ["shareOptions", query],
    queryFn: () => sharesApi.options(query),
    enabled: session.type === "RETURN",
    retry: false,
  });
  const row = options.data?.sessions.find((s) => s.id === session.id);
  const held = Boolean(row && (row.excluded || row.review_needed));
  if (!held)
    return (
      <Button variant="tonal" icon="link" onClick={onOpen}>
        {COPY.open}
      </Button>
    );
  return (
    // Nút khóa không nhận chuột (`pointer-events-none`) → tooltip đặt cả ở khung bọc.
    <span className="inline-flex flex-wrap items-center gap-2" title={COPY.heldBack}>
      <Button variant="tonal" icon="link" disabled title={COPY.heldBack} aria-describedby={hintId}>
        {COPY.open}
      </Button>
      <span id={hintId} className="text-body-sm text-on-surface-variant">
        {COPY.heldBackShort}
      </span>
    </span>
  );
}
