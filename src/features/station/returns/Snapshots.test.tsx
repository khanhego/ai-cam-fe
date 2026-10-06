/** R2 ảnh F2 + cột "Lúc đóng gói" với MSW (TC-04.40..04.44, FR-04.04, 04.12). */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { login } from "@/lib/api/auth";
import { stationSim } from "@/mocks/stationSim";
import { renderApp } from "@/test/render";
import { hidScan } from "@/test/scan";
import { server } from "@/test/server";

import { sound } from "../sound";
import { resetStationStore } from "../stationStore";

vi.spyOn(sound, "play").mockImplementation(() => {});
vi.spyOn(sound, "stop").mockImplementation(() => {});

beforeEach(async () => {
  resetStationStore();
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

const f2 = () => fireEvent.keyDown(window, { key: "F2" });

test("TC-04.40: F2 3 lần → 3 ảnh trong dải; bấm ảnh → Dialog ảnh lớn", async () => {
  const user = userEvent.setup({ delay: null });
  await openR2();

  for (let i = 1; i <= 3; i += 1) {
    f2();
    expect(await screen.findByRole("button", { name: `Ảnh ${i}` })).toBeInTheDocument();
  }
  expect(stationSim.session?.snapshots).toHaveLength(3);

  await user.click(screen.getByRole("button", { name: "Ảnh 2" }));
  expect(await screen.findByRole("dialog", { name: /^Ảnh 2 · / })).toBeInTheDocument();
});

test("F2 bấm liền 3 lần khi ảnh trước chưa xong → xếp hàng, đủ 3 ảnh", async () => {
  await openR2();

  f2();
  f2();
  f2();

  expect(await screen.findByRole("button", { name: "Ảnh 3" })).toBeInTheDocument();
  expect(stationSim.session?.snapshots).toHaveLength(3);
});

test("F2 khi đang gõ ghi chú vẫn chụp, không gõ ký tự vào ô", async () => {
  await openR2();
  const note = screen.getByLabelText("Ghi chú");
  note.focus();

  fireEvent.keyDown(note, { key: "F2" });

  expect(await screen.findByRole("button", { name: "Ảnh 1" })).toBeInTheDocument();
  expect(note).toHaveValue("");
});

test("nút + Chụp ảnh (F2) cũng chụp; F2 ngoài R2 không gọi API-103", async () => {
  const user = userEvent.setup({ delay: null });
  let posts = 0;
  server.events.on("request:start", ({ request }) => {
    if (request.method === "POST" && request.url.includes("/snapshots")) posts += 1;
  });
  renderApp("/station");
  await screen.findByText("SẴN SÀNG NHẬN HÀNG HOÀN");
  f2();
  expect(posts).toBe(0);

  await hidScan("SPXRTTST000041");
  await user.click(await screen.findByRole("button", { name: "+ Chụp ảnh (F2)" }));
  expect(await screen.findByRole("button", { name: "Ảnh 1" })).toBeInTheDocument();
  expect(posts).toBe(1);
  server.events.removeAllListeners();
});

test("TC-04.41: SNAPSHOT_LIMIT → nút khóa Đã đủ 20 ảnh", async () => {
  await openR2();
  server.use(
    http.post("/api/v1/station/sessions/:id/snapshots", () =>
      HttpResponse.json(
        { error: { code: "SNAPSHOT_LIMIT", message: "Đã đủ 20 ảnh.", details: { max: 20 } } },
        { status: 409 },
      ),
    ),
  );

  f2();

  expect(await screen.findByRole("button", { name: "Đã đủ 20 ảnh" })).toBeDisabled();
});

test("TC-04.42: Cam 1 không kết nối → toast Không chụp được ảnh từ Cam 1. Thử lại.", async () => {
  await openR2();
  stationSim.cameras = [
    { role: "CAM1", status: "OFFLINE" },
    { role: "CAM2", status: "ONLINE" },
  ];

  f2();

  expect(await screen.findByText("Không chụp được ảnh từ Cam 1. Thử lại.")).toBeInTheDocument();
});

test("TC-04.43: cột Lúc đóng gói có ảnh + Xem clip đóng gói mở Dialog Cam 1 / Cam 2 / Ghép", async () => {
  const user = userEvent.setup({ delay: null });
  await openR2();

  const card = screen.getByRole("region", { name: "Lúc đóng gói" });
  expect(within(card).getByRole("img", { name: "Lúc đóng gói" })).toBeInTheDocument();
  await user.click(within(card).getByRole("button", { name: /Xem clip đóng gói/ }));

  const dialog = await screen.findByRole("dialog", { name: "Xem clip đóng gói" });
  expect(within(dialog).getByRole("tab", { name: "Cam 1" })).toBeInTheDocument();
  expect(within(dialog).getByRole("tab", { name: "Ghép" })).toBeInTheDocument();
  await waitFor(() => expect(dialog.querySelector("video")).not.toBeNull());
});

test("API-40 403 → Không xem được clip lúc này.", async () => {
  const user = userEvent.setup({ delay: null });
  await openR2();
  server.use(
    http.get("/api/v1/clips/:id/play-url", () =>
      HttpResponse.json(
        { error: { code: "FORBIDDEN", message: "Không có quyền.", details: {} } },
        { status: 403 },
      ),
    ),
  );

  await user.click(screen.getByRole("button", { name: /Xem clip đóng gói/ }));

  expect(await screen.findByText("Không xem được clip lúc này.")).toBeInTheDocument();
  expect(screen.getByText("ĐANG KIỂM HÀNG HOÀN")).toBeInTheDocument();
});

test("TC-04.44: đơn trước khi dùng hệ thống → nút khóa + Không có clip đóng gói", async () => {
  await openR2("SPXTST0000050");

  expect(screen.getByText("Không có clip đóng gói (đơn trước khi dùng hệ thống).")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Xem clip đóng gói/ })).toBeDisabled();
});
