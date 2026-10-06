/** `InspectionView` (02b-admin §13 component): REFERENCE → "Chỉ tham khảo", cờ Tự đóng, lịch sử sửa kết luận (DEC-261). */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { PackageSession } from "@/lib/api/packages";

import { InspectionView } from "./InspectionView";

const session = (patch: Partial<PackageSession> = {}): PackageSession => ({
  id: "s-1",
  status: "COMPLETED",
  station_name: "Station 03",
  started_at: "2026-10-05T02:00:00Z",
  ended_at: "2026-10-05T02:14:00Z",
  duration_s: 840,
  flags: ["AUTO_CLOSED", "INSPECTION_CORRECTED"],
  cancel_reason: null,
  note: null,
  clips: [],
  type: "RETURN",
  operator_name: "Lan",
  return_case_id: null,
  can_correct: false,
  snapshots: [],
  pack_snapshot: null,
  protected_by_claims: [],
  inspection: {
    conclusion: "DAMAGED",
    note: "Rách tay áo",
    saved_at: null,
    lines_mode: "REFERENCE",
    lines: [
      {
        order_item_id: "oi-1",
        product_name: "Áo thun",
        variation: "Đen / L",
        image_url: null,
        quantity_sent: 2,
        quantity_requested: 2,
        quantity_received: 2,
        condition: "DAMAGED",
        note: null,
      },
    ],
    corrections: [
      {
        at: "2026-10-05T03:00:00Z",
        by: { id: "u-sup", display_name: "Nguyễn B" },
        reason: "Người kiểm chọn nhầm",
        before: { conclusion: "OK", note: "", lines: [] },
      },
    ],
  },
  ...patch,
});

test("kết luận, người kiểm, Tự đóng, Chỉ tham khảo, bảng dòng chỉ đọc, ghi chú; 'Đã sửa 1 lần' mở lịch sử", async () => {
  const user = userEvent.setup();
  render(<InspectionView session={session()} />);

  expect(screen.getAllByText("Hư hỏng")).toHaveLength(2);
  expect(screen.getByText(/Người kiểm Lan/)).toBeInTheDocument();
  expect(screen.getByText("Tự đóng")).toBeInTheDocument();
  expect(screen.getByText("Chỉ tham khảo")).toBeInTheDocument();
  const row = within(screen.getByRole("table")).getAllByRole("row")[1]!;
  expect(row).toHaveTextContent("Áo thun · Đen / L22Hư hỏng");
  expect(screen.getByText("Ghi chú: “Rách tay áo”")).toBeInTheDocument();

  const toggle = screen.getByRole("button", { name: "Đã sửa 1 lần" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  await user.click(toggle);
  const history = screen.getByRole("list", { name: "Lịch sử sửa kết luận" });
  expect(history).toHaveTextContent("Nguyễn B");
  expect(history).toHaveTextContent("Lý do: “Người kiểm chọn nhầm”");
  expect(history).toHaveTextContent("Kết luận trước: Nguyên vẹn");
});

test("phiên chưa có kết quả kiểm → không hiện gì; chưa sửa → không có nút lịch sử", () => {
  const { container, rerender } = render(<InspectionView session={session({ inspection: null })} />);
  expect(container).toBeEmptyDOMElement();
  rerender(
    <InspectionView
      session={session({ flags: [], inspection: { ...session().inspection!, corrections: [] } })}
    />,
  );
  expect(screen.queryByRole("button", { name: /Đã sửa/ })).not.toBeInTheDocument();
});
