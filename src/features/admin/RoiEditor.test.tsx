/** D6 bước ROI (01 §10.5, FR-01.04) trên MSW — TC-01.05 (phần UI), TC-01.06 (FE), TC-01.12. */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { login } from "@/lib/api/auth";
import { mockStations } from "@/mocks/handlers/stations";
import { apiError } from "@/mocks/http";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

beforeEach(async () => {
  await login("tst_admin", "matkhau123", "DASHBOARD");
});

/** Khung ảnh 640×360 tại (0,0) — jsdom không tính layout. */
async function surface() {
  const el = await screen.findByTestId("roi-surface");
  const box = el.parentElement!;
  box.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 640, height: 360, right: 640, bottom: 360, x: 0, y: 0 }) as DOMRect;
  return el;
}

function drag(el: HTMLElement, from: [number, number], to: [number, number]) {
  fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: from[0], clientY: from[1] });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: (from[0] + to[0]) / 2, clientY: (from[1] + to[1]) / 2 });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: to[0], clientY: to[1] });
}

const roiSection = () => screen.getByRole("region", { name: "Vùng đọc mã Cam 2" });

test("TC-01.05: kéo khung trên ảnh Cam 2 → Lưu vùng đọc mã → API-64 nhận {0.2, 0.2, 0.6, 0.6}", async () => {
  let sent: unknown;
  server.events.on("request:start", async ({ request }) => {
    if (request.method === "PUT" && request.url.endsWith("/cameras/cam-2/roi"))
      sent = await request.clone().json();
  });
  const user = userEvent.setup();
  renderApp("/admin/settings/stations/st-1");

  expect(await screen.findByRole("img", { name: "Ảnh chụp Cam 2 để vẽ vùng đọc mã" })).toBeInTheDocument();
  const save = within(roiSection()).getByRole("button", { name: /Lưu vùng đọc mã/ });
  expect(save).toBeDisabled(); // chưa vẽ
  expect(within(roiSection()).getByText("Chưa có vùng đọc mã.")).toBeInTheDocument();

  drag(await surface(), [128, 72], [512, 288]);
  expect(within(roiSection()).getByText("Khung: x 20% · y 20% · rộng 60% · cao 60%")).toBeInTheDocument();
  expect(screen.getByTestId("roi-rect")).toHaveStyle({
    left: "20%",
    top: "20%",
    width: "60%",
    height: "60%",
  });

  await user.click(save);

  expect(await screen.findByText("Đã lưu vùng đọc mã.")).toBeInTheDocument();
  expect(sent).toEqual({ x: 0.2, y: 0.2, w: 0.6, h: 0.6 });
  expect(mockStations[0]!.cameras[1]!.roi).toEqual({ x: 0.2, y: 0.2, w: 0.6, h: 0.6 });
  server.events.removeAllListeners();
  await waitFor(() => expect(save).toBeDisabled()); // đã lưu, không còn thay đổi
});

test("TC-01.06 (FE): khung rộng < 5% → khóa nút Lưu + nhắc", async () => {
  renderApp("/admin/settings/stations/st-1");

  drag(await surface(), [128, 72], [150, 288]); // w = 22/640 ≈ 3,4%
  const section = roiSection();
  expect(within(section).getByText("Khung phải rộng và cao ít nhất 5% ảnh.")).toBeInTheDocument();
  expect(within(section).getByRole("button", { name: /Lưu vùng đọc mã/ })).toBeDisabled();
});

test("API-64 ROI sai → 422 VALIDATION_ERROR (02 v0.4) → Alert trên ảnh", async () => {
  server.use(
    http.put("/api/v1/cameras/:id/roi", () =>
      apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", { fields: { w: "≥ 0.05" } }),
    ),
  );
  const user = userEvent.setup();
  renderApp("/admin/settings/stations/st-1");

  drag(await surface(), [0, 0], [320, 180]);
  await user.click(within(roiSection()).getByRole("button", { name: /Lưu vùng đọc mã/ }));

  expect(await within(roiSection()).findByRole("alert")).toHaveTextContent("Vùng đọc mã không hợp lệ");
});

