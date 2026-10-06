/**
 * R2 Đang kiểm hàng hoàn với MSW (02b-station §13 integration; TC-04.04, 04.15, 04.18..04.21, 04.24, 04.26, 04.27,
 * 04.47). Gõ vào ô bằng `paste` (gõ không độ trễ bị coi là máy quét — captureInInputs).
 */
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { login } from "@/lib/api/auth";
import { stationJobs } from "@/mocks/handlers/station";
import { stationSim } from "@/mocks/stationSim";
import { renderApp } from "@/test/render";
import { hidScan } from "@/test/scan";
import { server } from "@/test/server";

import { sound } from "../sound";
import { resetStationStore, useStationStore } from "../stationStore";

const play = vi.spyOn(sound, "play").mockImplementation(() => {});
vi.spyOn(sound, "stop").mockImplementation(() => {});

beforeEach(async () => {
  resetStationStore();
  play.mockClear();
  await login("tst_station01", "matkhau123", "STATION");
  stationSim.workMode = "RETURN";
  stationSim.operatorName = "Lan QA";
});

async function openR2(code = "SPXRTTST000041") {
  renderApp("/station");
  await screen.findByText("SẴN SÀNG NHẬN HÀNG HOÀN");
  await hidScan(code);
  await screen.findByText("ĐANG KIỂM HÀNG HOÀN");
}

const radio = (name: string) => screen.getByRole("radio", { name: new RegExp(name) });

test("TC-04.04: quét mã chiều về → R2 đủ thông tin hồ sơ + bảng dòng", async () => {
  await openR2();

  expect(screen.getByText("SPXRTTST000041")).toBeInTheDocument();
  expect(screen.getByText("Khách trả hàng")).toBeInTheDocument();
  expect(screen.getByText("Đơn 2410TST00041")).toBeInTheDocument();
  expect(screen.getByText("Mã gốc SPXTST0000041")).toBeInTheDocument();
  expect(screen.getByText("Lý do của khách: Hàng bị hư · Áo bị rách ở tay")).toBeInTheDocument();
  const row = screen.getByText("Áo thun basic").closest("tr")!;
  expect(within(row).getAllByText("2")).toHaveLength(3); // gửi, yêu cầu trả, nhận
  expect(within(row).getByRole("combobox")).toHaveValue("OK");
  expect(screen.getByText("Chọn kết luận rồi QUÉT LẠI MÃ để hoàn tất")).toBeInTheDocument();
  expect(play).toHaveBeenLastCalledWith("ok");
});

test("TC-04.15: giảm số nhận → Nguyên vẹn khóa; chọn Thiếu hàng → Đã lưu (API-102)", async () => {
  const user = userEvent.setup({ delay: null });
  await openR2();

  await user.click(screen.getByRole("button", { name: /Giảm số nhận Áo thun basic/ }));

  expect(radio("Nguyên vẹn")).toBeDisabled();
  expect(radio("Nguyên vẹn")).toHaveAttribute("title", "Có dòng thiếu / hỏng — chọn vấn đề.");
  await user.click(radio("Thiếu hàng"));
  expect(radio("Thiếu hàng")).toHaveAttribute("aria-checked", "true");
  expect(await screen.findByText("Đã lưu")).toBeInTheDocument();
  expect(stationSim.session?.inspection).toMatchObject({
    conclusion: "MISSING_ITEM",
    lines: [expect.objectContaining({ quantity_received: 1 })],
  });
});

test("đang chọn Nguyên vẹn mà dòng đổi sang hư hỏng → bỏ chọn + chữ hướng dẫn", async () => {
  const user = userEvent.setup({ delay: null });
  await openR2();
  await user.click(radio("Nguyên vẹn"));

  await user.selectOptions(screen.getByRole("combobox", { name: /Tình trạng Áo thun basic/ }), "DAMAGED");

  expect(radio("Nguyên vẹn")).toHaveAttribute("aria-checked", "false");
  expect(screen.getByText("Có dòng thiếu / hỏng — chọn vấn đề.")).toBeInTheDocument();
});

