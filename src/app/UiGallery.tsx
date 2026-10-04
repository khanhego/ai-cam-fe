import { useState } from "react";

import {
  Alert,
  Button,
  EmptyState,
  IconButton,
  LinearProgress,
  PageHeader,
  Pagination,
  SegmentedButtons,
  SelectField,
  Skeleton,
  StatusChip,
  Tabs,
  TextField,
  toast,
  TrackingNumber,
} from "@/shared/ui";

/** Trang xem UI kit — chỉ có ở `pnpm dev` (không vào build production). */
export default function UiGallery() {
  const [tab, setTab] = useState<"cam1" | "cam2" | "both">("cam1");
  const [view, setView] = useState<"list" | "grid">("list");
  return (
    <main className="mx-auto max-w-5xl space-y-8 p-8">
      <PageHeader
        title="UI kit"
        subtitle="Component dùng chung theo design system"
        actions={<Button icon="download">Xuất clip</Button>}
      />
      <section className="flex flex-wrap items-center gap-2">
        <Button>Filled</Button>
        <Button variant="tonal">Tonal</Button>
        <Button variant="outlined">Outlined</Button>
        <Button variant="text">Text</Button>
        <Button variant="danger">Hủy phiên</Button>
        <Button disabled>Disabled</Button>
        <IconButton icon="content_copy" label="Copy" />
        <IconButton icon="bookmark" label="Giữ clip" variant="tonal" />
      </section>
      <section className="flex flex-wrap gap-2">
        <StatusChip>Mới</StatusChip>
        <StatusChip tone="primary">Đang đóng gói</StatusChip>
        <StatusChip tone="success" icon="check_circle">
          Đã đóng gói
        </StatusChip>
        <StatusChip tone="error" icon="error">
          Lệch mã
        </StatusChip>
        <StatusChip tone="warning" icon="autorenew">
          Đang cắt clip
        </StatusChip>
        <StatusChip tone="info">Đã bàn giao</StatusChip>
        <StatusChip tone="live" icon="fiber_manual_record">
          REC
        </StatusChip>
      </section>
      <section className="card grid gap-2 p-6 sm:grid-cols-2">
        <TextField label="Tên station" name="name" defaultValue="Station 01" />
        <TextField
          label="Địa chỉ Cam 1"
          name="rtsp"
          error="Không kết nối được Cam 1. Kiểm tra địa chỉ và mật khẩu camera."
        />
        <SelectField label="Trạng thái kho" name="status">
          <option>Đã đóng gói</option>
        </SelectField>
        <div className="space-y-3">
          <LinearProgress value={64} label="Đang xuất" />
          <LinearProgress label="Đang chờ" />
          <Skeleton lines={2} />
        </div>
      </section>
      <Alert kind="error">Không kết nối được Cam 2 của Station 01. Kiểm tra dây mạng rồi bấm Thử lại.</Alert>
      <Alert kind="warning">Phiên đã mở 15 phút. Quét lại mã để hoàn tất hoặc Hủy phiên.</Alert>
      <Alert kind="success">Đã nhập 500 đơn.</Alert>
      <section className="card">
        <div className="p-4">
          <Tabs
            label="Camera"
            value={tab}
            onChange={setTab}
            items={[
              ["cam1", "Cam 1"],
              ["cam2", "Cam 2"],
              ["both", "Ghép"],
            ]}
          />
          <SegmentedButtons
            label="Chế độ xem"
            value={view}
            onChange={setView}
            options={[
              ["list", "Danh sách", "list"],
              ["grid", "Lưới", "grid_view"],
            ]}
          />
          <p className="mt-4">
            <TrackingNumber value="SPXVN0123456789" />
          </p>
          <TrackingNumber value="SPXVN0123456789" size="display" copy={false} />
        </div>
        <Pagination page={2} pageSize={20} total={312} onPage={() => toast("Đổi trang")} />
      </section>
      <EmptyState
        icon="search_off"
        title="Không tìm thấy mã SPXTST000XXXX."
        action={<Button variant="tonal">Xóa bộ lọc</Button>}
      />
      <Button variant="outlined" onClick={() => toast("Đã lưu.")}>
        Hiện toast
      </Button>
    </main>
  );
}