test("ROI đã lưu hiện sẵn; Bỏ thay đổi quay về khung đã lưu", async () => {
  mockStations[0]!.cameras[1]!.roi = { x: 0.1, y: 0.1, w: 0.5, h: 0.5 };
  const user = userEvent.setup();
  renderApp("/admin/settings/stations/st-1");

  expect(await screen.findByText("Khung: x 10% · y 10% · rộng 50% · cao 50%")).toBeInTheDocument();
  drag(await surface(), [0, 0], [320, 180]);
  await user.click(within(roiSection()).getByRole("button", { name: "Bỏ thay đổi" }));
  expect(screen.getByText("Khung: x 10% · y 10% · rộng 50% · cao 50%")).toBeInTheDocument();
});

test("Ảnh Cam 2 lỗi (CAMERA_UNREACHABLE) → thông báo + Chụp lại", async () => {
  let fail = true;
  server.use(
    http.get("/api/v1/cameras/:id/snapshot", () =>
      fail
        ? apiError(422, "CAMERA_UNREACHABLE", "Không kết nối được camera.", { reason: "TIMEOUT" })
        : undefined,
    ),
  );
  const user = userEvent.setup();
  renderApp("/admin/settings/stations/st-1");

  expect(
    await screen.findByText("Không chụp được ảnh từ Cam 2. Kiểm tra camera rồi bấm Chụp lại."),
  ).toBeInTheDocument();
  fail = false;
  await user.click(within(roiSection()).getByRole("button", { name: /Chụp lại/ }));
  expect(await screen.findByRole("img", { name: "Ảnh chụp Cam 2 để vẽ vùng đọc mã" })).toBeInTheDocument();
});

test("TC-01.12: chỉ Cam 2 có công cụ ROI; station chưa có Cam 2 → nhắc lưu Cam 2 trước", async () => {
  mockStations[0]!.cameras.splice(1, 1);
  renderApp("/admin/settings/stations/st-1");

  expect(await screen.findByText("Lưu Cam 2 trước rồi vẽ vùng đọc mã.")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Vùng đọc mã Cam 2" })).not.toBeInTheDocument();
});

test("F37 a11y: bàn phím — mũi tên tạo khung mặc định và di chuyển, Shift + mũi tên đổi kích thước, Lưu", async () => {
  let sent: unknown;
  server.events.on("request:start", async ({ request }) => {
    if (request.method === "PUT" && request.url.endsWith("/cameras/cam-2/roi"))
      sent = await request.clone().json();
  });
  const user = userEvent.setup();
  renderApp("/admin/settings/stations/st-1");

  const area = await surface();
  area.focus();
  expect(area).toHaveFocus();
  await user.keyboard("{ArrowRight}"); // chưa có khung → khung mặc định giữa ảnh
  expect(within(roiSection()).getByText("Khung: x 25% · y 25% · rộng 50% · cao 50%")).toBeInTheDocument();
  await user.keyboard("{ArrowRight}{ArrowRight}{ArrowDown}");
  expect(within(roiSection()).getByText("Khung: x 27% · y 26% · rộng 50% · cao 50%")).toBeInTheDocument();
  await user.keyboard("{Shift>}{ArrowLeft}{ArrowUp}{/Shift}");
  expect(within(roiSection()).getByText("Khung: x 27% · y 26% · rộng 49% · cao 49%")).toBeInTheDocument();

  await user.click(within(roiSection()).getByRole("button", { name: /Lưu vùng đọc mã/ }));
  expect(await screen.findByText("Đã lưu vùng đọc mã.")).toBeInTheDocument();
  expect(sent).toEqual({ x: 0.27, y: 0.26, w: 0.49, h: 0.49 });
  server.events.removeAllListeners();
});
