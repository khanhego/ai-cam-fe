import type { ScanAlert } from "@/lib/api/station";
import { Button } from "@/shared/ui";

import { COPY } from "./copy";
import { StationStatePanel } from "./StationStatePanel";

/** S4 — Cảnh báo sau lần quét (01 §10.4). Tự đóng 5 giây (store). */
export function AlertOverlay({
  alert,
  code,
  onRequestRepack,
}: {
  alert: ScanAlert;
  code: string | null;
  onRequestRepack: (code: string) => void;
}) {
  return (
    <StationStatePanel tone="warning" icon="warning" title={COPY.alert[alert.code]}>
      <p className="text-headline-md">{alert.message}</p>
      {alert.code === "ALREADY_PACKED" && alert.data.can_request_repack === true && code && (
        <div>
          <Button
            variant="filled"
            className="h-14 px-8"
            icon="restart_alt"
            onClick={() => onRequestRepack(code)}
          >
            {COPY.requestRepack}
          </Button>
        </div>
      )}
    </StationStatePanel>
  );
}
