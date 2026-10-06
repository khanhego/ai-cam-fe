/**
 * Gõ vào ô ở bàn hoàn bằng `paste`: `userEvent` không độ trễ gõ nhanh như máy quét nên bị `captureInInputs` coi là
 * lần quét (đúng hành vi). R1, R5, đổi chế độ S1 ↔ R1 với MSW (02b-station §13; TC-04.01, 04.02, 04.03, 04.34, UC-14). */
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { login } from "@/lib/api/auth";
import { stationSim } from "@/mocks/stationSim";
import { renderApp } from "@/test/render";
import { hidScan } from "@/test/scan";

import { sound } from "../sound";
import { resetStationStore } from "../stationStore";

vi.spyOn(sound, "play").mockImplementation(() => {});
vi.spyOn(sound, "stop").mockImplementation(() => {});

beforeEach(async () => {
  resetStationStore();
  await login("tst_station01", "matkhau123", "STATION");
});

test("TC-04.01/02: S1 → Chuyển sang nhận hàng hoàn → R5 bắt buộc → R1 có chip chế độ + người kiểm", async () => {
  const user = userEvent.setup({ delay: null });
  renderApp("/station");
  await user.click(await screen.findByRole("button", { name: "Chuyển sang nhận hàng hoàn" }));

  const dialog = await screen.findByRole("dialog", { name: "Người kiểm hàng hoàn" });
  // Esc (sự kiện cancel của <dialog>) không đóng khi bắt buộc; không có nút "Đóng".
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(screen.getByRole("dialog", { name: "Người kiểm hàng hoàn" })).toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: "Đóng" })).toBeNull();

  await user.click(within(dialog).getByRole("button", { name: "Bắt đầu ca" }));
  expect(await within(dialog).findByText("Nhập tên người kiểm.")).toBeInTheDocument();
  await user.click(within(dialog).getByLabelText("Tên người kiểm"));
  await user.paste("L");
  await user.click(within(dialog).getByRole("button", { name: "Bắt đầu ca" }));
  expect(await within(dialog).findByText("Tên người kiểm 2–40 ký tự.")).toBeInTheDocument();

  await user.click(within(dialog).getByLabelText("Tên người kiểm"));
  await user.paste("an QA");
  await user.click(within(dialog).getByRole("button", { name: "Bắt đầu ca" }));

  expect(await screen.findByText("Người kiểm: Lan QA")).toBeInTheDocument();
  expect(screen.getByText("SẴN SÀNG NHẬN HÀNG HOÀN")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByText("Nhận hàng hoàn")).toBeInTheDocument();
  expect(screen.getByText("Hôm nay: 0 kiện hoàn · 0 có vấn đề")).toBeInTheDocument();
  expect(await screen.findByText("Chưa có kiện hoàn nào hôm nay.")).toBeInTheDocument();
  expect(stationSim.workMode).toBe("RETURN");
  expect(stationSim.operatorName).toBe("Lan QA");
});

test("R5 bắt buộc ở station Cả hai có lối Chuyển sang đóng gói", async () => {
  stationSim.workMode = "RETURN";
  const user = userEvent.setup({ delay: null });
  renderApp("/station");
  const dialog = await screen.findByRole("dialog", { name: "Người kiểm hàng hoàn" });

  await user.click(within(dialog).getByRole("button", { name: "Chuyển sang đóng gói" }));

  expect(await screen.findByText("SẴN SÀNG")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("R1: Đổi người kiểm (R5 không bắt buộc, đóng được), Chuyển sang đóng gói → S1", async () => {
  stationSim.workMode = "RETURN";
  stationSim.operatorName = "Lan";
  const user = userEvent.setup({ delay: null });
  renderApp("/station");
  await screen.findByText("SẴN SÀNG NHẬN HÀNG HOÀN");

  await user.click(screen.getByRole("button", { name: "Đổi người kiểm" }));
  const dialog = await screen.findByRole("dialog", { name: "Người kiểm hàng hoàn" });
  const field = within(dialog).getByLabelText("Tên người kiểm");
  expect(field).toHaveValue("Lan");
  await user.clear(field);
  await user.click(field);
  await user.paste("Hoa");
  await user.click(within(dialog).getByRole("button", { name: "Bắt đầu ca" }));
  expect(await screen.findByText("Người kiểm: Hoa")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).toBeNull();

  await user.click(screen.getByRole("button", { name: "Đổi người kiểm" }));
  await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Đóng" }));
  expect(screen.queryByRole("dialog")).toBeNull();

  await user.click(screen.getByRole("button", { name: "Chuyển sang đóng gói" }));
  expect(await screen.findByText("SẴN SÀNG")).toBeInTheDocument();
  expect(screen.queryByText("Nhận hàng hoàn")).toBeNull();
});

test("TC-04.34: station loại Nhận hoàn (không phải Cả hai) không có nút đổi chế độ", async () => {
  stationSim.kind = "RETURN";
  stationSim.workMode = "RETURN";
  stationSim.operatorName = "Lan";
  renderApp("/station");
  await screen.findByText("SẴN SÀNG NHẬN HÀNG HOÀN");

  expect(screen.queryByRole("button", { name: "Chuyển sang đóng gói" })).toBeNull();
});

test("TC-04.03: quét khi R5 đang mở (chưa có người kiểm) → mã không lọt vào ô, vẫn R5", async () => {
  stationSim.workMode = "RETURN";
  renderApp("/station");
  const dialog = await screen.findByRole("dialog", { name: "Người kiểm hàng hoàn" });
  const field = within(dialog).getByLabelText("Tên người kiểm");
  field.focus();

  await hidScan("SPXRTTST000041");

  expect(field).toHaveValue("");
  expect(screen.getByRole("dialog", { name: "Người kiểm hàng hoàn" })).toBeInTheDocument();
  expect(stationSim.session).toBeNull();
});

test("API-101 SESSION_ACTIVE → chữ trong Dialog", async () => {
  stationSim.workMode = "RETURN";
  stationSim.operatorName = "Lan";
  const user = userEvent.setup({ delay: null });
  renderApp("/station");
  await screen.findByText("SẴN SÀNG NHẬN HÀNG HOÀN");
  await user.click(screen.getByRole("button", { name: "Đổi người kiểm" }));
  const dialog = await screen.findByRole("dialog");
  // Phiên mở ở nơi khác (WS chưa tới): server trả SESSION_ACTIVE.
  stationSim.approval = {
    id: "a",
    type: "ASSIST",
    tracking_number: "X",
    created_at: new Date().toISOString(),
  };

  await user.click(within(dialog).getByLabelText("Tên người kiểm"));
  await user.paste("x");
  await user.click(within(dialog).getByRole("button", { name: "Bắt đầu ca" }));

  expect(await within(dialog).findByText("Đóng phiên trước khi đổi người kiểm.")).toBeInTheDocument();
});
