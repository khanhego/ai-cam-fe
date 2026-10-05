/** ExportDialog (01 §10.5 D4, FR-07.04, 02.07, UC-03) trên MSW — TC-07.07 (phần UI), TC-07.10 (UI), TC-02.14 (phần mock), API-43 lỗi. */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { login } from "@/lib/api/auth";
import { apiError } from "@/mocks/http";
import { findSession, mockExports } from "@/mocks/packagesDb";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import { exportPoll } from "./exportLayouts";

beforeEach(async () => {
  exportPoll.ms = 30;
  await login("tst_cskh", "matkhau123", "DASHBOARD");
});
afterAll(() => {
  exportPoll.ms = 2000;
});

async function openDialog(pkg: string) {
  renderApp(`/admin/packages/${pkg}`);
  await userEvent.click(await screen.findByRole("button", { name: "Xuất clip" }));
  return screen.findByRole("dialog", { name: "Xuất clip" });
}

test("TC-07.07 (UI): Ghép mặc định → tiến độ → 2 nút tải; info.json có SHA-256 clip nguồn (TC-02.14)", async () => {
  const user = userEvent.setup();
  const dialog = await openDialog("pkg-0000001");

  expect(within(dialog).getByRole("button", { name: "Ghép" })).toHaveAttribute("aria-pressed", "true");
  await user.click(within(dialog).getByRole("button", { name: "Tạo file xuất" }));

  expect(await within(dialog).findByRole("progressbar", { name: "Đang tạo file xuất" })).toBeInTheDocument();
  const mp4 = await within(dialog).findByRole("link", { name: /Tải file MP4/ });
  expect(mp4).toHaveAttribute("download");
  expect(mp4.getAttribute("href")).toMatch(/^\/mock\/clip-cam1\.mp4\?export=exp-.*&sig=/);
  const info = within(dialog).getByRole("link", { name: "Tải thông tin (JSON)" });
  expect(within(dialog).getByText("File xuất đã sẵn sàng.")).toBeInTheDocument();
  expect([...mockExports.values()][0]?.layout).toBe("SIDE_BY_SIDE");

  const body = (await (await fetch(info.getAttribute("href")!)).json()) as {
    tracking_number: string;
    source_clip_sha256: Record<string, string>;
  };
  const clips = findSession("ses-0000001-1")!.clips;
  expect(body.tracking_number).toBe("SPXTST0000001");
  expect(body.source_clip_sha256).toEqual({ CAM1: clips[0]!.sha256, CAM2: clips[1]!.sha256 });
});

test("chọn Cam 1 → API-43 layout CAM1", async () => {
  const user = userEvent.setup();
  const dialog = await openDialog("pkg-0000003");

  await user.click(within(dialog).getByRole("button", { name: "Cam 1" }));
  await user.click(within(dialog).getByRole("button", { name: "Tạo file xuất" }));

  expect(await within(dialog).findByRole("link", { name: /Tải file MP4/ })).toBeInTheDocument();
  expect([...mockExports.values()][0]?.layout).toBe("CAM1");
});

test("TC-07.10 (UI): encode lỗi → Alert + Thử lại → lần sau thành công", async () => {
  const user = userEvent.setup();
  const dialog = await openDialog("pkg-0000002"); // mock: bản xuất đầu tiên của …02 lỗi

  await user.click(within(dialog).getByRole("button", { name: "Tạo file xuất" }));
  expect(
    await within(dialog).findByText(
      "Không tạo được file xuất. Bấm Thử lại; nếu vẫn lỗi, báo Admin kèm mã đơn.",
    ),
  ).toBeInTheDocument();

  await user.click(within(dialog).getByRole("button", { name: "Thử lại" }));
  expect(await within(dialog).findByRole("link", { name: /Tải file MP4/ })).toBeInTheDocument();
  expect(mockExports.size).toBe(2);
});

test.each([
  [409, "CLIP_NOT_READY", "Clip đang được cắt, sẵn sàng trong khoảng 1 phút."],
  [410, "CLIP_DELETED", "Clip đã bị xóa theo chính sách lưu trữ, không xuất được."],
])("API-43 %s %s → Alert trong dialog", async (status, code, text) => {
  const user = userEvent.setup();
  server.use(http.post("/api/v1/sessions/:id/exports", () => apiError(status, code, "x")));
  const dialog = await openDialog("pkg-0000001");

  await user.click(within(dialog).getByRole("button", { name: "Tạo file xuất" }));
  expect(await within(dialog).findByText(text)).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Tạo file xuất" })).toBeInTheDocument();
});

