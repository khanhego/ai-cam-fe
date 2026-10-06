/** Component R2 / R4 / thông báo sau đóng (02b-station §13 component; AC-29, BR-22). */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ClosedSession, ScanAlert } from "@/lib/api/station";
import { RETURN_ALERT_CODES } from "@/lib/api/station";
import type { InspectionLine } from "@/shared/returns/types";

import { AlertOverlay } from "../AlertOverlay";
import { ClosedNotice } from "../ClosedNotice";
import { COPY } from "../copy";
import { InspectionTable } from "./InspectionTable";

const line = (q: number): InspectionLine => ({
  order_item_id: "oi-1",
  product_name: "Áo",
  variation: null,
  image_url: null,
  quantity_sent: 2,
  quantity_requested: 2,
  quantity_received: q,
  condition: "OK",
  note: null,
});

test("InspectionTable: stepper khóa − ở 0 và + ở 999; + gửi giá trị mới", async () => {
  const onChange = vi.fn();
  const { rerender } = render(
    <InspectionTable lines={[line(0)]} mode="FULL" packageCount={1} errors={{}} onChange={onChange} />,
  );
  expect(screen.getByRole("button", { name: "Giảm số nhận Áo" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Tăng số nhận Áo" }));
  expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ quantity_received: 1 })]);

  rerender(
    <InspectionTable lines={[line(999)]} mode="FULL" packageCount={1} errors={{}} onChange={onChange} />,
  );
  expect(screen.getByRole("button", { name: "Tăng số nhận Áo" })).toBeDisabled();
});

test("InspectionTable: lỗi server theo dòng hiện dưới stepper; dòng yêu cầu trả 0 có '(không trả)'", () => {
  render(
    <InspectionTable
      lines={[{ ...line(1), quantity_requested: 0 }]}
      mode="FULL"
      packageCount={1}
      errors={{ "lines.0.quantity_received": "Số nhận 0–999" }}
      onChange={() => {}}
    />,
  );
  expect(screen.getByText("Số nhận 0–999")).toBeInTheDocument();
  expect(screen.getByText("(không trả)")).toBeInTheDocument();
});

test.each(RETURN_ALERT_CODES.filter((c) => !["INSPECTION_REQUIRED", "RETURN_CODE_DIFFERENT"].includes(c)))(
  "AlertOverlay R4 %s: tiêu đề theo 01 §10.4 + message server",
  (code) => {
    const alert: ScanAlert = { code, message: `msg ${code}`, data: { code: "SPXVN0000000000" } };
    render(<AlertOverlay alert={alert} code="SPXVN0000000000" onRequestRepack={() => {}} />);
    expect(screen.getByRole("heading", { name: COPY.alert[code] })).toBeInTheDocument();
    expect(screen.getByText(`msg ${code}`)).toBeInTheDocument();
  },
);

test("AlertOverlay RETURN_ALREADY_RECEIVED: nút kiện khác chỉ khi can_record_other", () => {
  const base: ScanAlert = { code: "RETURN_ALREADY_RECEIVED", message: "m", data: {} };
  const { rerender } = render(<AlertOverlay alert={base} code="X1234567" onRequestRepack={() => {}} />);
  expect(screen.queryByRole("button", { name: /kiện khác/ })).toBeNull();
  rerender(
    <AlertOverlay
      alert={{ ...base, data: { can_record_other: true } }}
      code="X1234567"
      onRequestRepack={() => {}}
    />,
  );
  expect(screen.getByRole("button", { name: /Đây là kiện khác — vẫn ghi hình/ })).toBeInTheDocument();
});

const closed = (over: Partial<ClosedSession>): ClosedSession => ({
  id: "s",
  type: "PACK",
  tracking_number: "SPXTST0000001",
  flags: [],
  conclusion: null,
  claim_code: null,
  package_status: "PACKED",
  ...over,
});

test.each<[string, Partial<ClosedSession>, RegExp | null]>([
  ["PACK không cờ → không báo", {}, null],
  ["PACK LABEL_ON_TRAY", { flags: ["LABEL_ON_TRAY"] }, /^Phiếu SPXTST0000001 vẫn còn trên khay/],
  [
    "PACK CAM2_UNVERIFIED",
    { flags: ["CAM2_UNVERIFIED"] },
    /^Cam 2 không xác minh được phiếu của SPXTST0000001/,
  ],
  ["RETURN OK", { type: "RETURN", conclusion: "OK" }, /^Đã nhận SPXTST0000001 — Nguyên vẹn\.$/],
  [
    "RETURN có vấn đề + KN",
    { type: "RETURN", conclusion: "DAMAGED", claim_code: "KN-000124" },
    /Hư hỏng\. Đã tạo hồ sơ khiếu nại KN-000124\.$/,
  ],
  ["RETURN có vấn đề, KN chưa có (BE M7)", { type: "RETURN", conclusion: "DAMAGED" }, /— Hư hỏng\.$/],
  [
    "RETURN tự hoàn tất",
    { type: "RETURN", conclusion: "EMPTY_BOX", flags: ["AUTO_CLOSED"] },
    /tự hoàn tất do quá 45 phút \(kết luận: Hộp rỗng\)/,
  ],
])("ClosedNotice: %s", (_name, over, text) => {
  const { container } = render(<ClosedNotice closed={closed(over)} onDismiss={() => {}} />);
  if (text) expect(screen.getByText(text)).toBeInTheDocument();
  else expect(container).toBeEmptyDOMElement();
});
