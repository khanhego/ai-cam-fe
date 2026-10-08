/** Màn station S1–S6 với MSW (02b-station §13 integration; UC-01, UC-08). */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { login } from "@/lib/api/auth";
import { server } from "@/test/server";
import { useSession } from "@/lib/api/session";
import { renderApp } from "@/test/render";
import { hidScan } from "@/test/scan";

import { sound } from "./sound";
import { resetStationStore, useStationStore } from "./stationStore";

vi.spyOn(sound, "play").mockImplementation(() => {});
vi.spyOn(sound, "stop").mockImplementation(() => {});

beforeEach(async () => {
  resetStationStore();
  await login("tst_station01", "matkhau123", "STATION");
});

/** Máy quét: gõ liền không độ trễ + Enter. */
async function scan(code: string) {
  await hidScan(code);
}

async function ready() {
  renderApp("/station");
  expect(await screen.findByText("SẴN SÀNG")).toBeInTheDocument();
}

test("S1 hiện trạng thái sẵn sàng, tên station, camera", async () => {
  await ready();

  expect(screen.getByText("Quét mã vận đơn để bắt đầu")).toBeInTheDocument();
  expect(screen.getByText("Hôm nay: 0 kiện")).toBeInTheDocument();
  expect(screen.getByText("TST Station 01")).toBeInTheDocument();
  expect(await screen.findByText("Chưa có phiên nào hôm nay.")).toBeInTheDocument();
});

test("UC-01: quét mở → S2 có sản phẩm; quét lại → S1, phiên gần đây có nút Xem", async () => {
  await ready();

  await scan("SPXTST0000012");

  expect(await screen.findByText("ĐANG ĐÓNG GÓI")).toBeInTheDocument();
  expect(screen.getByText("SPXTST0000012")).toBeInTheDocument();
  expect(screen.getByText("Túi vải")).toBeInTheDocument();
  expect(screen.getByText("Dán phiếu lên kiện rồi QUÉT LẠI MÃ để hoàn tất")).toBeInTheDocument();

  await scan("SPXTST0000012");

  expect(await screen.findByText("SẴN SÀNG")).toBeInTheDocument();
  expect(screen.getByText("Hôm nay: 1 kiện")).toBeInTheDocument();
  const row = (await screen.findByText("SPXTST0000012")).closest("li")!;
  expect(within(row).getByRole("button", { name: /Xem/ })).toBeInTheDocument();
});

test("S3: quét đóng sai mã → lệch mã, hiện mã đang đóng gói và mã vừa quét", async () => {
  await ready();
  await scan("SPXTST0000001");
  await screen.findByText("ĐANG ĐÓNG GÓI");

  await scan("SPXTST0000002");

  // Item 02 FR-03.13: chữ hai tình huống (Hardening.test.tsx kiểm chi tiết).
  expect(await screen.findByText("LỆCH MÃ — DỪNG LẠI, CHƯA DÁN PHIẾU")).toBeInTheDocument();
  expect(screen.getByText("Vừa quét")).toBeInTheDocument();
});

test("S4: đơn đã hủy → cảnh báo, không mở phiên", async () => {
  await ready();

  await scan("SPXTST0000009");

  expect(await screen.findByText("ĐƠN ĐÃ HỦY")).toBeInTheDocument();
  expect(screen.getByText("SPXTST0000009 đã bị hủy trên sàn. Không đóng gói.")).toBeInTheDocument();
});

