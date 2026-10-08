import type { ScanAlert } from "@/lib/api/station";
import { Button } from "@/shared/ui";

import { COPY } from "./copy";
import { StationStatePanel } from "./StationStatePanel";

/**
 * S4 — Cảnh báo sau lần quét (01 §10.4). Tự đóng 5 giây (store). Item 02 — R4 (chế độ nhận hoàn): tự đóng 8 giây,
 * `RETURN_NOT_FOUND` có 2 nút (không tự đóng), `RETURN_ALREADY_RECEIVED` có "Đây là kiện khác — vẫn ghi hình".
 */
export function AlertOverlay({
  alert,
  code,
  onRequestRepack,
  onLookup,
  onOpenUnidentified,
  onRecordOther,
  onDismiss,
}: {
  alert: ScanAlert;
  code: string | null;
  onRequestRepack: (code: string) => void;
  onLookup?: (code: string) => void;
  onOpenUnidentified?: (code: string) => void;
  onRecordOther?: (code: string) => void;
  onDismiss?: () => void;
}) {
  const scanned = typeof alert.data.code === "string" ? alert.data.code : code;
  const big = "h-14 px-8";
  return (
    <StationStatePanel tone="warning" icon="warning" title={alertTitle(alert)}>
      <p className="text-headline-md">
        {alert.message ||
          (alert.code === "OPERATOR_REQUIRED" && alert.data.mode === "PACK"
            ? COPY.returnAlert.operatorRequiredPack
            : (COPY.alertBody[alert.code] ?? ""))}
      </p>
      {alert.code === "ALREADY_HANDED_OVER" &&
        alert.data.is_return === true &&
        !alert.message.includes("hàng hoàn") && (
          <p className="text-headline-sm">{COPY.returnAlert.isReturnAtPack}</p>
        )}
      {alert.code === "ALREADY_PACKED" && alert.data.can_request_repack === true && code && (
        <div>
          <Button variant="filled" className={big} icon="restart_alt" onClick={() => onRequestRepack(code)}>
            {COPY.requestRepack}
          </Button>
        </div>
      )}
      {alert.code === "RETURN_NOT_FOUND" && scanned && (
        <div className="flex flex-wrap gap-6">
          <Button variant="filled" icon="search" className={big} onClick={() => onLookup?.(scanned)}>
            {COPY.returnAlert.findManual}
          </Button>
          {alert.data.can_open_unidentified !== false && (
            <Button
              variant="elevated"
              icon="help_center"
              className={big}
              onClick={() => onOpenUnidentified?.(scanned)}
            >
              {COPY.returnAlert.openUnidentified}
            </Button>
          )}
          <Button variant="text" className={big} onClick={onDismiss}>
            Đóng
          </Button>
        </div>
      )}
      {alert.code === "RETURN_ALREADY_RECEIVED" && alert.data.can_record_other === true && code && (
        <div>
          <Button variant="elevated" icon="videocam" className={big} onClick={() => onRecordOther?.(code)}>
            {COPY.returnAlert.recordOther}
          </Button>
        </div>
      )}
    </StationStatePanel>
  );
}

/** Tiêu đề S4 / R4; `OPERATOR_REQUIRED` ở chế độ đóng gói (item 03) đổi theo `data.mode`. */
function alertTitle(alert: ScanAlert): string {
  if (alert.code === "OPERATOR_REQUIRED" && alert.data.mode === "PACK")
    return COPY.alertPack.OPERATOR_REQUIRED;
  return COPY.alert[alert.code];
}
