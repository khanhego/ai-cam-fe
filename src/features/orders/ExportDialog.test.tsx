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
