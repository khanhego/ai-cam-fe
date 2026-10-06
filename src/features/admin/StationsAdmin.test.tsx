import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { login } from "@/lib/api/auth";
import { mockStations } from "@/mocks/handlers/stations";
import { stationSim } from "@/mocks/stationSim";
import { renderApp } from "@/test/render";

beforeEach(async () => {
  await login("tst_admin", "matkhau123", "DASHBOARD");
});

test("D6: danh sách station với trạng thái camera", async () => {
  renderApp("/admin/settings/stations");

  const row = (await screen.findByText("TST Station 01")).closest("tr")!;
  expect(within(row).getByText("tst_station01")).toBeInTheDocument();
  expect(within(row).getByText("Online")).toBeInTheDocument();
  expect(within(row).getByText("Mất tín hiệu")).toBeInTheDocument();
  expect(within(row).getByText("Đang bật")).toBeInTheDocument();
});

test("D6: danh sách trống → EmptyState có nút thêm", async () => {
  mockStations.splice(0);
  renderApp("/admin/settings/stations");

  expect(await screen.findByText("Chưa có station nào.")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /Thêm station/ })).toHaveLength(2);
});

test("UC-07: tạo station mới → chuyển sang trang sửa", async () => {
  const user = userEvent.setup();
  const router = renderApp("/admin/settings/stations/new");

  await user.type(await screen.findByLabelText("Tên station"), "TST Station 03");
  await user.click(screen.getByRole("button", { name: "Tạo station" }));

  await waitFor(() =>
    expect(router.state.location.pathname).toMatch(/^\/admin\/settings\/stations\/st-\d+$/),
  );
  expect(await screen.findByRole("heading", { name: "TST Station 03" })).toBeInTheDocument();
});

test("TC-01.02: tên trùng (không phân biệt hoa thường) → lỗi dưới ô tên", async () => {
  const user = userEvent.setup();
  renderApp("/admin/settings/stations/new");

  await user.type(await screen.findByLabelText("Tên station"), "tst station 01");
  await user.click(screen.getByRole("button", { name: "Tạo station" }));

  expect(await screen.findByText("Tên station đã tồn tại.")).toBeInTheDocument();
});

test("TC-01.03: tài khoản đã gắn station khác không có trong danh sách chọn", async () => {
  renderApp("/admin/settings/stations/new");

  const select = await screen.findByLabelText("Tài khoản station");
  await waitFor(() =>
    expect(within(select).getByRole("option", { name: "tst_station02" })).toBeInTheDocument(),
  );
  expect(within(select).queryByRole("option", { name: "tst_station01" })).not.toBeInTheDocument();
});

test("TC-01.01: kiểm tra kết nối camera → ảnh chụp + lệch giờ; lưu camera", async () => {
  const user = userEvent.setup();
  renderApp("/admin/settings/stations/st-1");
  const cam2 = (await screen.findByRole("heading", { name: "Cam 2 — khay phiếu" })).closest("section")!;

  await user.type(within(cam2).getByLabelText("Địa chỉ RTSP"), "rtsp://192.168.20.12:554/stream1");
  await user.click(within(cam2).getByRole("button", { name: /Kiểm tra kết nối/ }));

  expect(await within(cam2).findByRole("img", { name: /Ảnh chụp thử/ })).toBeInTheDocument();
  expect(within(cam2).getByText("Lệch giờ so với máy chủ: 120 ms")).toBeInTheDocument();

  await user.click(within(cam2).getByRole("button", { name: /Lưu camera/ }));
  expect(await screen.findByText("Đã lưu camera.")).toBeInTheDocument();
});

test("TC-01.04: camera không tới được → lỗi theo lý do; URL sai định dạng bị chặn ở client", async () => {
  const user = userEvent.setup();
  renderApp("/admin/settings/stations/st-1");
  const cam1 = (await screen.findByRole("heading", { name: "Cam 1 — bàn đóng gói" })).closest("section")!;
  const url = within(cam1).getByLabelText("Địa chỉ RTSP");

  await user.type(url, "http://x");
  await user.click(within(cam1).getByRole("button", { name: /Kiểm tra kết nối/ }));
  expect(await within(cam1).findByText("Địa chỉ phải bắt đầu bằng rtsp://")).toBeInTheDocument();

  await user.clear(url);
  await user.type(url, "rtsp://10.0.0.9/none");
  await user.click(within(cam1).getByRole("button", { name: /Kiểm tra kết nối/ }));
  expect(await within(cam1).findByRole("alert")).toHaveTextContent("hết thời gian chờ");
});

test("tắt station và lưu", async () => {
  const user = userEvent.setup();
  renderApp("/admin/settings/stations/st-1");

  await user.click(await screen.findByLabelText("Station đang bật"));
  await user.click(screen.getByRole("button", { name: "Lưu" }));

  expect(await screen.findByText("Đã lưu.")).toBeInTheDocument();
  expect(mockStations[0]?.is_active).toBe(false);
});

test("review M1 #11: camera đã lưu → ô tài khoản / mật khẩu ghi chú để trống là giữ", async () => {
  renderApp("/admin/settings/stations/st-1");
  const cam1 = (await screen.findByRole("heading", { name: /Cam 1/ })).closest("section")!;

  expect(within(cam1).getAllByText("Để trống để giữ giá trị đã lưu")).toHaveLength(2);
});

test("TC-01.30 (UI): D6 loại station — cột Loại; đổi 'Nhận hoàn' → lưu; STATION_BUSY khi station có phiên mở", async () => {
  const user = userEvent.setup();
  renderApp("/admin/settings/stations");
  const row = (await screen.findByText("TST Station 01")).closest("tr")!;
  expect(within(row).getByText("Cả hai")).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Loại" })).toBeInTheDocument();

  await user.click(within(row).getByRole("button", { name: "Sửa TST Station 01" }));
  const group = await screen.findByRole("group", { name: "Loại station" });
  expect(within(group).getByRole("button", { name: "Cả hai" })).toHaveAttribute("aria-pressed", "true");

  // Station đang có phiên mở → 409 STATION_BUSY.
  stationSim.scan("SPXTST0000003", "busy-1");
  await user.click(within(group).getByRole("button", { name: "Nhận hoàn" }));
  await user.click(screen.getByRole("button", { name: "Lưu" }));
  expect(await screen.findByText("Station đang có phiên mở. Thử lại khi station rảnh.")).toBeInTheDocument();

  expect(stationSim.cancel(stationSim.session!.id, "OTHER")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Lưu" }));
  expect(await screen.findByText("Đã lưu.")).toBeInTheDocument();
  expect(mockStations.find((s) => s.id === "st-1")!.kind).toBe("RETURN");
});
