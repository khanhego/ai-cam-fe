/** R3 tìm thủ công, R4 cảnh báo hàng hoàn, API-105 với MSW (TC-04.08..04.13, 04.45, 04.46, 04.53). */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { login } from "@/lib/api/auth";
import { stationSim } from "@/mocks/stationSim";
import { renderApp } from "@/test/render";
import { hidScan } from "@/test/scan";
import { server } from "@/test/server";

import { sound } from "../sound";
import { resetStationStore } from "../stationStore";

const play = vi.spyOn(sound, "play").mockImplementation(() => {});
vi.spyOn(sound, "stop").mockImplementation(() => {});

beforeEach(async () => {
  resetStationStore();
  play.mockClear();
  await login("tst_station01", "matkhau123", "STATION");
  stationSim.workMode = "RETURN";
  stationSim.operatorName = "Lan QA";
});

async function r1() {
  renderApp("/station");
  await screen.findByText("SẴN SÀNG NHẬN HÀNG HOÀN");
}

test("TC-04.08 + 04.09: mã lạ → R4 KHÔNG TÌM THẤY ĐƠN (2 nút, 2 bíp) → Mở phiên chưa xác định → R2", async () => {
  const user = userEvent.setup({ delay: null });
  await r1();

  await hidScan("SPXVN0000000000");

  expect(await screen.findByText("KHÔNG TÌM THẤY ĐƠN")).toBeInTheDocument();
  expect(play).toHaveBeenLastCalledWith("warn");
  expect(screen.getByRole("button", { name: /Tìm thủ công/ })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Mở phiên chưa xác định/ }));

  expect(await screen.findByText("ĐANG KIỂM HÀNG HOÀN")).toBeInTheDocument();
  expect(screen.getByText("Chưa xác định")).toBeInTheDocument();
  expect(screen.getByText("Chưa có danh sách sản phẩm. Chọn kết luận chung.")).toBeInTheDocument();
});

test("R4 Tìm thủ công → R3 điền sẵn mã, tự tìm; không có → chữ trống + Mở phiên chưa xác định", async () => {
  const user = userEvent.setup({ delay: null });
  await r1();
  await hidScan("SPXVN0000000000");
  await user.click(await screen.findByRole("button", { name: /Tìm thủ công/ }));

  const dialog = await screen.findByRole("dialog", { name: "Tìm kiện hoàn" });
  expect(within(dialog).getByLabelText("Mã vận đơn hoặc mã đơn")).toHaveValue("SPXVN0000000000");
  expect(
    await within(dialog).findByText("Không tìm thấy. Kiểm tra lại mã hoặc Mở phiên chưa xác định."),
  ).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: /Mở phiên chưa xác định/ }));

  expect(await screen.findByText("ĐANG KIỂM HÀNG HOÀN")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("TC-04.45 + 04.46: R1 Tìm thủ công — < 4 ký tự báo lỗi; tiền tố mã đơn → Mở phiên kiện 41 → R2", async () => {
  const user = userEvent.setup({ delay: null });
  await r1();
  await user.click(screen.getByRole("button", { name: "Không quét được mã? Tìm thủ công" }));
  const dialog = await screen.findByRole("dialog", { name: "Tìm kiện hoàn" });
  const field = within(dialog).getByLabelText("Mã vận đơn hoặc mã đơn");
  expect(field).toHaveFocus();

  await user.paste("241");
  await user.click(within(dialog).getByRole("button", { name: "Tìm" }));
  expect(await within(dialog).findByText("Nhập ít nhất 4 ký tự.")).toBeInTheDocument();

  await user.click(field);
  await user.paste("0TST0004");
  await user.click(within(dialog).getByRole("button", { name: "Tìm" }));
  const row = (await within(dialog).findByText("SPXTST0000041")).closest("li")!;
  await user.click(within(row).getByRole("button", { name: "Mở phiên" }));

  expect(await screen.findByText("ĐANG KIỂM HÀNG HOÀN")).toBeInTheDocument();
  expect(screen.getByText("Mã gốc SPXTST0000041")).toBeInTheDocument();
});

test("TC-04.13: quét mã đơn nhiều kiện → R4 ĐƠN CÓ NHIỀU KIỆN rồi tự mở R3 với mã đơn", async () => {
  await r1();

  await hidScan("2410TST00043");

  expect(await screen.findByText("ĐƠN CÓ NHIỀU KIỆN")).toBeInTheDocument();
  const dialog = await screen.findByRole("dialog", { name: "Tìm kiện hoàn" }, { timeout: 4000 });
  expect(within(dialog).getByLabelText("Mã vận đơn hoặc mã đơn")).toHaveValue("2410TST00043");
  expect(await within(dialog).findByText("SPXTST0000043-1")).toBeInTheDocument();
  expect(within(dialog).getByText("SPXTST0000043-2")).toBeInTheDocument();
});

test("TC-04.10: kiện chưa gửi đi → R4 KIỆN CHƯA GỬI ĐI, không mở phiên", async () => {
  await r1();

  await hidScan("SPXTST0000010");

  expect(await screen.findByText("KIỆN CHƯA GỬI ĐI")).toBeInTheDocument();
  expect(screen.getByText(/Đây không phải hàng hoàn\./)).toBeInTheDocument();
  expect(stationSim.session).toBeNull();
});

test("TC-04.11: kiện đã nhận → Đây là kiện khác — vẫn ghi hình → ghi chú 5–200 → R2 Chưa xác định", async () => {
  const user = userEvent.setup({ delay: null });
  await r1();
  await hidScan("SPXTST0000053");
  expect(await screen.findByText("KIỆN HOÀN ĐÃ NHẬN")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /Đây là kiện khác — vẫn ghi hình/ }));
  const dialog = await screen.findByRole("dialog", { name: "Ghi chú kiện khác" });
  await user.click(within(dialog).getByLabelText("Ghi chú (bắt buộc)"));
  await user.paste("abc");
  await user.click(within(dialog).getByRole("button", { name: "Mở phiên" }));
  expect(await within(dialog).findByText("Nhập ghi chú 5–200 ký tự.")).toBeInTheDocument();
  await user.click(within(dialog).getByLabelText("Ghi chú (bắt buộc)"));
  await user.paste(" Kiện thứ hai cùng mã");
  await user.click(within(dialog).getByRole("button", { name: "Mở phiên" }));

  expect(await screen.findByText("ĐANG KIỂM HÀNG HOÀN")).toBeInTheDocument();
  expect(screen.getByText("Chưa xác định")).toBeInTheDocument();
  expect(stationSim.session?.flags).toContain("UNIDENTIFIED");
});

