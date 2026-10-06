import type { ClosedSession } from "@/lib/api/station";
import { Alert, Button } from "@/shared/ui";

import { COPY } from "./copy";

/** Chữ + mức của thông báo sau đóng; null = không cần báo. */
function closedNoticeText(c: ClosedSession): { kind: "success" | "warning"; text: string } | null {
  const n = COPY.closedNotice;
  if (c.type === "PACK") {
    // FR-03.14 (L4): cờ Cam 2 của phiên vừa đóng.
    const lines = [
      c.flags.includes("LABEL_ON_TRAY") ? n.labelOnTray(c.tracking_number) : null,
      c.flags.includes("CAM2_UNVERIFIED") ? n.cam2Unverified(c.tracking_number) : null,
    ].filter(Boolean);
    return lines.length ? { kind: "warning", text: lines.join(" ") } : null;
  }
  if (c.type === "RETURN") {
    if (!c.conclusion) return null;
    if (c.flags.includes("AUTO_CLOSED")) {
      const claim = c.claim_code ? ` Đã tạo hồ sơ khiếu nại ${c.claim_code}.` : "";
      return { kind: "warning", text: n.autoClosed(c.tracking_number, c.conclusion) + claim };
    }
    if (c.conclusion === "OK") return { kind: "success", text: n.returnOk(c.tracking_number, c.conclusion) };
    return { kind: "warning", text: n.returnIssue(c.tracking_number, c.conclusion, c.claim_code) };
  }
  return null;
}

/**
 * Thông báo phiên vừa đóng (01 §10.4): S1 cờ "Phiếu còn trên khay" / "Cam 2 không xác minh"; R1 kết luận + mã hồ sơ khiếu nại, tự hoàn tất quá giờ. Tự ẩn 10 giây hoặc lần
 * quét kế (store).
 */
export function ClosedNotice({ closed, onDismiss }: { closed: ClosedSession | null; onDismiss: () => void }) {
  if (!closed) return null;
  const notice = closedNoticeText(closed);
  if (!notice) return null;
  return (
    <Alert
      kind={notice.kind}
      action={
        <Button variant="text" onClick={onDismiss}>
          Đóng
        </Button>
      }
    >
      <span className="text-title-lg">{notice.text}</span>
    </Alert>
  );
}
