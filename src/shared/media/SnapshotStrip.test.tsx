/** SnapshotStrip: ảnh lỗi → xin URL mới một lần, lỗi nữa → "Không tải được ảnh" + Thử lại (G3-F24, C-11). */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SnapshotStrip, type StripSnapshot } from "./SnapshotStrip";

const snap = (url: string | null, status: "READY" | "DELETED" = "READY"): StripSnapshot => ({
  id: "s1",
  kind: "MANUAL",
  taken_at: "2026-10-01T03:00:00Z",
  url,
  status,
});

const img = () => document.querySelector("img")!;

test("lỗi lần 1 → onExpired + thử lại; lỗi lần 2 → Không tải được ảnh; Thử lại → tải lại", async () => {
  const onExpired = vi.fn();
  render(<SnapshotStrip snapshots={[snap("/a.jpg")]} onExpired={onExpired} />);

  fireEvent.error(img());
  expect(onExpired).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Ảnh 1" })).toBeInTheDocument();

  fireEvent.error(img());
  expect(screen.getByRole("group", { name: "Ảnh 1: Không tải được ảnh" })).toBeInTheDocument();
  expect(onExpired).toHaveBeenCalledOnce();

  await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
  expect(onExpired).toHaveBeenCalledTimes(2);
  fireEvent.load(img());
  expect(screen.getByRole("button", { name: "Ảnh 1" })).toBeEnabled();
});

test("không có onExpired: lỗi 1 lần → Không tải được ảnh", () => {
  render(<SnapshotStrip snapshots={[snap("/a.jpg")]} />);
  fireEvent.error(img());
  expect(screen.getByText("Không tải được ảnh")).toBeInTheDocument();
});

test("URL mới sau khi lỗi → tải lại; URL mới cũng lỗi → Không tải được ảnh (không gọi onExpired lặp)", () => {
  const onExpired = vi.fn();
  const { rerender } = render(<SnapshotStrip snapshots={[snap("/a.jpg")]} onExpired={onExpired} />);
  fireEvent.error(img());
  fireEvent.error(img());
  expect(screen.getByText("Không tải được ảnh")).toBeInTheDocument();

  rerender(<SnapshotStrip snapshots={[snap("/b.jpg")]} onExpired={onExpired} />);
  expect(img()).toHaveAttribute("src", "/b.jpg");
  fireEvent.error(img());
  expect(screen.getByText("Không tải được ảnh")).toBeInTheDocument();
  expect(onExpired).toHaveBeenCalledOnce();
});

test("ảnh đã xóa → ô khóa 'Ảnh đã bị xóa'", () => {
  render(<SnapshotStrip snapshots={[snap(null, "DELETED")]} />);
  expect(screen.getByRole("button", { name: "Ảnh 1: Ảnh đã bị xóa" })).toBeDisabled();
});
