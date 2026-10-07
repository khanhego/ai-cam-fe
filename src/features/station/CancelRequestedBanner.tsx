import { Alert } from "@/shared/ui";

import { COPY } from "./copy";

/**
 * Đơn chuyển "Đang yêu cầu hủy" khi đang đóng (BR-21 làm rõ, EX-T4; 01 §10.4 S2): banner vàng đầu S2 theo cờ phiên
 * `ORDER_CANCEL_REQUESTED`; nút "Đóng gói xong" (quét lại mã) vẫn dùng được. 2 bíp lúc thấy cờ lần đầu ở `stationStore`.
 */
export function CancelRequestedBanner() {
  return (
    <div role="alert">
      <Alert kind="warning">
        <span className="text-headline-sm">{COPY.packing.cancelRequested}</span>
      </Alert>
    </div>
  );
}