test("TC-04.18: quét đóng khi chưa kết luận → viền đỏ + chữ tại chỗ, âm lỗi 1 lần, phiên vẫn mở", async () => {
  await openR2();

  await hidScan("SPXRTTST000041");

  expect(await screen.findByText("Chọn kết luận trước khi quét đóng.")).toBeInTheDocument();
  expect(screen.getByText("ĐANG KIỂM HÀNG HOÀN")).toBeInTheDocument();
  expect(play).toHaveBeenLastCalledWith("error");
  expect(radio("Nguyên vẹn")).toHaveFocus();
});

test("TC-04.20: quét mã không thuộc hồ sơ → Alert vàng tại R2", async () => {
  await openR2();

  await hidScan("SPXTST0000042");

  expect(
    await screen.findByText(
      "Mã SPXTST0000042 không thuộc kiện đang kiểm. Quét lại mã trên kiện này để hoàn tất.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByText("ĐANG KIỂM HÀNG HOÀN")).toBeInTheDocument();
});

test("TC-04.19: Nguyên vẹn rồi quét mã gốc cùng hồ sơ ngay (chờ lưu nháp) → R1 + Đã nhận … — Nguyên vẹn.", async () => {
  const user = userEvent.setup({ delay: null });
  await openR2();
  await user.click(radio("Nguyên vẹn"));

  await hidScan("SPXTST0000041");

  expect(await screen.findByText("SẴN SÀNG NHẬN HÀNG HOÀN")).toBeInTheDocument();
  expect(screen.getByText("Đã nhận SPXRTTST000041 — Nguyên vẹn.")).toBeInTheDocument();
  expect(screen.getByText("Hôm nay: 1 kiện hoàn · 0 có vấn đề")).toBeInTheDocument();
});

test("TC-04.21 + TC-04.47: Hộp rỗng + ghi chú, quét khi focus ô ghi chú → ô không lọt chữ, đóng, có mã KN", async () => {
  const user = userEvent.setup({ delay: null });
  await openR2();
  await user.click(screen.getByRole("button", { name: /Giảm số nhận Áo thun basic/ }));
  await user.click(screen.getByRole("button", { name: /Giảm số nhận Áo thun basic/ }));
  await user.click(radio("Hộp rỗng"));
  const note = screen.getByLabelText("Ghi chú");
  await user.click(note);
  await user.paste("Hộp nguyên băng keo");

  await hidScan("SPXRTTST000041");

  expect(await screen.findByText("SẴN SÀNG NHẬN HÀNG HOÀN")).toBeInTheDocument();
  expect(
    screen.getByText(/^Đã nhận SPXRTTST000041 — Hộp rỗng\. Đã tạo hồ sơ khiếu nại KN-\d{6}\.$/),
  ).toBeInTheDocument();
  const closed = stationSim.recent[0]!;
  expect(closed).toMatchObject({ type: "RETURN", conclusion: "EMPTY_BOX" });
  expect(await screen.findByText(closed.claim_code!)).toBeInTheDocument(); // Phiên gần đây R1
});

test("Khác bắt buộc ghi chú: chưa có ghi chú → báo tại ô, không gửi; có ghi chú → lưu", async () => {
  const user = userEvent.setup({ delay: null });
  let puts = 0;
  server.events.on("request:start", ({ request }) => {
    if (request.method === "PUT" && request.url.includes("/inspection")) puts += 1;
  });
  await openR2();

  await user.click(radio("Khác"));
  expect(await screen.findByText("Nhập ghi chú khi chọn Khác.")).toBeInTheDocument();
  expect(puts).toBe(0);

  await user.click(screen.getByLabelText("Ghi chú"));
  await user.paste("Hộp móp");
  expect(await screen.findByText("Đã lưu")).toBeInTheDocument();
  expect(stationSim.session?.inspection).toMatchObject({ conclusion: "OTHER", note: "Hộp móp" });
  server.events.removeAllListeners();
});

test("API-102 lỗi mạng (sau 2 lần thử lại) → Chưa lưu được — thử lại; bấm → lưu được", async () => {
  const user = userEvent.setup({ delay: null });
  await openR2();
  server.use(http.put("/api/v1/station/sessions/:id/inspection", () => HttpResponse.error()));

  await user.click(radio("Hư hỏng"));
  const retry = await screen.findByRole("button", { name: /Chưa lưu được — thử lại/ });
  server.resetHandlers();
  await user.click(retry);

  expect(await screen.findByText("Đã lưu")).toBeInTheDocument();
  expect(stationSim.session?.inspection?.conclusion).toBe("DAMAGED");
});

test("TC-04.24: Hủy phiên hoàn — lý do Kiện không phải hàng hoàn → R1", async () => {
  const user = userEvent.setup({ delay: null });
  await openR2();

  await user.click(screen.getByRole("button", { name: "Hủy phiên" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).queryByLabelText("Hết hàng")).toBeNull();
  await user.click(within(dialog).getByLabelText("Kiện không phải hàng hoàn"));
  await user.click(within(dialog).getByRole("button", { name: "Hủy phiên" }));

  expect(await screen.findByText("SẴN SÀNG NHẬN HÀNG HOÀN")).toBeInTheDocument();
});

test("TC-04.26 (mock J-07): WS SESSION_AUTO_CLOSED → R1 + đã tự hoàn tất do quá 45 phút", async () => {
  const user = userEvent.setup({ delay: null });
  await openR2();
  await user.click(radio("Hư hỏng"));
  await act(() => useStationStore.getState().flushDraft());

  const alert = stationJobs.expireReturnSession()!;
  await act(async () => {
    useStationStore.getState().onServerAlert(alert);
    await useStationStore.getState().load();
  });

  expect(await screen.findByText("SẴN SÀNG NHẬN HÀNG HOÀN")).toBeInTheDocument();
  expect(
    screen.getByText(/^Phiên SPXRTTST000041 đã tự hoàn tất do quá 45 phút \(kết luận: Hư hỏng\)\./),
  ).toBeInTheDocument();
});

test("TC-04.27 (mock J-07): chưa kết luận → SESSION_ABANDONED → R1 + đã tự đóng do quá 45 phút", async () => {
  await openR2();

  const alert = stationJobs.expireReturnSession()!;
  await act(async () => {
    useStationStore.getState().onServerAlert(alert);
    await useStationStore.getState().load();
  });

  expect(await screen.findByText("SẴN SÀNG NHẬN HÀNG HOÀN")).toBeInTheDocument();
  expect(
    screen.getByText("Phiên SPXRTTST000041 đã tự đóng do quá 45 phút, chưa có kết luận."),
  ).toBeInTheDocument();
});

test("Gọi quản lý từ R2 → S5 (ASSIST)", async () => {
  const user = userEvent.setup({ delay: null });
  await openR2();

  await user.click(screen.getByRole("button", { name: /Gọi quản lý/ }));

  expect(await screen.findByText("ĐANG CHỜ QUẢN LÝ DUYỆT")).toBeInTheDocument();
});

test("REFERENCE (giao thất bại đơn 2 kiện): bảng chỉ xem, Nguyên vẹn không khóa", async () => {
  await openR2("SPXTST0000043-1");

  expect(screen.getByText("Đơn có 2 kiện — chỉ chọn kết luận chung cho kiện này.")).toBeInTheDocument();
  expect(screen.queryByRole("group", { name: /Số nhận/ })).toBeNull();
  expect(radio("Nguyên vẹn")).toBeEnabled();
  await waitFor(() => expect(screen.getByText("Giao thất bại")).toBeInTheDocument());
});