test("đóng dialog bằng nút Đóng", async () => {
  const dialog = await openDialog("pkg-0000001");

  await userEvent.click(within(dialog).getByRole("button", { name: "Đóng" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

test("phiên chưa có clip READY → không có nút Xuất clip", async () => {
  renderApp("/admin/packages/pkg-0000004");

  expect(await screen.findByText("Clip đang được cắt, sẵn sàng trong khoảng 1 phút.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Xuất clip" })).not.toBeInTheDocument();
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("F14: API-44 404 (quá 24 giờ / không phải người tạo) → dừng poll, về chọn camera kèm thông báo, ẩn tiến độ", async () => {
  const user = userEvent.setup();
  let polls = 0;
  server.use(
    http.get("/api/v1/exports/:id", () => {
      polls += 1;
      return apiError(404, "NOT_FOUND", "Không tìm thấy bản xuất.");
    }),
  );
  const dialog = await openDialog("pkg-0000001");

  await user.click(within(dialog).getByRole("button", { name: "Tạo file xuất" }));
  expect(
    await within(dialog).findByText(
      "Bản xuất không còn (quá 24 giờ hoặc do tài khoản khác tạo). Chọn camera rồi bấm Tạo file xuất.",
    ),
  ).toBeInTheDocument();
  expect(within(dialog).queryByRole("progressbar")).not.toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Tạo file xuất" })).toBeInTheDocument();
  await wait(exportPoll.ms * 5);
  expect(polls).toBe(1);

  // Tạo lại thành công → thông báo biến mất.
  server.resetHandlers();
  await user.click(within(dialog).getByRole("button", { name: "Tạo file xuất" }));
  expect(await within(dialog).findByRole("link", { name: /Tải file MP4/ })).toBeInTheDocument();
  expect(within(dialog).queryByText(/Bản xuất không còn/)).not.toBeInTheDocument();
});

test("F14: API-44 5xx (hết tự thử lại) → dừng poll, ẩn tiến độ, Thử lại gọi lại rồi xong", async () => {
  const user = userEvent.setup();
  let polls = 0;
  server.use(
    http.get("/api/v1/exports/:id", () => {
      polls += 1;
      return apiError(500, "INTERNAL", "Có lỗi hệ thống. Thử lại sau ít phút.");
    }),
  );
  const dialog = await openDialog("pkg-0000001");

  await user.click(within(dialog).getByRole("button", { name: "Tạo file xuất" }));
  expect(await within(dialog).findByText("Có lỗi hệ thống. Thử lại sau ít phút.")).toBeInTheDocument();
  expect(within(dialog).queryByRole("progressbar")).not.toBeInTheDocument();
  const after = polls;
  expect(after).toBe(3); // 1 lần + 2 lần tự thử lại (02b §8)
  await wait(exportPoll.ms * 5);
  expect(polls).toBe(after);

  server.resetHandlers();
  await user.click(within(dialog).getByRole("button", { name: "Thử lại" }));
  expect(await within(dialog).findByRole("link", { name: /Tải file MP4/ })).toBeInTheDocument();
});

test("F32: API-43 410 CLIP_DELETED có deleted_at → ngày xóa; 409 CLIP_NOT_READY FAILED → cắt lỗi", async () => {
  const user = userEvent.setup();
  server.use(
    http.post("/api/v1/sessions/:id/exports", () =>
      apiError(410, "CLIP_DELETED", "x", { deleted_at: "2026-09-01T03:00:00Z", retention_clip_days: 90 }),
    ),
  );
  const dialog = await openDialog("pkg-0000001");
  await user.click(within(dialog).getByRole("button", { name: "Tạo file xuất" }));
  expect(
    await within(dialog).findByText(
      "Clip đã bị xóa ngày 01/09/2026 theo chính sách lưu trữ 90 ngày, không xuất được.",
    ),
  ).toBeInTheDocument();

  server.use(
    http.post("/api/v1/sessions/:id/exports", () =>
      apiError(409, "CLIP_NOT_READY", "x", { status: "FAILED" }),
    ),
  );
  await user.click(within(dialog).getByRole("button", { name: "Tạo file xuất" }));
  expect(
    await within(dialog).findByText("Clip cắt lỗi — Admin/Supervisor có thể cắt lại rồi xuất."),
  ).toBeInTheDocument();
});
