/** D4 Chi tiết đơn + ClipPlayer + Giữ clip + cắt lại (01 §10.5, FR-07.02, 02.09) — TC-07.06, 07.11 (UI), 02.06 (bước 7), 02.10 (UI), 02.11. */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { login } from "@/lib/api/auth";
import { apiError } from "@/mocks/http";
import { findClip } from "@/mocks/packagesDb";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

const as = (user = "tst_cskh") => login(user, "matkhau123", "DASHBOARD");
const clipRegion = () => screen.findByRole("region", { name: "Clip" });

test("TC-07.06: chi tiết đủ thông tin — sản phẩm, 2 phiên mới nhất trước, dòng thời gian, SHA-256 + Copy", async () => {
  await as();
  renderApp("/admin/packages/pkg-0000010");

  expect(await screen.findByRole("heading", { name: /SPXTST0000010/ })).toBeInTheDocument();
  expect(screen.getByText("Áo thun basic · Đen / L ·", { exact: false })).toBeInTheDocument();
  expect(
    within(screen.getByRole("heading", { name: /SPXTST0000010/ })).getByText("Shopee: Chờ lấy hàng"),
  ).toBeInTheDocument();

  const sessions = within(screen.getByRole("region", { name: "Phiên" })).getAllByRole("button");
  expect(sessions).toHaveLength(2);
  expect(sessions[0]).toHaveTextContent("TST Station 02");
  expect(sessions[0]).toHaveAttribute("aria-pressed", "true");
  expect(sessions[1]).toHaveTextContent("Bị thay thế");

  const clip = await clipRegion();
  expect(within(clip).getByText("Cam 2 không xác minh")).toBeInTheDocument();
  expect(within(clip).getByText("Đóng gói lại")).toBeInTheDocument();
  expect(within(clip).getByRole("button", { name: "Copy SHA-256 Cam 1" })).toBeInTheDocument();
  expect(within(clip).getAllByText(/^[0-9a-f]{4}…[0-9a-f]{4}$/)).toHaveLength(2);

  const timeline = screen.getByRole("region", { name: "Dòng thời gian" });
  expect(within(timeline).getAllByText(/Kho: Đã đóng gói/).length).toBeGreaterThan(0);
  expect(within(timeline).getByText("Shopee: Chờ lấy hàng")).toBeInTheDocument();

  // Chọn phiên cũ → player đổi theo phiên đó.
  await userEvent.click(sessions[1]!);
  expect(sessions[1]).toHaveAttribute("aria-pressed", "true");
  expect(within(clip).getByText(/^TST Station 01 ·/)).toBeInTheDocument();
});

test("TC-07.11 (UI): tab Cam 1 / Cam 2 / Ghép; Ghép = 2 video; preload none", async () => {
  await as();
  renderApp("/admin/packages/pkg-0000001");
  const clip = await clipRegion();

  const cam1 = await within(clip).findByLabelText("Cam 1");
  expect(cam1).toHaveAttribute("src", "/mock/clip-cam1.mp4");
  expect(cam1).toHaveAttribute("preload", "none");
  expect(within(clip).getByText("Cam 2: khớp mã")).toBeInTheDocument();

  await userEvent.click(within(clip).getByRole("tab", { name: "Cam 2" }));
  expect(await within(clip).findByLabelText("Cam 2")).toHaveAttribute("src", "/mock/clip-cam2.mp4");

  await userEvent.click(within(clip).getByRole("tab", { name: "Ghép" }));
  expect(await within(clip).findByLabelText("Cam 1 (điều khiển cả hai)")).toBeInTheDocument();
  expect(await within(clip).findByLabelText("Cam 2")).toBeInTheDocument();
});

test("TC-02.11: clip đang cắt → EmptyState", async () => {
  await as();
  renderApp("/admin/packages/pkg-0000004");

  expect(await screen.findByText("Clip đang được cắt, sẵn sàng trong khoảng 1 phút.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Giữ clip" })).not.toBeInTheDocument();
});

