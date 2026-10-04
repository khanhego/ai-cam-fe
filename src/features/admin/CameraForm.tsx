import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { isApiError } from "@/lib/api/errors";
import { stationsApi, type Camera, type CameraRole } from "@/lib/api/stations";
import { Alert, Button, StatusChip, TextField, toast } from "@/shared/ui";

const REASON: Record<string, string> = {
  TIMEOUT: "Không kết nối được camera (hết thời gian chờ). Kiểm tra địa chỉ camera và dây mạng.",
  AUTH: "Không kết nối được camera (sai tài khoản hoặc mật khẩu). Kiểm tra lại thông tin đăng nhập camera.",
  STREAM: "Không kết nối được camera (không có luồng video). Kiểm tra đường dẫn luồng RTSP.",
};
const LABEL = { CAM1: "Cam 1 — bàn đóng gói", CAM2: "Cam 2 — khay phiếu" } as const;

/** Cấu hình một camera (API-61) + kiểm tra kết nối (API-62) — 01 §10.5 D6. Lỗi kết nối không chặn lưu. */
/** Form sửa không hiện lại tài khoản / mật khẩu đã lưu; để trống = giữ (02 API-61, review M1 #11). */
const KEEP_HINT = "Để trống để giữ giá trị đã lưu";

export function CameraForm({
  stationId,
  role,
  camera,
}: {
  stationId: string;
  role: CameraRole;
  camera?: Camera;
}) {
  const queryClient = useQueryClient();
  const [rtspUrl, setRtspUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [urlError, setUrlError] = useState<string | undefined>();
  const body = () => ({
    rtsp_url: rtspUrl.trim(),
    username: username || undefined,
    password: password || undefined,
  });
  const validate = () => {
    const err = /^rtsp:\/\//.test(rtspUrl.trim()) ? undefined : "Địa chỉ phải bắt đầu bằng rtsp://";
    setUrlError(err);
    return !err;
  };

  const test = useMutation({ mutationFn: () => stationsApi.testCamera(body()) });
  const save = useMutation({
    mutationFn: () => stationsApi.setCamera(stationId, role, body()),
    onSuccess: () => {
      toast("Đã lưu camera.");
      setPassword("");
      void queryClient.invalidateQueries({ queryKey: ["station", stationId] });
      void queryClient.invalidateQueries({ queryKey: ["stations"] });
    },
  });

  const testError =
    test.error && isApiError(test.error)
      ? (REASON[String(test.error.details.reason)] ?? test.error.message)
      : null;

  return (
    <section className="card p-6" aria-labelledby={`cam-${role}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id={`cam-${role}`} className="text-title-md">
          {LABEL[role]}
        </h2>
        {camera &&
          (camera.status === "ONLINE" ? (
            <StatusChip tone="success" icon="check_circle">
              Online
            </StatusChip>
          ) : (
            <StatusChip tone="error" icon="videocam_off">
              Mất tín hiệu
            </StatusChip>
          ))}
      </div>
      {camera && (
        <p className="mb-4 font-mono text-body-md text-on-surface-variant">
          Hiện tại: {camera.rtsp_url_masked}
        </p>
      )}
      <TextField
        label="Địa chỉ RTSP"
        name={`${role}-rtsp`}
        placeholder="rtsp://192.168.20.12:554/stream1"
        value={rtspUrl}
        onChange={(e) => setRtspUrl(e.target.value)}
        error={urlError}
      />
      <div className="grid gap-x-4 sm:grid-cols-2">
        <TextField
          label="Tài khoản camera"
          name={`${role}-user`}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          hint={camera ? KEEP_HINT : undefined}
        />
        <TextField
          label="Mật khẩu camera"
          name={`${role}-pass`}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          hint={camera ? KEEP_HINT : undefined}
        />
      </div>
      {testError && <Alert kind="error">{testError}</Alert>}
      {save.isError && <Alert kind="error">{save.error.message}</Alert>}
      {test.data && (
        <figure className="mb-4">
          <img
            src={test.data.snapshot}
            alt={`Ảnh chụp thử ${LABEL[role]}`}
            className="aspect-video w-full max-w-md rounded-md object-cover"
          />
          <figcaption className="mt-1 text-body-sm text-on-surface-variant">
            {test.data.clock_offset_ms === null
              ? "Camera không hỗ trợ ONVIF: không đo được lệch giờ."
              : `Lệch giờ so với máy chủ: ${test.data.clock_offset_ms} ms`}
          </figcaption>
        </figure>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outlined"
          icon="network_check"
          disabled={test.isPending}
          onClick={() => validate() && test.mutate()}
        >
          {test.isPending ? "Đang kiểm tra…" : "Kiểm tra kết nối"}
        </Button>
        <Button icon="save" disabled={save.isPending} onClick={() => validate() && save.mutate()}>
          Lưu camera
        </Button>
      </div>
    </section>
  );
}
