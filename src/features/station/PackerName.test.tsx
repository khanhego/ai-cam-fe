/**
 * Item 03 T-232 (FR-03.16, 01 §10.4 S1 + R5, DEC-481): tên người đóng gói ở thanh trạng thái, R5 "Người đóng gói",
 * quét khi Admin bắt buộc tên → overlay vàng + R5. MSW `StationSim` (02b-station §12).
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { login } from "@/lib/api/auth";
import { stationSim } from "@/mocks/stationSim";
import { renderApp } from "@/test/render";
import { hidScan } from "@/test/scan";

import { OperatorDialog } from "./returns/OperatorDialog";
import { sound } from "./sound";
import { resetStationStore } from "./stationStore";

const play = vi.spyOn(sound, "play").mockImplementation(() => {});
vi.spyOn(sound, "stop").mockImplementation(() => {});

beforeEach(async () => {
  resetStationStore();
  play.mockClear();
  await login("tst_station01", "matkhau123", "STATION");
});

test("OperatorDialog: tiêu đề + nhãn theo chế độ (PACK / RETURN)", () => {
  const props = { open: true, required: false, current: null, onSubmit: async () => null, onClose: () => {} };
  const { unmount } = render(<OperatorDialog {...props} mode="PACK" />);
  expect(screen.getByRole("dialog", { name: "Người đóng gói" })).toBeInTheDocument();
  expect(screen.getByLabelText("Tên người đóng gói")).toBeInTheDocument();
  unmount();
  render(<OperatorDialog {...props} mode="RETURN" />);
  expect(screen.getByRole("dialog", { name: "Người kiểm" })).toBeInTheDocument();
  expect(screen.getByLabelText("Tên người kiểm")).toBeInTheDocument();
});

test("S1 chưa có tên (không bắt buộc): chữ xám + Nhập tên → R5 Người đóng gói (đóng được) → thanh trạng thái có tên", async () => {
  const user = userEvent.setup({ delay: null });
  renderApp("/station");
  expect(await screen.findByText("Chưa ghi tên người đóng gói ·")).toBeInTheDocument();
  // Không bắt buộc → R5 không tự mở lúc tải (DEC-481).
  expect(screen.queryByRole("dialog")).toBeNull();

  await user.click(screen.getByRole("button", { name: "Nhập tên người đóng gói" }));
  let dialog = await screen.findByRole("dialog", { name: "Người đóng gói" });
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(screen.queryByRole("dialog")).toBeNull();

  await user.click(screen.getByRole("button", { name: "Nhập tên người đóng gói" }));
  dialog = await screen.findByRole("dialog", { name: "Người đóng gói" });
  await user.click(within(dialog).getByRole("button", { name: "Bắt đầu ca" }));
  expect(await within(dialog).findByText("Nhập tên người đóng gói.")).toBeInTheDocument();
  await user.type(within(dialog).getByLabelText("Tên người đóng gói"), "M");
  await user.click(within(dialog).getByRole("button", { name: "Bắt đầu ca" }));
  expect(await within(dialog).findByText("Tên người đóng gói 2–40 ký tự.")).toBeInTheDocument();
  await user.type(within(dialog).getByLabelText("Tên người đóng gói"), "inh");
  await user.click(within(dialog).getByRole("button", { name: "Bắt đầu ca" }));

  expect(await screen.findByText("Người đóng gói: Minh")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(stationSim.operatorName).toBe("Minh");
});

test("Đổi người đóng gói khóa khi đang có phiên (S2)", async () => {
  stationSim.operatorName = "Minh";
  renderApp("/station");
  const change = await screen.findByRole("button", { name: "Đổi người đóng gói" });
  expect(change).toBeEnabled();
  await hidScan("SPXTST0000001");
  expect(await screen.findByText("ĐANG ĐÓNG GÓI")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Đổi người đóng gói" })).toBeDisabled();
  expect(screen.getByText("Người đóng gói: Minh")).toBeInTheDocument();
});

test("AC: bắt buộc tên → quét → overlay vàng + 2 bíp + R5 → nhập tên → quét lại mở S2", async () => {
  stationSim.operatorRequired = true;
  const user = userEvent.setup({ delay: null });
  renderApp("/station");
  await screen.findByText("SẴN SÀNG");

  await hidScan("SPXTST0000001");
  expect(await screen.findByText("CHƯA CÓ NGƯỜI ĐÓNG GÓI")).toBeInTheDocument();
  expect(screen.getByText("Nhập tên người đóng gói trước khi đóng gói.")).toBeInTheDocument();
  expect(play).toHaveBeenCalledWith("warn");
  const dialog = await screen.findByRole("dialog", { name: "Người đóng gói" });
  expect(stationSim.state().session).toBeNull();

  await user.type(within(dialog).getByLabelText("Tên người đóng gói"), "Minh");
  await user.click(within(dialog).getByRole("button", { name: "Bắt đầu ca" }));
  expect(await screen.findByText("Người đóng gói: Minh")).toBeInTheDocument();
  expect(screen.queryByText("CHƯA CÓ NGƯỜI ĐÓNG GÓI")).toBeNull();
  expect(screen.getByText("SẴN SÀNG")).toBeInTheDocument();

  await hidScan("SPXTST0000001");
  expect(await screen.findByText("ĐANG ĐÓNG GÓI")).toBeInTheDocument();
});

test("bắt buộc tên: đóng R5 không nhập → overlay đóng, về S1", async () => {
  stationSim.operatorRequired = true;
  renderApp("/station");
  await screen.findByText("SẴN SÀNG");
  await hidScan("SPXTST0000001");
  const dialog = await screen.findByRole("dialog", { name: "Người đóng gói" });
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByText("CHƯA CÓ NGƯỜI ĐÓNG GÓI")).toBeNull();
  expect(screen.getByText("SẴN SÀNG")).toBeInTheDocument();
});
