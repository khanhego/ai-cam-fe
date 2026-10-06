/**
 * `EvidencePackDialog` trong D17 (T-159; 01 §10.5 D17 "Xuất gói bằng chứng", FR-08.05, UC-12, API-136..138).
 * TC-08.16 (UI), 08.19 (UI), 08.21 (UI 404).
 */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { claimsApi } from "@/lib/api/claims";
import { login } from "@/lib/api/auth";
import { apiError } from "@/mocks/http";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import { packPoll } from "./packPoll";

const as = (user = "tst_cskh") => login(user, "matkhau123", "DASHBOARD");
let now = Date.now();
const advance = (ms: number) => {
  now += ms;
  vi.setSystemTime(now);
};

beforeEach(() => {
  now = Date.now();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  packPoll.ms = 30;
});
afterEach(() => {
  vi.useRealTimers();
  packPoll.ms = 2000;
});

async function openPack(path = "/admin/claims/cl-000124") {
  const user = userEvent.setup();
  renderApp(path);
  await user.click(await screen.findByRole("button", { name: "Xuất gói bằng chứng" }));
  return { user, dialog: screen.getByRole("dialog", { name: "Xuất gói bằng chứng" }) };
}

test("TC-08.16 (UI): Gói gồm … → Tạo gói → tiến độ % → sẵn sàng: dung lượng, SHA-256, hạn giữ → Tải (.zip) bằng link ký mới", async () => {
  await as();
  const { user, dialog } = await openPack();
  expect(
    within(dialog).getByText(
      /^Gói gồm: clip gốc, video ghép có chữ cho 2 phiên chính, \d+ ảnh, file thông tin\.$/,
    ),
  ).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Tạo gói" }));
  expect(
    await within(dialog).findByRole("progressbar", { name: "Đang tạo gói bằng chứng" }),
  ).toBeInTheDocument();
  advance(2000);
  expect(await within(dialog).findByText("Đang tạo gói bằng chứng · 50%")).toBeInTheDocument();
  advance(2500);
  expect(await within(dialog).findByText("Gói bằng chứng đã sẵn sàng.")).toBeInTheDocument();
  expect(within(dialog).getByText("1 KB")).toBeInTheDocument();
  expect(within(dialog).getByText(/^[0-9a-f]{4}…[0-9a-f]{4}$/)).toBeInTheDocument();
  expect(within(dialog).getByText(/^File giữ tới \d{2}\/\d{2}\/\d{4}/)).toBeInTheDocument();

  const clicks: HTMLAnchorElement[] = [];
  const spy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks.push(this);
  });
  await user.click(within(dialog).getByRole("button", { name: "Tải gói bằng chứng (.zip)" }));
  await waitFor(() => expect(clicks).toHaveLength(1));
  expect(clicks[0]!.getAttribute("href")).toMatch(/\/media\/evidence-packs\/pack-\d+\/pack\.zip\?uid=u-cskh/);
  expect(clicks[0]!.download).toBe("KN-000124.zip");
  spy.mockRestore();
});

test("G3-F21: Tải gói — API-137 lỗi → toast, không tải", async () => {
  await as();
  const { user, dialog } = await openPack();
  await user.click(within(dialog).getByRole("button", { name: "Tạo gói" }));
  advance(5000);
  expect(await within(dialog).findByText("Gói bằng chứng đã sẵn sàng.")).toBeInTheDocument();
  server.use(
    http.get("/api/v1/evidence-packs/:id", () => apiError(500, "INTERNAL", "Lỗi máy chủ. Thử lại sau.")),
  );
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

  await user.click(within(dialog).getByRole("button", { name: "Tải gói bằng chứng (.zip)" }));

  await waitFor(() =>
    expect(
      screen.getAllByRole("status").some((el) => el.textContent?.includes("Lỗi máy chủ. Thử lại sau.")),
    ).toBe(true),
  );
  expect(click).not.toHaveBeenCalled();
  click.mockRestore();
});

test("Đóng Dialog khi đang tạo → mở lại vẫn theo dõi gói đó (không tạo gói mới)", async () => {
  await as();
  const { user, dialog } = await openPack();
  await user.click(within(dialog).getByRole("button", { name: "Tạo gói" }));
  await within(dialog).findByRole("progressbar");
  await user.click(within(dialog).getByRole("button", { name: "Đóng" }));
  advance(5000);
  await user.click(screen.getByRole("button", { name: "Xuất gói bằng chứng" }));
  const again = screen.getByRole("dialog", { name: "Xuất gói bằng chứng" });
  expect(await within(again).findByText("Gói bằng chứng đã sẵn sàng.")).toBeInTheDocument();
  expect(within(again).queryByRole("button", { name: "Tạo gói" })).not.toBeInTheDocument();
});