test("S4 → S5: đơn đã đóng, yêu cầu đóng gói lại, rồi rút yêu cầu", async () => {
  const user = userEvent.setup({ delay: null });
  await ready();
  await scan("SPXTST0000010");
  await user.click(await screen.findByRole("button", { name: /Yêu cầu đóng gói lại/ }));

  expect(await screen.findByText("ĐANG CHỜ QUẢN LÝ DUYỆT")).toBeInTheDocument();
  expect(screen.getByText("Đóng gói lại")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Rút yêu cầu" }));
  expect(await screen.findByText("SẴN SÀNG")).toBeInTheDocument();
});

test("S2 → S5: Gọi quản lý khi đang đóng gói (ASSIST); quét lúc chờ bị bỏ qua", async () => {
  const user = userEvent.setup({ delay: null });
  await ready();
  await scan("SPXTST0000003");
  await user.click(await screen.findByRole("button", { name: /Gọi quản lý/ }));

  expect(await screen.findByText("ĐANG CHỜ QUẢN LÝ DUYỆT")).toBeInTheDocument();
  expect(screen.getByText("Gọi quản lý")).toBeInTheDocument();

  await scan("SPXTST0000004");
  expect(await screen.findByText("Đang chờ duyệt.")).toBeInTheDocument();
});

test("Hủy phiên: Khác bắt buộc ghi chú; Hết hàng → về S1", async () => {
  const user = userEvent.setup({ delay: null });
  await ready();
  await scan("SPXTST0000005");
  await user.click(await screen.findByRole("button", { name: "Hủy phiên" }));
  const dialog = await screen.findByRole("dialog");

  await user.click(within(dialog).getByLabelText("Khác"));
  await user.click(within(dialog).getByRole("button", { name: "Hủy phiên" }));
  expect(await within(dialog).findByText("Nhập lý do khi chọn Khác")).toBeInTheDocument();

  await user.click(within(dialog).getByLabelText("Hết hàng"));
  await user.click(within(dialog).getByRole("button", { name: "Hủy phiên" }));
  expect(await screen.findByText("SẴN SÀNG")).toBeInTheDocument();
});

test("S6: lỗi mạng sau khi retry → mất kết nối, không nhận quét", async () => {
  await ready();
  server.use(http.post("/api/v1/station/scan", () => HttpResponse.error()));

  await scan("SPXTST0000006");

  expect(await screen.findByText("MẤT KẾT NỐI MÁY CHỦ")).toBeInTheDocument();
  expect(screen.getByText("Mạng").closest("span")?.parentElement).toHaveClass("bg-error-container");
});

test("gõ tay chậm không bị coi là quét", async () => {
  const user = userEvent.setup({ delay: 120 });
  let calls = 0;
  server.events.on("request:start", ({ request }) => {
    if (request.url.endsWith("/station/scan")) calls += 1;
  });
  await ready();

  await user.keyboard("SPXTST0000007{Enter}");

  await waitFor(() => expect(screen.getByText("SẴN SÀNG")).toBeInTheDocument());
  expect(calls).toBe(0);
  server.events.removeAllListeners();
});

test("review M1 #1: station bị Admin tắt (409 STATION_INACTIVE) → màn station đang tắt, không nhận quét", async () => {
  await ready();
  server.use(
    http.post("/api/v1/station/scan", () =>
      HttpResponse.json(
        { error: { code: "STATION_INACTIVE", message: "Station này đang tắt. Liên hệ Admin.", details: {} } },
        { status: 409 },
      ),
    ),
  );

  await scan("SPXTST0000006");

  expect(await screen.findByText("STATION ĐANG TẮT")).toBeInTheDocument();
  expect(screen.getByText("Station này đang tắt. Liên hệ Admin.")).toBeInTheDocument();
});

test("review M1 #1: 403 (station đã gỡ khỏi tài khoản) → về màn đăng nhập", async () => {
  await ready();
  server.use(
    http.post("/api/v1/station/scan", () =>
      HttpResponse.json(
        { error: { code: "FORBIDDEN", message: "Tài khoản không gắn station.", details: {} } },
        { status: 403 },
      ),
    ),
  );

  await scan("SPXTST0000006");

  expect(await screen.findByText("Đăng nhập station")).toBeInTheDocument();
  expect(useSession.getState().accessToken).toBeNull();
});

test("review M1 #1: lỗi khác (404 khi API chưa có) → toast, không treo", async () => {
  const user = userEvent.setup({ delay: null });
  await ready();
  await scan("SPXTST0000003");
  server.use(
    http.post("/api/v1/station/approval-requests", () =>
      HttpResponse.json(
        { error: { code: "NOT_FOUND", message: "Không tìm thấy.", details: {} } },
        { status: 404 },
      ),
    ),
  );

  await user.click(await screen.findByRole("button", { name: /Gọi quản lý/ }));

  expect(await screen.findByText("Không tìm thấy.")).toBeInTheDocument();
  expect(screen.getByText("ĐANG ĐÓNG GÓI")).toBeInTheDocument();
});

test("review M1 #10: rời trang station → tắt âm báo, xóa state", async () => {
  await ready();
  await scan("SPXTST0000001");
  await screen.findByText("ĐANG ĐÓNG GÓI");
  vi.mocked(sound.stop).mockClear();

  cleanup();

  expect(sound.stop).toHaveBeenCalled();
  expect(useStationStore.getState().state).toBeNull();
});
