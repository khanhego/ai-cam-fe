import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import {
  Alert,
  Button,
  Dialog,
  EmptyState,
  IconButton,
  LinearProgress,
  Pagination,
  Skeleton,
  StatusChip,
  Tabs,
  TextField,
  toast,
  Toaster,
  TOAST_MS,
  TrackingNumber,
  useToastStore,
} from "./index";

test("Button mặc định là filled và type=button", () => {
  render(<Button icon="download">Xuất clip</Button>);

  const button = screen.getByRole("button", { name: /Xuất clip/ });
  expect(button).toHaveAttribute("type", "button");
  expect(button).toHaveClass("bg-primary", "state-layer");
});

test("IconButton có tên truy cập từ label", () => {
  render(<IconButton icon="delete" label="Xóa" />);

  expect(screen.getByRole("button", { name: "Xóa" })).toHaveAttribute("title", "Xóa");
});

test("TextField nối lỗi qua aria-describedby", () => {
  render(<TextField label="Tên station" name="name" error="Tên station đã tồn tại." />);

  const input = screen.getByLabelText("Tên station");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription("Tên station đã tồn tại.");
});

test("Alert lỗi dùng role=alert, còn lại role=status", () => {
  render(
    <>
      <Alert kind="error">Không kết nối được Cam 2.</Alert>
      <Alert kind="success">Đã nhập 500 đơn.</Alert>
    </>,
  );

  expect(screen.getByRole("alert")).toHaveTextContent("Không kết nối được Cam 2.");
  expect(screen.getByRole("status")).toHaveTextContent("Đã nhập 500 đơn.");
});

test("StatusChip tone live dùng màu REC", () => {
  render(
    <StatusChip tone="live" icon="fiber_manual_record">
      REC
    </StatusChip>,
  );

  expect(screen.getByText("REC").parentElement).toHaveClass("bg-live", "text-on-live");
});

test("LinearProgress có và không có giá trị", () => {
  render(
    <>
      <LinearProgress value={42.4} label="Đang xuất" />
      <LinearProgress label="Đang chờ" />
    </>,
  );

  expect(screen.getByRole("progressbar", { name: "Đang xuất" })).toHaveAttribute("aria-valuenow", "42");
  expect(screen.getByRole("progressbar", { name: "Đang chờ" })).not.toHaveAttribute("aria-valuenow");
});

test("Tabs đổi tab đang chọn", async () => {
  function Demo() {
    const [tab, setTab] = useState<"cam1" | "cam2">("cam1");
    return (
      <Tabs
        label="Camera"
        value={tab}
        onChange={setTab}
        items={[
          ["cam1", "Cam 1"],
          ["cam2", "Cam 2"],
        ]}
      />
    );
  }
  render(<Demo />);

  await userEvent.click(screen.getByRole("tab", { name: "Cam 2" }));

  expect(screen.getByRole("tab", { name: "Cam 2" })).toHaveAttribute("aria-selected", "true");
});

test("Dialog có nút Đóng bên trái và hành động chính", async () => {
  const onClose = vi.fn();
  render(
    <Dialog open title="Hủy phiên" onClose={onClose} actions={<Button variant="danger">Hủy phiên</Button>}>
      Chọn lý do.
    </Dialog>,
  );

  await userEvent.click(screen.getByRole("button", { name: "Đóng" }));

  expect(onClose).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Hủy phiên" })).toBeInTheDocument();
});

test("G3-F16: Dialog không cho đóng — trình duyệt tự đóng (CloseWatcher, Esc lần 2) → mở lại, không gọi onClose", () => {
  const onClose = vi.fn();
  render(
    <Dialog open title="Tên người kiểm" onClose={onClose} dismissible={false}>
      Nhập tên.
    </Dialog>,
  );
  const dialog = screen.getByRole("dialog", { name: "Tên người kiểm" }) as HTMLDialogElement;
  // jsdom không có CloseWatcher: mô phỏng trình duyệt đóng <dialog> bỏ qua cancel.
  act(() => {
    dialog.removeAttribute("open");
    dialog.dispatchEvent(new Event("close"));
  });

  expect(dialog).toHaveAttribute("open");
  expect(onClose).not.toHaveBeenCalled();
});

test("G3-F16: Dialog cho đóng — sự kiện close của trình duyệt → onClose (state khớp DOM)", () => {
  const onClose = vi.fn();
  render(
    <Dialog open title="Hủy phiên" onClose={onClose}>
      Chọn lý do.
    </Dialog>,
  );
  act(() => {
    screen.getByRole("dialog", { name: "Hủy phiên" }).dispatchEvent(new Event("close"));
  });

  expect(onClose).toHaveBeenCalledOnce();
});

test("Pagination khóa nút ở trang đầu / cuối", () => {
  render(<Pagination page={1} pageSize={20} total={45} onPage={() => {}} />);

  expect(screen.getByText("Trang 1 / 3")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Trước" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Sau" })).toBeEnabled();
});

test("EmptyState hiện tiêu đề và một hành động", () => {
  render(<EmptyState icon="inbox" title="Chưa có station nào." action={<Button>Thêm station</Button>} />);

  expect(screen.getByText("Chưa có station nào.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Thêm station" })).toBeInTheDocument();
});

test("TrackingNumber copy mã", async () => {
  const user = userEvent.setup();
  render(<TrackingNumber value="SPXVN0123456789" />);

  await user.click(screen.getByRole("button", { name: "Copy SPXVN0123456789" }));

  expect(await navigator.clipboard.readText()).toBe("SPXVN0123456789");
  expect(screen.getByRole("button", { name: "Đã copy" })).toBeInTheDocument();
});

test("TrackingNumber trên station không có nút copy", () => {
  render(<TrackingNumber value="SPXVN0123456789" size="display" copy={false} />);

  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getByText("SPXVN0123456789")).toHaveClass("font-mono", "text-display-md");
});

test("Skeleton ẩn với trình đọc màn hình", () => {
  const { container } = render(<Skeleton lines={3} />);

  expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  expect(container.querySelectorAll(".md-skeleton")).toHaveLength(3);
});

test("Toast tự ẩn sau 4 giây", () => {
  vi.useFakeTimers();
  try {
    render(<Toaster />);
    act(() => toast("Đã lưu."));
    expect(screen.getByText("Đã lưu.")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(TOAST_MS));

    expect(screen.queryByText("Đã lưu.")).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
    useToastStore.setState({ items: [] });
  }
});