test("API-105 FORCE_NEW_NOT_ALLOWED → toast, đóng Dialog, giữ R1", async () => {
  const user = userEvent.setup({ delay: null });
  await r1();
  await hidScan("SPXTST0000053");
  await user.click(await screen.findByRole("button", { name: /Đây là kiện khác/ }));
  server.use(
    http.post("/api/v1/station/return-sessions", () =>
      HttpResponse.json(
        { error: { code: "FORCE_NEW_NOT_ALLOWED", message: "x", details: { reason: "SESSION_OPENED" } } },
        { status: 409 },
      ),
    ),
  );
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByLabelText("Ghi chú (bắt buộc)"));
  await user.paste("Kiện thứ hai cùng mã");
  await user.click(within(dialog).getByRole("button", { name: "Mở phiên" }));

  expect(await screen.findByText("Mã này không thuộc kiện đã nhận — quét lại.")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByText("SẴN SÀNG NHẬN HÀNG HOÀN")).toBeInTheDocument();
});

test("API-105 SESSION_ACTIVE → toast Station đang có phiên, đóng R3", async () => {
  const user = userEvent.setup({ delay: null });
  await r1();
  await user.click(screen.getByRole("button", { name: "Không quét được mã? Tìm thủ công" }));
  const dialog = await screen.findByRole("dialog");
  await user.paste("SPXTST0000041");
  await user.click(within(dialog).getByRole("button", { name: "Tìm" }));
  const row = (await within(dialog).findByText("SPXTST0000041")).closest("li")!;
  server.use(
    http.post("/api/v1/station/return-sessions", () =>
      HttpResponse.json({ error: { code: "SESSION_ACTIVE", message: "x", details: {} } }, { status: 409 }),
    ),
  );

  await user.click(within(row).getByRole("button", { name: "Mở phiên" }));

  expect(await screen.findByText("Station đang có phiên. Đóng phiên trước.")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("TC-04.53: bàn đóng gói quét kiện hoàn → S4 ĐƠN ĐÃ BÀN GIAO + nhận ở bàn nhận hoàn", async () => {
  stationSim.workMode = "PACK";
  renderApp("/station");
  await screen.findByText("SẴN SÀNG");

  await hidScan("SPXTST0000049");

  expect(await screen.findByText("ĐƠN ĐÃ BÀN GIAO")).toBeInTheDocument();
  expect(screen.getByText(/kiện hàng hoàn — nhận ở bàn nhận hoàn/)).toBeInTheDocument();
});
