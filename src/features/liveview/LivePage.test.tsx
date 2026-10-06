/**
 * D11 Live view (01 §10.5, FR-01.05) trên MSW. WHEP thật không chạy trong jsdom → `connectWhep` giả lập
 * (logic WHEP ở shared/media/whep.test.ts). Phát video thật: kiểm tay với MediaMTX (DEC-83).
 */
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { login } from "@/lib/api/auth";
import { mockStations } from "@/mocks/handlers/stations";
import { apiError } from "@/mocks/http";
import type { WhepStatus } from "@/shared/media/whep";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

type Conn = { url: string; onStatus: (s: WhepStatus) => void; closed: boolean };
const conns: Conn[] = [];
let behaviour: (url: string) => "play" | "fail" = () => "play";

vi.mock("@/shared/media/whep", () => ({
  whepSupported: () => true,
  connectWhep: async (
    url: string,
    handlers: { onStatus: (s: WhepStatus) => void; onStream: (s: MediaStream) => void },
  ) => {
    const conn: Conn = { url, onStatus: handlers.onStatus, closed: false };
    conns.push(conn);
    handlers.onStatus("connecting");
    if (behaviour(url) === "fail") throw new Error("WHEP 404");
    queueMicrotask(() => handlers.onStatus("playing"));
    return {
      close: () => {
        conn.closed = true;
      },
    };
  },
}));

beforeEach(() => {
  conns.length = 0;
  behaviour = () => "play";
  // Station 02 có đủ 2 camera để lưới đủ 4 ô (TC-01.10).
  mockStations.push({
    id: "st-2",
    name: "TST Station 02",
    is_active: true,
    kind: "PACK",
    work_mode: "PACK",
    operator_name: null,
    account: null,
    cameras: [
      {
        id: "cam-3",
        role: "CAM1",
        rtsp_url_masked: "rtsp://x",
        status: "ONLINE",
        roi: null,
        clock_offset_ms: null,
      },
      {
        id: "cam-4",
        role: "CAM2",
        rtsp_url_masked: "rtsp://y",
        status: "ONLINE",
        roi: null,
        clock_offset_ms: null,
      },
    ],
  });
  mockStations[0]!.cameras[1]!.status = "ONLINE";
});

const tile = (name: string) => screen.findByRole("figure", { name });

test("TC-01.10: 4 ô (2 station × 2 camera), mỗi ô kết nối WHEP theo whep_url và có chip REC", async () => {
  await login("tst_sup", "matkhau123", "DASHBOARD");
  renderApp("/admin/live");

  for (const name of [
    "TST Station 01 · Cam 1",
    "TST Station 01 · Cam 2",
    "TST Station 02 · Cam 1",
    "TST Station 02 · Cam 2",
  ]) {
    const fig = await tile(name);
    expect(await within(fig).findByText("REC")).toBeInTheDocument();
  }
  expect(conns.map((c) => c.url)).toHaveLength(4);
  expect(conns[0]!.url).toBe("/mock/clip-cam1.mp4");
  const nav = screen.getByRole("navigation", { name: "Điều hướng chính" });
  expect(within(nav).getByRole("link", { name: "Live view" })).toHaveAttribute("href", "/admin/live");
});

test("TC-01.14: một camera mất tín hiệu → chỉ ô đó 'Mất tín hiệu' + Thử lại; ô khác vẫn chạy", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  await login("tst_sup", "matkhau123", "DASHBOARD");
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderApp("/admin/live");

  const cam1 = await tile("TST Station 01 · Cam 1");
  await within(cam1).findByText("REC");
  const conn = conns.find((c) => c.url.includes("cam1"))!;
  act(() => conn.onStatus("lost"));

  expect(within(cam1).getByText("Mất tín hiệu")).toBeInTheDocument();
  expect(within(await tile("TST Station 01 · Cam 2")).getByText("REC")).toBeInTheDocument();
  expect(within(await tile("TST Station 02 · Cam 1")).getByText("REC")).toBeInTheDocument();

  const before = conns.length;
  await user.click(within(cam1).getByRole("button", { name: "Thử lại" }));
  await waitFor(() => expect(conns.length).toBe(before + 1));
  expect(await within(cam1).findByText("REC")).toBeInTheDocument();
  vi.useRealTimers();
});

