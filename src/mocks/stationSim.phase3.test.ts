/**
 * Item 03 (T-231): kiểu `lib/api/station.ts` + MSW `StationSim` đúng contract 02 §6.2 "API-10 / API-11 / API-12 mở rộng"
 * và API-104 (02b-station §12). Mock thay BE tới khi T-212 / T-213 / T-271 xong.
 */
import { login } from "@/lib/api/auth";
import { isApiError, type ApiError } from "@/lib/api/errors";
import { stationApi, type ReturnMultipleOrdersData } from "@/lib/api/station";

import { stationJobs } from "./handlers/station";
import { DUP_ORDER_SN, SELF_CANCEL_MS, stationSim } from "./stationSim";

let seq = 0;
const scan = (code: string) => stationApi.scan(code, `p3-scan-${++seq}`);
const fail = async (p: Promise<unknown>): Promise<ApiError> => {
  try {
    await p;
  } catch (e) {
    if (isApiError(e)) return e;
    throw e;
  }
  throw new Error("expected ApiError");
};

beforeEach(async () => {
  await login("tst_station01", "matkhau123", "STATION");
});

describe("API-10 / API-11 chế độ đóng gói", () => {
  test("station có operator_required (mặc định false); phiên PACK có self_cancel_until = null", async () => {
    const st = await stationApi.state();
    expect(st.station.operator_required).toBe(false);
    const r = await scan("SPXTST0000001");
    expect(r.outcome).toBe("SESSION_OPENED");
    expect(r.state.session).toMatchObject({ type: "PACK", self_cancel_until: null });
  });

  test("TC-03.80: kiện Shopee / TikTok có sàn + tên shop; mỗi dòng sản phẩm có platform_order_sn", async () => {
    const a = await scan("SPXTST0000001");
    expect(a.state.session!.package.order).toMatchObject({
      platform: "SHOPEE",
      shop_name: "TST Shop A",
      platform_order_sn: "2410TST0000001",
      merged_orders: [],
    });
    expect(a.state.session!.package.items.every((i) => i.platform_order_sn === "2410TST0000001")).toBe(true);
    await scan("SPXTST0000001");

    const b = await scan("SPXTSTB000000001");
    expect(b.state.session!.package.order).toMatchObject({ platform: "SHOPEE", shop_name: "TST B" });
    await scan("SPXTSTB000000001");

    const t = await scan("TTTST0000000013");
    expect(t.state.session!.package.order).toMatchObject({
      platform: "TIKTOK",
      shop_name: "TST TikTok A (mock)",
    });
  });

  test("kiện chưa xác minh → order null (FE 'Chưa rõ sàn')", async () => {
    const r = await scan("SPXVN0000000001");
    expect(r.state.session).toMatchObject({ flags: ["UNVERIFIED"], package: { order: null, items: [] } });
  });

  test("TC-03.83: kiện gộp 2 đơn → merged_orders + đơn của từng dòng", async () => {
    const r = await scan("TTTST0000000077");
    const pkg = r.state.session!.package;
    expect(pkg.order!.merged_orders).toEqual([{ platform_order_sn: "5761TT0000000772" }]);
    expect(pkg.items.map((i) => i.platform_order_sn)).toEqual(["5761TT0000000771", "5761TT0000000772"]);
  });

  test("TC-03.85: đơn đang yêu cầu hủy → ALERT ORDER_CANCEL_REQUESTED, không mở phiên", async () => {
    const r = await scan("TTTST0000000050");
    expect(r).toMatchObject({
      outcome: "ALERT",
      alert: { code: "ORDER_CANCEL_REQUESTED", data: { platform: "TIKTOK" } },
    });
    expect(r.state.session).toBeNull();
  });

  test("TC-03.87: đơn đã hủy → ORDER_CANCELLED, câu chữ không còn 'Shopee'", async () => {
    for (const code of ["TTTST0000000053", "SPXTST0000009"]) {
      const r = await scan(code);
      expect(r.alert).toMatchObject({
        code: "ORDER_CANCELLED",
        message: `${code} đã bị hủy trên sàn. Không đóng gói.`,
      });
      expect(r.alert!.message).not.toContain("Shopee");
    }
  });

  test("TC-03.88: yêu cầu hủy tới khi đang đóng → cờ ORDER_CANCEL_REQUESTED, phiên vẫn đóng được", async () => {
    await scan("TTTST0000000051");
    expect(stationJobs.orderCancelRequested("TTTST0000000051")).toBe(true);
    expect(stationJobs.orderCancelRequested("TTTST0000000051")).toBe(false);
    const st = await stationApi.state();
    expect(st.session!.flags).toContain("ORDER_CANCEL_REQUESTED");
    const done = await scan("TTTST0000000051");
    expect(done.outcome).toBe("SESSION_COMPLETED");
    expect(done.closed_session!.package_status).toBe("PACKED");
  });

  test("FR-03.16: bắt buộc tên người đóng gói → OPERATOR_REQUIRED {mode: PACK}; có tên → phiên chép tên", async () => {
    stationSim.operatorRequired = true;
    expect((await stationApi.state()).station.operator_required).toBe(true);
    const r = await scan("SPXTST0000002");
    expect(r).toMatchObject({
      outcome: "ALERT",
      alert: {
        code: "OPERATOR_REQUIRED",
        message: "Nhập tên người đóng gói trước khi đóng gói.",
        data: { mode: "PACK" },
      },
    });
    expect(r.state.session).toBeNull();
    await stationApi.setOperator("Minh");
    const ok = await scan("SPXTST0000002");
    expect(ok.state.session).toMatchObject({ type: "PACK", operator_name: "Minh" });
  });
});

