/**
 * Item 03 T-233 (01 §10.4 S2 / S4 / R2, 02b-station §3 / §8 / §13): chip sàn · shop, kiện gộp, yêu cầu hủy (S4 vàng +
 * banner khi đang đóng), chip ở R2. MSW `StationSim` (DEC-549).
 */
import { act, render, screen, within } from "@testing-library/react";

import { login } from "@/lib/api/auth";
import type { ScanAlert } from "@/lib/api/station";
import { stationJobs } from "@/mocks/handlers/station";
import { stationSim } from "@/mocks/stationSim";
import { renderApp } from "@/test/render";
import { hidScan } from "@/test/scan";

import { AlertOverlay } from "./AlertOverlay";
import { MergedOrdersBanner } from "./MergedOrdersBanner";
import { sound } from "./sound";
import { resetStationStore, useStationStore } from "./stationStore";

const play = vi.spyOn(sound, "play").mockImplementation(() => {});
vi.spyOn(sound, "stop").mockImplementation(() => {});

beforeEach(async () => {
  resetStationStore();
  play.mockClear();
  await login("tst_station01", "matkhau123", "STATION");
});

async function s2(code: string) {
  renderApp("/station");
  await screen.findByText("SẴN SÀNG");
  await hidScan(code);
  await screen.findByText("ĐANG ĐÓNG GÓI");
}

test("MergedOrdersBanner: < 2 đơn không hiện; 2 đơn 'cả hai'; > 3 đơn 3 mã + 'và n đơn khác', 'tất cả'", () => {
  const { container, rerender } = render(<MergedOrdersBanner orders={["5761TT0000000771"]} />);
  expect(container).toBeEmptyDOMElement();
  rerender(<MergedOrdersBanner orders={["5761TT0000000123", "5761TT0000000456"]} />);
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Kiện gộp 2 đơn: …0123, …0456 — kiểm đủ hàng của cả hai",
  );
  rerender(<MergedOrdersBanner orders={["A0001", "A0002", "A0003", "A0004"]} />);
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Kiện gộp 4 đơn: …0001, …0002, …0003 và 1 đơn khác — kiểm đủ hàng của tất cả",
  );
});

test("AlertOverlay: ORDER_CANCEL_REQUESTED / RETURN_MULTIPLE_ORDERS thiếu message → chữ dự phòng 01 §10.4", () => {
  const props = { code: "X", onRequestRepack: () => {} };
  const alert = (code: ScanAlert["code"]): ScanAlert => ({ code, message: "", data: {} });
  const { rerender } = render(<AlertOverlay {...props} alert={alert("ORDER_CANCEL_REQUESTED")} />);
  expect(screen.getByText("ĐƠN ĐANG YÊU CẦU HỦY")).toBeInTheDocument();
  expect(
    screen.getByText("Người mua đang xin hủy đơn này. Chờ xử lý trên sàn, chưa đóng gói."),
  ).toBeInTheDocument();
  rerender(<AlertOverlay {...props} alert={alert("RETURN_MULTIPLE_ORDERS")} />);
  expect(screen.getByText("MÃ CÓ Ở NHIỀU ĐƠN")).toBeInTheDocument();
  expect(
    screen.getByText("Mã này có ở nhiều đơn của các shop khác nhau. Chọn đúng đơn."),
  ).toBeInTheDocument();
});

test("FR-05.22 / EX-T3: S2 kiện gộp TikTok → chip 'TikTok · shop', banner vàng, mỗi dòng '(đơn …xxxx)'", async () => {
  await s2("TTTST0000000077");

  const chip = screen.getByRole("img", { name: "Sàn: TikTok Shop, shop TST TikTok A (mock)" });
  expect(chip).toHaveTextContent("TikTok · TST TikTok A (mock)");
  expect(screen.getByText("Kiện gộp 2 đơn: …0771, …0772 — kiểm đủ hàng của cả hai")).toBeInTheDocument();
  expect(screen.getByText("(đơn …0771)")).toBeInTheDocument();
  expect(screen.getByText("(đơn …0772)")).toBeInTheDocument();
  expect(screen.getByText("5761TT0000000771")).toBeInTheDocument();
  // Không còn chữ cứng "Shopee" ở hàng mã đơn.
  expect(screen.queryByText(/^Shopee$/)).not.toBeInTheDocument();
});

test("FR-03.03: S2 Shopee một đơn → chip 'Shopee · TST Shop A', không banner gộp, không '(đơn …)'", async () => {
  await s2("SPXTST0000001");

  expect(screen.getByRole("img", { name: "Sàn: Shopee, shop TST Shop A" })).toHaveTextContent(
    "Shopee · TST Shop A",
  );
  expect(screen.queryByText(/Kiện gộp/)).not.toBeInTheDocument();
  expect(screen.queryByText(/\(đơn …/)).not.toBeInTheDocument();
});

test("S2 kiện chưa xác minh (không có trên sàn) → chip 'Chưa rõ sàn'", async () => {
  await s2("SPXTST0000099");
  expect(screen.getByRole("img", { name: "Chưa rõ sàn" })).toHaveTextContent("Chưa rõ sàn");
});

test("FR-05.17 / EX-T4: S4 ORDER_CANCEL_REQUESTED → overlay vàng, 2 bíp, không mở phiên", async () => {
  renderApp("/station");
  await screen.findByText("SẴN SÀNG");
  await hidScan("TTTST0000000050");

  expect(await screen.findByText("ĐƠN ĐANG YÊU CẦU HỦY")).toBeInTheDocument();
  expect(play).toHaveBeenLastCalledWith("warn");
  expect(stationSim.session).toBeNull();
  expect(screen.queryByText("ĐANG ĐÓNG GÓI")).not.toBeInTheDocument();
});

test("BR-21 làm rõ: đơn chuyển yêu cầu hủy khi đang đóng → banner vàng + 2 bíp một lần; quét lại vẫn đóng được", async () => {
  await s2("TTTST0000000013");
  expect(screen.queryByText(/Người mua đang xin hủy đơn này/)).not.toBeInTheDocument();
  play.mockClear();

  await act(async () => {
    expect(stationJobs.orderCancelRequested("TTTST0000000013")).toBe(true);
    await useStationStore.getState().load();
  });

  const banner = await screen.findByText(
    "⚠ Người mua đang xin hủy đơn này. Đóng gói xong để riêng, chưa bàn giao.",
  );
  expect(banner.closest("[role=alert]")).not.toBeNull();
  expect(play.mock.calls.filter(([k]) => k === "warn")).toHaveLength(1);

  // Tải lại state (WS / API-10) không bíp lại.
  await act(async () => {
    await useStationStore.getState().load();
  });
  expect(play.mock.calls.filter(([k]) => k === "warn")).toHaveLength(1);

  await hidScan("TTTST0000000013");
  expect(await screen.findByText("SẴN SÀNG")).toBeInTheDocument();
});

test("R2: chip sàn · shop cạnh mã kiện", async () => {
  stationSim.workMode = "RETURN";
  stationSim.operatorName = "Lan QA";
  renderApp("/station");
  await screen.findByText("SẴN SÀNG NHẬN HÀNG HOÀN");
  await hidScan("SPXRTTST000041");
  await screen.findByText("ĐANG KIỂM HÀNG HOÀN");

  const chip = screen.getByRole("img", { name: /^Sàn: Shopee, shop / });
  expect(within(chip).getByText(/^Shopee · /)).toBeInTheDocument();
});
