import { useRef } from "react";

import { logout } from "@/lib/api/auth";
import type { StationState } from "@/lib/api/station";
import { Button, Icon, StatusChip } from "@/shared/ui";

import { useAuth } from "../auth/useAuth";
import { cameraName, COPY } from "./copy";
import { hhmmss, useServerNow } from "./useServerClock";

const HOLD_MS = 3000;

/**
 * Thanh 56px: station · (chế độ nhận hoàn: chip "Nhận hàng hoàn" + "Người kiểm: Lan [Đổi]") · chip Cam 1 / Cam 2 / Mạng
 * · giờ server · nút đăng xuất giữ 3 giây (01 §10.4). "Đổi" chỉ bấm được khi rảnh (đang có phiên → khóa, R5).
 */
export function StationStatusBar({
  state,
  online,
  onChangeOperator,
}: {
  state: StationState | null;
  online: boolean;
  onChangeOperator?: () => void;
}) {
  const now = useServerNow();
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const startHold = () => {
    holdTimer.current = setTimeout(async () => {
      await logout().catch(() => undefined);
      useAuth.setState({ me: null, status: "ready" });
    }, HOLD_MS);
  };
  const endHold = () => clearTimeout(holdTimer.current);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-outline-variant bg-surface px-6 text-on-surface">
      <span className="text-title-lg">{state?.station.name ?? "…"}</span>
      {state?.station.work_mode === "RETURN" && (
        <>
          <StatusChip tone="info" icon="assignment_return">
            {COPY.workMode.chip}
          </StatusChip>
          {state.station.operator_name && (
            <span className="flex items-center gap-1 text-title-md">
              <span>{COPY.operator.statusBar(state.station.operator_name)}</span>
              {onChangeOperator && (
                <Button
                  variant="text"
                  size="sm"
                  aria-label={`${COPY.operator.change} người kiểm`}
                  disabled={state.state !== "READY"}
                  title={state.state !== "READY" ? COPY.operator.sessionActive : undefined}
                  onClick={onChangeOperator}
                >
                  {COPY.operator.change}
                </Button>
              )}
            </span>
          )}
        </>
      )}
      <div className="flex flex-1 flex-wrap gap-2">
        {state?.cameras.map((cam) =>
          cam.status === "ONLINE" ? (
            <StatusChip key={cam.role} tone="success" icon="check_circle">
              {COPY.camera.online(cameraName(cam.role))}
            </StatusChip>
          ) : (
            <StatusChip key={cam.role} tone="error" icon="videocam_off">
              {COPY.camera.offline(cameraName(cam.role))}
            </StatusChip>
          ),
        )}
        <StatusChip tone={online ? "success" : "error"} icon={online ? "check_circle" : "cloud_off"}>
          {COPY.network}
        </StatusChip>
      </div>
      <span className="font-mono text-title-lg tabular-nums">{hhmmss(now)}</span>
      <button
        type="button"
        aria-label={COPY.logout}
        title={COPY.logout}
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerLeave={endHold}
        className="state-layer inline-flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant"
      >
        <Icon name="logout" />
      </button>
    </header>
  );
}