describe("chế độ nhận hàng hoàn", () => {
  beforeEach(async () => {
    await stationApi.setWorkMode("RETURN");
  });

  test("OPERATOR_REQUIRED ở RETURN có data.mode = RETURN", async () => {
    const r = await scan("SPXRTTST000041");
    expect(r.alert).toMatchObject({ code: "OPERATOR_REQUIRED", data: { mode: "RETURN" } });
  });

  test("TC-04.74: mã đơn trùng 2 shop → RETURN_MULTIPLE_ORDERS với code + orders, không mở phiên", async () => {
    await stationApi.setOperator("Lan QA");
    const r = await scan(DUP_ORDER_SN);
    expect(r.outcome).toBe("ALERT");
    expect(r.alert).toMatchObject({
      code: "RETURN_MULTIPLE_ORDERS",
      message: `Mã ${DUP_ORDER_SN} có ở 2 đơn của các shop khác nhau. Chọn đúng đơn.`,
    });
    const data = r.alert!.data as ReturnMultipleOrdersData;
    expect(data.code).toBe(DUP_ORDER_SN);
    expect(data.orders).toEqual([
      { platform: "SHOPEE", shop_name: "TST B", platform_order_sn: DUP_ORDER_SN },
      { platform: "TIKTOK", shop_name: "TST TikTok A (mock)", platform_order_sn: DUP_ORDER_SN },
    ]);
    expect(r.state.session).toBeNull();
  });

  test("API-104: item có platform + shop_name", async () => {
    await stationApi.setOperator("Lan QA");
    const res = await stationApi.returnLookup("2410TST00041");
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.items[0]).toMatchObject({ platform: "SHOPEE", shop_name: "TST Shop A" });
  });

  describe("BR-37 luật hủy 60 giây", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    test("self_cancel_until = started_at + 60 giây; hủy trước hạn được", async () => {
      await stationApi.setOperator("Lan QA");
      const r = await scan("SPXRTTST000041");
      const s = r.state.session!;
      expect(Date.parse(s.self_cancel_until!) - Date.parse(s.started_at)).toBe(SELF_CANCEL_MS);
      vi.setSystemTime(Date.parse(s.started_at) + SELF_CANCEL_MS - 100);
      const res = await stationApi.cancel(s.id, "WRONG_SCAN");
      expect(res.state.session).toBeNull();
    });

    test("TC (AC-62): đúng giây 60 → 409 CANCEL_REQUIRES_SUPERVISOR, phiên vẫn mở", async () => {
      await stationApi.setOperator("Lan QA");
      const s = (await scan("SPXRTTST000041")).state.session!;
      vi.setSystemTime(Date.parse(s.started_at) + SELF_CANCEL_MS);
      const e = await fail(stationApi.cancel(s.id, "WRONG_SCAN"));
      expect(e).toMatchObject({
        status: 409,
        code: "CANCEL_REQUIRES_SUPERVISOR",
        message: "Phiên đã quá 60 giây. Bấm Gọi quản lý để hủy.",
      });
      expect((await stationApi.state()).session?.id).toBe(s.id);
    });

    test("lưu kết luận / chụp ảnh tay → self_cancel_until = null, hủy → 409 dù còn trong 60 giây", async () => {
      await stationApi.setOperator("Lan QA");
      const s = (await scan("SPXRTTST000041")).state.session!;
      await stationApi.takeSnapshot(s.id);
      expect((await stationApi.state()).session!.self_cancel_until).toBeNull();
      expect((await fail(stationApi.cancel(s.id, "WRONG_SCAN"))).code).toBe("CANCEL_REQUIRES_SUPERVISOR");
    });
  });
});

test("isApiError helper vẫn đúng khi mock trả 409 có message server", async () => {
  // Phòng hồi quy: lỗi 409 của API-12 đi qua khung lỗi 02 §6 (không phải lỗi mạng).
  await stationApi.setWorkMode("RETURN");
  await stationApi.setOperator("Lan QA");
  const s = (await scan("SPXRTTST000041")).state.session!;
  stationSim.session!.started_at = new Date(Date.now() - 2 * SELF_CANCEL_MS).toISOString();
  const e = await fail(stationApi.cancel(s.id, "OTHER", "Thử lại"));
  expect(isApiError(e)).toBe(true);
});