test("WHEP lỗi lúc bắt tay → 'Mất tín hiệu', tự thử lại sau 5 giây", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  let failFirst = true;
  behaviour = (url) => {
    if (url.includes("cam2") && failFirst) {
      failFirst = false;
      return "fail";
    }
    return "play";
  };
  mockStations.splice(1, 1);
  await login("tst_sup", "matkhau123", "DASHBOARD");
  renderApp("/admin/live");

  const cam2 = await tile("TST Station 01 · Cam 2");
  expect(await within(cam2).findByText("Mất tín hiệu")).toBeInTheDocument();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(await within(cam2).findByText("REC")).toBeInTheDocument();
  vi.useRealTimers();
});

test("Camera OFFLINE theo API-65 → 'Mất tín hiệu' ngay, không gọi WHEP", async () => {
  mockStations[0]!.cameras[1]!.status = "OFFLINE";
  mockStations.splice(1, 1);
  await login("tst_admin", "matkhau123", "DASHBOARD");
  renderApp("/admin/live");

  const cam2 = await tile("TST Station 01 · Cam 2");
  expect(within(cam2).getByText("Mất tín hiệu")).toBeInTheDocument();
  await within(await tile("TST Station 01 · Cam 1")).findByText("REC");
  expect(conns.some((c) => c.url.includes("cam2"))).toBe(false);
});

test("Chọn station để phóng to (?station=) — ô station khác đóng kết nối", async () => {
  await login("tst_sup", "matkhau123", "DASHBOARD");
  const user = userEvent.setup();
  const router = renderApp("/admin/live");

  await within(await tile("TST Station 02 · Cam 2")).findByText("REC");
  await user.click(screen.getByRole("button", { name: "TST Station 02" }));

  expect(router.state.location.search).toBe("?station=st-2");
  await waitFor(() => expect(screen.queryByRole("figure", { name: "TST Station 01 · Cam 1" })).toBeNull());
  expect(conns.filter((c) => c.url && !c.closed)).toHaveLength(2);
  expect(screen.getByRole("button", { name: "TST Station 02" })).toHaveAttribute("aria-pressed", "true");
});

test("D13 → 'Xem live' mở D11 phóng to station của yêu cầu", async () => {
  await login("tst_sup", "matkhau123", "DASHBOARD");
  const user = userEvent.setup();
  const router = renderApp("/admin/approvals");

  const card = (await screen.findByRole("heading", { name: "TST Station 02" })).closest("article")!;
  await user.click(within(card).getByRole("link", { name: "Xem live" }));

  expect(router.state.location.pathname + router.state.location.search).toBe("/admin/live?station=st-2");
  expect(await tile("TST Station 02 · Cam 1")).toBeInTheDocument();
});

test("Chưa có camera → EmptyState", async () => {
  mockStations.splice(0);
  await login("tst_sup", "matkhau123", "DASHBOARD");
  renderApp("/admin/live");
  expect(await screen.findByText("Chưa có camera nào.")).toBeInTheDocument();
});

test("API-65 lỗi → Alert + Thử lại", async () => {
  server.use(http.get("/api/v1/live", () => apiError(500, "INTERNAL", "Lỗi")));
  await login("tst_sup", "matkhau123", "DASHBOARD");
  renderApp("/admin/live");

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Không tải được danh sách camera.");
  expect(within(alert).getByRole("button", { name: "Thử lại" })).toBeInTheDocument();
});

test("TC-P (D11): CSKH bị chặn, không có mục Live view", async () => {
  await login("tst_cskh", "matkhau123", "DASHBOARD");
  const router = renderApp("/admin/live");

  await waitFor(() => expect(router.state.location.pathname).toBe("/admin/forbidden"));
  const nav = screen.getByRole("navigation", { name: "Điều hướng chính" });
  expect(within(nav).queryByRole("link", { name: "Live view" })).not.toBeInTheDocument();
});