test("FAILED → 'Không tạo được gói bằng chứng…' + Thử lại → gói mới sẵn sàng", async () => {
  await as("tst_sup");
  // Mock: lần xuất đầu của KN-000123 lỗi ở 60 %.
  const { user, dialog } = await openPack("/admin/claims/cl-000123");
  await user.click(within(dialog).getByRole("button", { name: "Tạo gói" }));
  await within(dialog).findByRole("progressbar");
  advance(3000);
  expect(
    await within(dialog).findByText(
      "Không tạo được gói bằng chứng. Bấm Thử lại; nếu vẫn lỗi, báo Admin kèm mã hồ sơ.",
    ),
  ).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Thử lại" }));
  await within(dialog).findByRole("progressbar");
  advance(4500);
  expect(await within(dialog).findByText("Gói bằng chứng đã sẵn sàng.")).toBeInTheDocument();
});

test("TC-08.19 (UI): PACK_IN_PROGRESS → theo dõi gói đang chạy (details.pack_id)", async () => {
  await as();
  const running = await claimsApi.createPack("cl-000124");
  const { user, dialog } = await openPack();
  await user.click(within(dialog).getByRole("button", { name: "Tạo gói" }));
  await within(dialog).findByRole("progressbar");
  advance(4500);
  expect(await within(dialog).findByText("Gói bằng chứng đã sẵn sàng.")).toBeInTheDocument();
  const clicks: string[] = [];
  const spy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks.push(this.href);
  });
  await user.click(within(dialog).getByRole("button", { name: "Tải gói bằng chứng (.zip)" }));
  await waitFor(() => expect(clicks[0]).toContain(`/evidence-packs/${running.id}/`));
  spy.mockRestore();
});

test("NO_EVIDENCE; hồ sơ không có bằng chứng → nút Tạo gói khóa", async () => {
  await as();
  const empty = await claimsApi.create({
    package_id: "pkg-0000050",
    type: "OTHER",
    counterparty: "PLATFORM",
  });
  const first = await openPack(`/admin/claims/${empty.id}`);
  expect(within(first.dialog).getAllByText("Hồ sơ chưa có bằng chứng.").length).toBeGreaterThan(0);
  expect(within(first.dialog).getByRole("button", { name: "Tạo gói" })).toBeDisabled();
});

test("server NO_EVIDENCE → Alert; API-137 404 (quá 24 giờ) → 'Gói không còn…' + tạo lại được", async () => {
  await as();
  server.use(
    http.post("/api/v1/claims/:id/evidence-packs", () =>
      apiError(409, "NO_EVIDENCE", "Hồ sơ chưa có bằng chứng."),
    ),
  );
  const { user, dialog } = await openPack();
  await user.click(within(dialog).getByRole("button", { name: "Tạo gói" }));
  expect(await within(dialog).findByText("Hồ sơ chưa có bằng chứng.")).toBeInTheDocument();

  server.resetHandlers();
  server.use(
    http.get("/api/v1/evidence-packs/:id", () =>
      apiError(404, "NOT_FOUND", "Không tìm thấy gói bằng chứng. Tạo gói mới."),
    ),
  );
  await user.click(within(dialog).getByRole("button", { name: "Tạo gói" }));
  expect(
    await within(dialog).findByText(
      "Gói không còn (quá 24 giờ hoặc do tài khoản khác tạo). Bấm Tạo gói để tạo lại.",
    ),
  ).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Tạo gói" })).toBeEnabled();
});

test("phần thiếu trong gói (clip đã xóa) liệt kê theo camera + phiên", async () => {
  await as();
  server.use(
    http.get("/api/v1/evidence-packs/:id", ({ params }) =>
      Response.json({
        id: params.id,
        claim_id: "cl-000124",
        status: "READY",
        progress: 100,
        sha256: "a".repeat(64),
        size_bytes: 58_200_000,
        missing: [{ session_id: "x", camera_role: "CAM2", reason: "CLIP_DELETED" }],
        files: { zip: "/api/v1/media/evidence-packs/p/pack.zip?uid=u&exp=1&sig=s" },
        expires_at: "2099-01-01T00:00:00Z",
      }),
    ),
  );
  const { user, dialog } = await openPack();
  await user.click(within(dialog).getByRole("button", { name: "Tạo gói" }));
  expect(await within(dialog).findByText("Phần thiếu trong gói:")).toBeInTheDocument();
  expect(within(dialog).getByText("Cam 2 phiên —: clip đã bị xóa")).toBeInTheDocument();
  expect(within(dialog).getByText("55,5 MB")).toBeInTheDocument();
});
