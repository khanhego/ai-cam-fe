import { useEffect, useState } from "react";

import type { StationSession } from "@/lib/api/station";

import { useStationStore } from "../stationStore";

/**
 * BR-37 (FR-04.14): station tự hủy phiên hoàn được khi server còn cho (`self_cancel_until` khác null) và giờ server
 * chưa tới hạn. Server là nơi chặn (API-12 409 `CANCEL_REQUIRES_SUPERVISOR`); FE chỉ so giờ (DEC-480).
 */
export function canSelfCancel(
  session: Pick<StationSession, "self_cancel_until"> | null | undefined,
  serverNowMs: number,
): boolean {
  const until = session?.self_cancel_until;
  if (!until) return false;
  const t = Date.parse(until);
  return Number.isFinite(t) && serverNowMs < t;
}

/**
 * `canSelfCancel` theo giờ server (`serverNow` từ `useServerNow`, nhịp 1 giây), cộng hẹn giờ tới đúng `self_cancel_until`
 * để đổi **đúng lúc** hết hạn — 01 §10.4 R2 "nút đổi đúng lúc giây thứ 61, không cần tải lại". WS state mới có
 * `self_cancel_until = null` (lưu kết luận / chụp ảnh) → false ngay.
 */
export function useSelfCancel(
  session: Pick<StationSession, "id" | "self_cancel_until">,
  serverNow: number,
): boolean {
  const offset = useStationStore((s) => s.clockOffsetMs);
  const until = session.self_cancel_until;
  /** `self_cancel_until` mà hẹn giờ đã chạm (giữ theo giá trị: phiên mới / hạn mới không bị ảnh hưởng). */
  const [expired, setExpired] = useState<string | null>(null);
  useEffect(() => {
    if (!until) return;
    const left = Date.parse(until) - (Date.now() + offset);
    const id = setTimeout(() => setExpired(until), Math.max(0, left));
    return () => clearTimeout(id);
  }, [session.id, until, offset]);
  return expired !== until && canSelfCancel(session, serverNow);
}
