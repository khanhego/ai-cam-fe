/**
 * Item 03 T-234 — R2 luật hủy 60 giây (FR-04.14, BR-37, DEC-480; 02b-station §13): `canSelfCancel` biên 59,9 / 60,0 giây,
 * nút đổi đúng lúc theo giờ server không tải lại, `aria-live`, 409 `CANCEL_REQUIRES_SUPERVISOR` → Toast.
 */
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { login } from "@/lib/api/auth";
import { stationSim } from "@/mocks/stationSim";
import { renderApp } from "@/test/render";
import { hidScan } from "@/test/scan";

import { sound } from "../sound";
import { resetStationStore, useStationStore } from "../stationStore";
import { canSelfCancel } from "./cancelRule";

vi.spyOn(sound, "play").mockImplementation(() => {});
vi.spyOn(sound, "stop").mockImplementation(() => {});

const LIVE = "Đã quá 60 giây — hủy phiên cần quản lý";
const VIA = "Muốn hủy phiên? Bấm Gọi quản lý.";

beforeEach(async () => {
  resetStationStore();
  await login("tst_station01", "matkhau123", "STATION");
  stationSim.workMode = "RETURN";
  stationSim.operatorName = "Lan QA";
});

async function openR2() {
  renderApp("/station");
  await screen.findByText("SẴN SÀNG NHẬN HÀNG HOÀN");
  await hidScan("SPXRTTST000041");
  await screen.findByText("ĐANG KIỂM HÀNG HOÀN");
}

/** Đặt `self_cancel_until` của phiên trong store (giả lập state server). */
function setUntil(until: string | null) {
  const state = useStationStore.getState().state!;
  useStationStore.setState({ state: { ...state, session: { ...state.session!, self_cancel_until: until } } });
}

describe("canSelfCancel", () => {
  const started = Date.parse("2026-10-07T03:00:00Z");
  const session = { self_cancel_until: new Date(started + 60_000).toISOString() };
  test("59,9 giây → được; 60,0 giây → không; quá → không", () => {
    expect(canSelfCancel(session, started + 59_900)).toBe(true);
    expect(canSelfCancel(session, started + 60_000)).toBe(false);
    expect(canSelfCancel(session, started + 61_000)).toBe(false);
  });
  test("null (đã kết luận / có ảnh / phiên PACK) → không", () => {
    expect(canSelfCancel({ self_cancel_until: null }, started)).toBe(false);
    expect(canSelfCancel(null, started)).toBe(false);
  });
});

test("AC-62: trong 60 giây có Hủy phiên; tới hạn (giờ server) nút đổi sang Gọi quản lý, không tải lại; aria-live đọc", async () => {
  await openR2();
  expect(screen.getByRole("button", { name: "Hủy phiên" })).toBeInTheDocument();
  expect(screen.getByTestId("cancel-rule-live")).toHaveAttribute("aria-live", "polite");
  expect(screen.getByTestId("cancel-rule-live")).toHaveTextContent("");

  const realNow = Date.now();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(realNow);
  try {
    // Đồng hồ server lệch máy 5 giây (offset); nhịp đồng hồ (setInterval) tạo lại trên timer giả.
    act(() => useStationStore.setState({ clockOffsetMs: 5000 }));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    const serverNow = Date.now() + 5000;
    act(() => setUntil(new Date(serverNow + 800).toISOString()));
    await act(() => vi.advanceTimersByTimeAsync(700));
    expect(screen.getByRole("button", { name: "Hủy phiên" })).toBeInTheDocument();
    // Qua hạn 100 ms — chưa tới nhịp 1 giây của đồng hồ: hẹn giờ riêng đổi đúng lúc.
    await act(() => vi.advanceTimersByTimeAsync(150));
    expect(screen.queryByRole("button", { name: "Hủy phiên" })).toBeNull();
    expect(screen.getByText(VIA)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gọi quản lý/ })).toBeInTheDocument();
    expect(screen.getByTestId("cancel-rule-live")).toHaveTextContent(LIVE);
  } finally {
    vi.useRealTimers();
  }
});

test("dùng giờ server (offset), không giờ máy: máy trạm chậm 2 phút → hạn theo máy còn, theo server đã qua → không có Hủy phiên", async () => {
  await openR2();
  act(() => {
    useStationStore.setState({ clockOffsetMs: 120_000 });
    setUntil(new Date(Date.now() + 30_000).toISOString());
  });
  await waitFor(() => expect(screen.queryByRole("button", { name: "Hủy phiên" })).toBeNull());
  expect(screen.getByText(VIA)).toBeInTheDocument();
});

test("lưu kết luận → WS state self_cancel_until = null → nút ẩn ngay", async () => {
  await openR2();
  act(() => setUntil(null));
  expect(screen.queryByRole("button", { name: "Hủy phiên" })).toBeNull();
  expect(screen.getByText(VIA)).toBeInTheDocument();
});

test("bấm Hủy phiên sát giờ, server từ chối 409 → đóng dialog + Toast + tải lại state", async () => {
  const user = userEvent.setup({ delay: null });
  await openR2();
  // Server: phiên mở từ 61 giây trước; FE vẫn thấy hạn (state cũ / lệch đồng hồ).
  stationSim.session!.started_at = new Date(Date.now() - 61_000).toISOString();
  act(() => setUntil(new Date(Date.now() + 30_000).toISOString()));

  await user.click(screen.getByRole("button", { name: "Hủy phiên" }));
  const dialog = await screen.findByRole("dialog", { name: "Hủy phiên" });
  await user.click(within(dialog).getByRole("button", { name: "Hủy phiên" }));

  expect(await screen.findByText("Phiên đã quá 60 giây. Bấm Gọi quản lý để hủy.")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByText("ĐANG KIỂM HÀNG HOÀN")).toBeInTheDocument();
  // API-10 tải lại → self_cancel_until = null theo server → nút ẩn.
  await waitFor(() => expect(screen.queryByRole("button", { name: "Hủy phiên" })).toBeNull());
  expect(stationSim.session).not.toBeNull();
});
