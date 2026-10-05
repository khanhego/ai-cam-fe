import { http, HttpResponse } from "msw";

import { login } from "@/lib/api/auth";
import { stationSim } from "@/mocks/stationSim";
import { server } from "@/test/server";
import { useToastStore } from "@/shared/ui";

import { sound } from "./sound";
import { ALERT_MS, resetStationStore, useStationStore } from "./stationStore";

const play = vi.spyOn(sound, "play").mockImplementation(() => {});
const stop = vi.spyOn(sound, "stop").mockImplementation(() => {});

beforeEach(async () => {
  resetStationStore();
  play.mockClear();
  stop.mockClear();
  await login("tst_station01", "matkhau123", "STATION");
});

const store = () => useStationStore.getState();

test("mở rồi đóng phiên: state thay toàn bộ + bíp ok", async () => {
  await store().scan("SPXTST0000001");
  expect(store().state?.state).toBe("PACKING");
  expect(play).toHaveBeenLastCalledWith("ok");

  await store().scan("SPXTST0000001");
  expect(store().state?.state).toBe("READY");
  expect(store().state?.today_count).toBe(1);
});

test("cảnh báo: 2 bíp và tự đóng sau 5 giây", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    await store().scan("SPXTST0000009");
    expect(store().alert?.code).toBe("ORDER_CANCELLED");
    expect(play).toHaveBeenLastCalledWith("warn");

    vi.advanceTimersByTime(ALERT_MS);
    expect(store().alert).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("lệch mã: âm lỗi lặp, sửa đúng thì tắt", async () => {
  await store().scan("SPXTST0000001");
  await store().scan("SPXTST0000002");
  expect(store().state?.state).toBe("MISMATCH");
  expect(play).toHaveBeenLastCalledWith("error", { loop: true });

  await store().scan("SPXTST0000001");
  expect(stop).toHaveBeenCalled();
  expect(store().state?.state).toBe("READY");
});

test("quét lúc đang chờ API được xếp hàng, giữ thứ tự mở → đóng", async () => {
  const first = store().scan("SPXTST0000003");
  const second = store().scan("SPXTST0000003");
  await Promise.all([first, second]);
  await vi.waitFor(() => expect(store().busy).toBe(false));

  expect(store().state?.today_count).toBe(1);
  expect(store().state?.state).toBe("READY");
});

test("lỗi mạng: retry cùng client_scan_id, thành công thì không mất lần quét", async () => {
  const ids: string[] = [];
  let calls = 0;
  server.use(
    http.post("/api/v1/station/scan", async ({ request }) => {
      const body = (await request.json()) as { code: string; client_scan_id: string };
      ids.push(body.client_scan_id);
      calls += 1;
      if (calls < 3) return HttpResponse.error();
      return HttpResponse.json(stationSim.scan(body.code, body.client_scan_id));
    }),
  );

  await store().scan("SPXTST0000004");

  expect(ids).toHaveLength(3);
  expect(new Set(ids).size).toBe(1);
  expect(store().state?.state).toBe("PACKING");
  expect(store().disconnected).toBe(false);
});

test("hết lượt retry → mất kết nối (S6)", async () => {
  server.use(http.post("/api/v1/station/scan", () => HttpResponse.error()));

  await store().scan("SPXTST0000005");

  expect(store().disconnected).toBe(true);
});

test("IGNORED khi chờ duyệt → toast", async () => {
  server.use(
    http.post("/api/v1/station/scan", () =>
      HttpResponse.json({
        outcome: "IGNORED",
        alert: null,
        state: { ...stationSim.state(), state: "WAITING_APPROVAL" },
      }),
    ),
  );

  await store().scan("SPXTST0000006");

  expect(useToastStore.getState().items.at(-1)?.message).toBe("Đang chờ duyệt.");
  useToastStore.setState({ items: [] });
});