test("TC-02.06 (bước 7): clip đã xóa theo lưu trữ → ngày xóa + số ngày", async () => {
  await as();
  renderApp("/admin/packages/pkg-0000014");

  expect(
    await screen.findByText(/^Clip đã bị xóa ngày \d{2}\/\d{2}\/\d{4} theo chính sách lưu trữ 90 ngày\.$/),
  ).toBeInTheDocument();
});

test("TC-02.10 (UI): clip lỗi → Supervisor bấm Thử lại → đang cắt lại", async () => {
  await as("tst_sup");
  const user = userEvent.setup();
  renderApp("/admin/packages/pkg-0000005");

  expect(await screen.findByText("Không tạo được clip cho phiên này.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Thử lại" }));

  expect(
    await screen.findByText("Đang cắt lại clip. Clip sẵn sàng trong khoảng 1 phút."),
  ).toBeInTheDocument();
  expect(await screen.findByText("Clip đang được cắt, sẵn sàng trong khoảng 1 phút.")).toBeInTheDocument();
});

test("CSKH không thấy nút cắt lại clip lỗi (02b-admin §7)", async () => {
  await as();
  renderApp("/admin/packages/pkg-0000005");

  expect(await screen.findByText("Không tạo được clip cho phiên này.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();
});

test("409 CLIP_NOT_FAILED → toast", async () => {
  await as("tst_admin");
  server.use(
    http.post("/api/v1/sessions/:id/clips/rebuild", () =>
      apiError(409, "CLIP_NOT_FAILED", "Clip không ở trạng thái lỗi."),
    ),
  );
  renderApp("/admin/packages/pkg-0000005");

  await userEvent.click(await screen.findByRole("button", { name: "Thử lại" }));
  expect(await screen.findByText("Clip không ở trạng thái lỗi.")).toBeInTheDocument();
});

test("FR-02.09: Giữ clip đảo nút ngay, toast, chip Đang giữ; Bỏ giữ trả lại", async () => {
  await as();
  const user = userEvent.setup();
  renderApp("/admin/packages/pkg-0000001");

  await user.click(await screen.findByRole("button", { name: "Giữ clip" }));
  expect(screen.getByRole("button", { name: "Bỏ giữ" })).toBeInTheDocument();
  expect(await screen.findByText("Đã giữ clip. Clip sẽ không bị xóa tự động.")).toBeInTheDocument();
  expect(within(await clipRegion()).getByText("Đang giữ")).toBeInTheDocument();
  await waitFor(() => expect(findClip("clip-0000001-1-1")?.held).toBe(true));
  expect(findClip("clip-0000001-1-2")?.held).toBe(true);

  await user.click(screen.getByRole("button", { name: "Bỏ giữ" }));
  expect(await screen.findByRole("button", { name: "Giữ clip" })).toBeInTheDocument();
  await waitFor(() => expect(findClip("clip-0000001-1-1")?.held).toBe(false));
});

test("Giữ clip lỗi → hoàn tác + toast lỗi", async () => {
  await as();
  server.use(
    http.put("/api/v1/clips/:id/hold", () =>
      apiError(500, "INTERNAL", "Có lỗi hệ thống. Thử lại sau ít phút."),
    ),
  );
  renderApp("/admin/packages/pkg-0000001");

  await userEvent.click(await screen.findByRole("button", { name: "Giữ clip" }));
  expect(
    await screen.findByText("Không giữ được clip Cam 1, Cam 2: Có lỗi hệ thống. Thử lại sau ít phút."),
  ).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Giữ clip" })).toBeInTheDocument();
});

test("F33: Giữ clip — Cam 1 thành công, Cam 2 lỗi → Cam 1 giữ, Cam 2 hoàn tác, toast nêu Cam 2", async () => {
  await as();
  server.use(
    http.put("/api/v1/clips/clip-0000001-1-2/hold", () =>
      apiError(500, "INTERNAL", "Có lỗi hệ thống. Thử lại sau ít phút."),
    ),
  );
  renderApp("/admin/packages/pkg-0000001");

  await userEvent.click(await screen.findByRole("button", { name: "Giữ clip" }));
  expect(
    await screen.findByText("Không giữ được clip Cam 2: Có lỗi hệ thống. Thử lại sau ít phút. Đã giữ Cam 1."),
  ).toBeInTheDocument();
  await waitFor(() => expect(findClip("clip-0000001-1-1")?.held).toBe(true));
  expect(findClip("clip-0000001-1-2")?.held).toBe(false);
  // Chưa giữ đủ mọi clip → nút vẫn là "Giữ clip", không có chip "Đang giữ".
  expect(await screen.findByRole("button", { name: "Giữ clip" })).toBeInTheDocument();
  expect(within(await clipRegion()).queryByText("Đang giữ")).not.toBeInTheDocument();
});

test("F32: API-40 410 CLIP_DELETED → 'Clip đã bị xóa ngày …'; 409 FAILED → cắt lỗi", async () => {
  await as();
  server.use(
    http.get("/api/v1/clips/:id/play-url", () =>
      apiError(410, "CLIP_DELETED", "x", { deleted_at: "2026-09-01T03:00:00Z", retention_clip_days: 90 }),
    ),
  );
  renderApp("/admin/packages/pkg-0000001");
  expect(
    await screen.findByText("Clip đã bị xóa ngày 01/09/2026 theo chính sách lưu trữ 90 ngày."),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Không phát được clip/)).not.toBeInTheDocument();
});

test("F32: API-40 409 CLIP_NOT_READY FAILED → 'Clip cắt lỗi — Admin/Supervisor có thể cắt lại.'", async () => {
  await as();
  server.use(
    http.get("/api/v1/clips/:id/play-url", () => apiError(409, "CLIP_NOT_READY", "x", { status: "FAILED" })),
  );
  renderApp("/admin/packages/pkg-0000001");
  expect(await screen.findByText("Clip cắt lỗi — Admin/Supervisor có thể cắt lại.")).toBeInTheDocument();
});

test("clip đang giữ + cờ Thiếu video", async () => {
  await as();
  renderApp("/admin/packages/pkg-0000006");

  expect(await screen.findByRole("button", { name: "Bỏ giữ" })).toBeInTheDocument();
  const clip = await clipRegion();
  expect(within(clip).getByText("Thiếu video")).toBeInTheDocument();
  expect(within(clip).getByText("Đang giữ")).toBeInTheDocument();
});

test("kiện chưa đóng gói → EmptyState; 3 sản phẩm", async () => {
  await as();
  renderApp("/admin/packages/pkg-0000012");

  expect(await screen.findAllByText("Kiện này chưa được đóng gói.")).toHaveLength(2);
  const items = screen.getByRole("region", { name: "Sản phẩm" });
  expect(within(items).getAllByRole("listitem")).toHaveLength(3);
  expect(within(items).getByText(/Túi vải/)).toBeInTheDocument();
});

test("404 → Không tìm thấy kiện + về Tra cứu", async () => {
  await as();
  const router = renderApp("/admin/packages/khong-co");

  expect(await screen.findByText("Không tìm thấy kiện.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Về Tra cứu đơn" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/admin/packages"));
});

test("SIGNATURE_INVALID: video lỗi → lấy lại API-40 một lần, lỗi tiếp → Alert", async () => {
  await as();
  let calls = 0;
  server.use(
    http.get("/api/v1/clips/:id/play-url", () => {
      calls += 1;
      return Response.json({ url: `/mock/clip-cam1.mp4?v=${calls}`, expires_at: "2099-01-01T00:00:00Z" });
    }),
  );
  renderApp("/admin/packages/pkg-0000001");

  fireEvent.error(await screen.findByLabelText("Cam 1"));
  await waitFor(() => expect(calls).toBe(2));
  fireEvent.error(await screen.findByLabelText("Cam 1"));
  expect(await screen.findByText(/Không phát được clip/)).toBeInTheDocument();
});

test("D3 → D4: bấm mã vận đơn mở chi tiết", async () => {
  await as();
  const router = renderApp("/admin/packages?q=SPXTST0000002");

  await userEvent.click(
    within(await screen.findByRole("table")).getByRole("link", { name: "SPXTST0000002" }),
  );
  await waitFor(() => expect(router.state.location.pathname).toBe("/admin/packages/pkg-0000002"));
  expect(await screen.findByRole("heading", { name: /SPXTST0000002/ })).toBeInTheDocument();
});
