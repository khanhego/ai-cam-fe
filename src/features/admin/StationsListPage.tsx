import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { stationsApi, type Camera, type Station } from "@/lib/api/stations";
import { STATION_KIND } from "@/shared/returns/labels";
import { Alert, Button, EmptyState, IconButton, PageHeader, Skeleton, StatusChip } from "@/shared/ui";

function CameraChip({ camera }: { camera: Camera | undefined }) {
  if (!camera) return <StatusChip>Chưa cấu hình</StatusChip>;
  return camera.status === "ONLINE" ? (
    <StatusChip tone="success" icon="check_circle">
      Online
    </StatusChip>
  ) : (
    <StatusChip tone="error" icon="videocam_off">
      Mất tín hiệu
    </StatusChip>
  );
}

const cam = (s: Station, role: Camera["role"]) => s.cameras.find((c) => c.role === role);

/** D6 — danh sách station (01 §10.5, FR-01.01; item 02: cột Loại). */
export default function StationsListPage() {
  const navigate = useNavigate();
  const stations = useQuery({ queryKey: ["stations"], queryFn: stationsApi.list });
  const add = (
    <Button icon="add" onClick={() => navigate("/admin/settings/stations/new")}>
      Thêm station
    </Button>
  );

  return (
    <>
      <PageHeader title="Station" subtitle="Bàn đóng gói, tài khoản station và camera" actions={add} />
      {stations.isPending && (
        <div className="card p-4">
          <Skeleton lines={4} className="h-8" />
        </div>
      )}
      {stations.isError && (
        <Alert
          kind="error"
          action={
            <Button variant="text" onClick={() => stations.refetch()}>
              Thử lại
            </Button>
          }
        >
          Không tải được danh sách station.
        </Alert>
      )}
      {stations.data?.items.length === 0 && (
        <EmptyState icon="point_of_sale" title="Chưa có station nào." action={add} />
      )}
      {stations.data && stations.data.items.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="md-table">
            <thead>
              <tr>
                <th>Tên</th>
                <th>Loại</th>
                <th>Tài khoản station</th>
                <th>Cam 1</th>
                <th>Cam 2</th>
                <th>Trạng thái</th>
                <th aria-label="Thao tác" />
              </tr>
            </thead>
            <tbody>
              {stations.data.items.map((s) => (
                <tr key={s.id}>
                  <td className="text-title-sm">{s.name}</td>
                  <td>{STATION_KIND[s.kind]}</td>
                  <td className="font-mono">{s.account?.username ?? "—"}</td>
                  <td>
                    <CameraChip camera={cam(s, "CAM1")} />
                  </td>
                  <td>
                    <CameraChip camera={cam(s, "CAM2")} />
                  </td>
                  <td>
                    {s.is_active ? (
                      <StatusChip tone="success">Đang bật</StatusChip>
                    ) : (
                      <StatusChip>Đang tắt</StatusChip>
                    )}
                  </td>
                  <td className="text-right">
                    <IconButton
                      icon="edit"
                      label={`Sửa ${s.name}`}
                      onClick={() => navigate(`/admin/settings/stations/${s.id}`)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
