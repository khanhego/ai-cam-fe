import { http, HttpResponse } from "msw";

import { login } from "@/lib/api/auth";
import { stationSim } from "@/mocks/stationSim";
import { server } from "@/test/server";
import { useToastStore } from "@/shared/ui";

import { sound } from "./sound";
import {
  ALERT_MS,
  MULTIPLE_TO_LOOKUP_MS,
  RETURN_ALERT_MS,
  resetStationStore,
  useStationStore,
} from "./stationStore";

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

describe("item 02 — chế độ nhận hoàn", () => {
  beforeEach(() => {
    stationSim.workMode = "RETURN";
    stationSim.operatorName = "Lan QA";
  });

  test("R4 tự đóng sau 8 giây (DEC-238), không phải 5 giây", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      await store().scan("SPXTST0000010");
      expect(store().alert?.code).toBe("NOT_SHIPPED");
      vi.advanceTimersByTime(ALERT_MS);
      expect(store().alert).not.toBeNull();
      vi.advanceTimersByTime(RETURN_ALERT_MS - ALERT_MS);
      expect(store().alert).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test("RETURN_NOT_FOUND không tự đóng (có nút); RETURN_MULTIPLE_PACKAGES 1,5 giây → mở R3 với mã đơn", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      await store().scan("SPXVN0000000000");
      vi.advanceTimersByTime(RETURN_ALERT_MS * 2);
      expect(store().alert?.code).toBe("RETURN_NOT_FOUND");

      await store().scan("2410TST00043");
      expect(store().alert?.code).toBe("RETURN_MULTIPLE_PACKAGES");
      vi.advanceTimersByTime(MULTIPLE_TO_LOOKUP_MS);
      expect(store().alert).toBeNull();
      expect(store().lookup).toEqual({ query: "2410TST00043" });
    } finally {
      vi.useRealTimers();
    }
  });

  test("OPERATOR_REQUIRED mở R5, không overlay", async () => {
    stationSim.operatorName = null;
    await store().scan("SPXRTTST000041");
    expect(store().alert).toBeNull();
    expect(store().operatorOpen).toBe(true);
  });

  test("quét đóng khi nháp chưa lưu: chờ API-102 xong rồi mới API-11 (DEC-235)", async () => {
    const order: string[] = [];
    server.events.on("request:end", ({ request }) => {
      if (request.url.includes("/inspection")) order.push("API-102");
      if (request.url.endsWith("/station/scan")) order.push("API-11");
    });
    await store().scan("SPXRTTST000041");
    store().editDraft({ conclusion: "OK" });
    expect(store().draft?.dirty).toBe(true);

    await store().scan("SPXRTTST000041");

    expect(store().state?.state).toBe("READY");
    expect(store().closedNotice).toMatchObject({ type: "RETURN", conclusion: "OK" });
    expect(order).toEqual(["API-11", "API-102", "API-11"]);
    server.events.removeAllListeners();
  });

  test("G3-F17: API-102 lỗi mạng → thử lại sau 500 ms rồi 1500 ms", async () => {
    await store().scan("SPXRTTST000041");
    const at: number[] = [];
    server.use(
      http.put("/api/v1/station/sessions/:id/inspection", () => {
        at.push(Date.now());
        return HttpResponse.error();
      }),
    );
    store().editDraft({ conclusion: "OK" });

    await store().flushDraft();

    expect(at).toHaveLength(3);
    expect(at[1]! - at[0]!).toBeGreaterThanOrEqual(450);
    expect(at[2]! - at[1]!).toBeGreaterThanOrEqual(1450);
    expect(store().draft?.saveStatus).toBe("error");
  });
});
