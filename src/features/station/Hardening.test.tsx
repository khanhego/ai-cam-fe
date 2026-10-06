/** Hardening Phase 1 ở station (T-136): S3 chữ mới (FR-03.13), S1 thông báo cờ (FR-03.14), S2 đơn hủy (FR-03.15). */
import { act, screen } from "@testing-library/react";

import { login } from "@/lib/api/auth";
import { stationJobs } from "@/mocks/handlers/station";
import { stationSim } from "@/mocks/stationSim";
import { renderApp } from "@/test/render";
import { hidScan } from "@/test/scan";

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

test("TC-03.70: S3 nguồn quét — hai tình huống, không có câu 'dán đúng phiếu' của kiện đang đóng", async () => {
  await s2("SPXTST0000012");

  await hidScan("SPXTST0000013");

  expect(await screen.findByText("LỆCH MÃ — DỪNG LẠI, CHƯA DÁN PHIẾU")).toBeInTheDocument();
  expect(screen.getByText("1. Kiện SPXTST0000012 đã đóng xong mà quên quét?")).toBeInTheDocument();
  expect(screen.getByText("→ Quét mã trên chính kiện SPXTST0000012 để hoàn tất.")).toBeInTheDocument();
  expect(screen.getByText("Phiếu SPXTST0000013 là của kiện sau: để riêng, chưa dán.")).toBeInTheDocument();
  expect(screen.getByText("2. Vừa dán nhầm phiếu SPXTST0000013 lên kiện này?")).toBeInTheDocument();
  expect(
    screen.getByText("→ Gỡ phiếu SPXTST0000013, dán phiếu SPXTST0000012, quét lại mã."),
  ).toBeInTheDocument();
  expect(screen.queryByText(/dán đúng phiếu/)).toBeNull();
});

test("TC-03.71: S3 nguồn Cam 2 — chỉ bảo bỏ phiếu lạ khỏi khay", async () => {
  await s2("SPXTST0000012");
  stationSim.tray = ["SPXTST0000020"];

  await hidScan("SPXTST0000012");

  expect(
    await screen.findByText("Bỏ phiếu SPXTST0000020 khỏi khay. Phiếu này không thuộc kiện đang đóng."),
  ).toBeInTheDocument();
  expect(screen.getByText("Cam 2 thấy trên khay")).toBeInTheDocument();
  expect(screen.queryByText(/dán/)).toBeNull();
});

test("TC-03.72: đóng khi khay còn phiếu của kiện → S1 Alert Phiếu … vẫn còn trên khay", async () => {
  await s2("SPXTST0000003");
  stationSim.tray = ["SPXTST0000003"];

  await hidScan("SPXTST0000003");

  expect(
    await screen.findByText(
      "Phiếu SPXTST0000003 vẫn còn trên khay. Kiểm tra kiện vừa đóng đã dán phiếu chưa.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByText("SẴN SÀNG")).toBeInTheDocument();
});

test("TC-03.73: Cam 2 không xác minh → S1 Alert; lần quét kế làm ẩn", async () => {
  await s2("SPXTST0000004");

  await hidScan("SPXTST0000004");

  const text = "Cam 2 không xác minh được phiếu của SPXTST0000004. Kiểm tra phiếu trên kiện trước khi giao.";
  expect(await screen.findByText(text)).toBeInTheDocument();
  await hidScan("SPXTST0000005");
  await screen.findByText("ĐANG ĐÓNG GÓI");
  expect(screen.queryByText(text)).toBeNull();
});

test("TC-03.75: đơn hủy khi đang đóng → banner đỏ + âm lỗi 1 lần; quét đóng vẫn được (CANCELLED_AFTER_PACK)", async () => {
  await s2("SPXTST0000006");

  const alert = stationJobs.orderCancelled()!;
  await act(async () => {
    useStationStore.getState().onServerAlert(alert);
    await useStationStore.getState().load();
  });

  expect(
    await screen.findByText(
      "ĐƠN VỪA BỊ HỦY TRÊN SHOPEE — không gửi kiện này. Bấm Hủy phiên, để hàng lại kệ.",
    ),
  ).toBeInTheDocument();
  expect(play).toHaveBeenCalledWith("error");
  expect(play).not.toHaveBeenCalledWith("error", { loop: true });

  await hidScan("SPXTST0000006");
  expect(await screen.findByText("SẴN SÀNG")).toBeInTheDocument();
  expect(useStationStore.getState().closedNotice?.package_status).toBe("CANCELLED_AFTER_PACK");
});
