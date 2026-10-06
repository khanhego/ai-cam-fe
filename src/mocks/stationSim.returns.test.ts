/**
 * API client station mở rộng + MSW `StationSim` chế độ RETURN đúng contract 02 §6.2 v0.4 (T-131). Mock này thay BE
 * tới khi T-104..T-109 xong — các case dưới đây là kỳ vọng của TC tương ứng trong 04-test-cases, chạy trên mock.
 */
import { login, logout } from "@/lib/api/auth";
import { clipsApi } from "@/lib/api/clips";
import { isApiError, type ApiError } from "@/lib/api/errors";
import { stationApi, type ScanResult } from "@/lib/api/station";

import { findPackage, mockClaims, mockReturnCases } from "./returnsDb";
import { stationJobs } from "./handlers/station";
import { SNAPSHOT_MAX, stationSim } from "./stationSim";

let seq = 0;
const scan = (code: string) => stationApi.scan(code, `scan-${++seq}`);
const fail = async (p: Promise<unknown>): Promise<ApiError> => {
  try {
    await p;
  } catch (e) {
    if (isApiError(e)) return e;
    throw e;
  }
  throw new Error("expected ApiError");
};

async function returnMode(operator: string | null = "Lan QA") {
  await stationApi.setWorkMode("RETURN");
  if (operator) await stationApi.setOperator(operator);
}

/** Mở phiên hồ sơ 41 bằng mã chiều về và lưu kết luận. */
async function openAndConclude(conclusion: "OK" | "EMPTY_BOX") {
  const opened = await scan("SPXRTTST000041");
  const s = opened.state.session!;
  const lines = s.inspection!.lines.map((l) => ({
    order_item_id: l.order_item_id,
    quantity_received: conclusion === "OK" ? l.quantity_requested : 0,
    condition: conclusion === "OK" ? ("OK" as const) : ("MISSING_ITEM" as const),
    note: null,
  }));
  await stationApi.saveInspection(s.id, { conclusion, note: "", lines });
  return s;
}

beforeEach(async () => {
  await login("tst_station01", "matkhau123", "STATION");
});

test("API-10 mở rộng: station có kind / work_mode / operator_name + số hôm nay của hàng hoàn", async () => {
  const st = await stationApi.state();
  expect(st.station).toMatchObject({ kind: "BOTH", work_mode: "PACK", operator_name: null });
  expect(st).toMatchObject({ state: "READY", today_return_count: 0, today_return_issue_count: 0 });
});

test("TC-04.03: chế độ RETURN chưa có người kiểm → OPERATOR_REQUIRED, không mở phiên", async () => {
  await returnMode(null);
  const r = await scan("SPXRTTST000041");
  expect(r).toMatchObject({ outcome: "ALERT", alert: { code: "OPERATOR_REQUIRED" } });
  expect(r.state.session).toBeNull();
});

test("TC-04.02 / API-101: tên người kiểm 2–40 ký tự → 422 fields.name", async () => {
  await stationApi.setWorkMode("RETURN");
  const short = await fail(stationApi.setOperator("L"));
  expect(short).toMatchObject({ status: 422, code: "VALIDATION_ERROR" });
  expect(short.fieldErrors.name).toBeTruthy();
  expect((await fail(stationApi.setOperator("x".repeat(41)))).status).toBe(422);
  const ok = await stationApi.setOperator("  Lan QA  ");
  expect(ok.state.station.operator_name).toBe("Lan QA");
});

test("TC-04.34: station không phải 'Cả hai' đổi chế độ → 409 MODE_NOT_ALLOWED; TC-01.32: API-104 sai chế độ → WRONG_WORK_MODE", async () => {
  expect((await fail(stationApi.returnLookup("2410TST0004"))).code).toBe("WRONG_WORK_MODE");
  stationSim.kind = "PACK";
  expect(await fail(stationApi.setWorkMode("RETURN"))).toMatchObject({
    status: 409,
    code: "MODE_NOT_ALLOWED",
  });
});

test("TC-04.04 / TC-04.43: mã chiều về mở R2 — hồ sơ Khách trả hàng, dòng FULL, ảnh + clip lúc đóng gói", async () => {
  await returnMode();
  const r = await scan("SPXRTTST000041");
  expect(r.outcome).toBe("SESSION_OPENED");
  expect(r.state.state).toBe("INSPECTING");
  const s = r.state.session!;
  expect(s).toMatchObject({ type: "RETURN", operator_name: "Lan QA", flags: [] });
  expect(s.package.tracking_number).toBe("SPXTST0000041");
  expect(s.return_case).toMatchObject({
    code: "HH-000041",
    kind: "BUYER_RETURN",
    status: "INSPECTING",
    return_tracking_number: "SPXRTTST000041",
    reason_label: "Hàng bị hư",
    reason_text: "Áo bị rách ở tay",
  });
  expect(s.inspection).toMatchObject({ conclusion: null, lines_mode: "FULL", saved_at: null });
  expect(s.inspection!.lines[0]).toMatchObject({
    product_name: "Áo thun basic",
    quantity_sent: 2,
    quantity_requested: 2,
    quantity_received: 2,
    condition: "OK",
  });
  expect(s.pack_reference?.clips).toHaveLength(2);
  expect(s.pack_reference?.snapshot?.url).toMatch(/^\/api\/v1\/media\/snapshots\//);
  expect(findPackage("pkg-0000041")!.warehouse_status).toBe("RETURN_INSPECTING");
});

test("TC-04.05 / TC-04.06: mã vận đơn gốc và mã đơn sàn mở cùng hồ sơ (không tạo hồ sơ mới)", async () => {
  await returnMode();
  const before = mockReturnCases.length;
  const r = await scan("2410TST00041");
  expect(r.state.session?.return_case?.code).toBe("HH-000041");
  expect(mockReturnCases).toHaveLength(before);
});

test("TC-04.16 / TC-04.17: API-102 chặn BR-22 và 'Khác' thiếu ghi chú; hợp lệ → saved_at", async () => {
  await returnMode();
  const s = (await scan("SPXRTTST000041")).state.session!;
  const id = s.inspection!.lines[0]!.order_item_id;
  const short = [{ order_item_id: id, quantity_received: 1, condition: "OK" as const, note: null }];
  expect(
    await fail(stationApi.saveInspection(s.id, { conclusion: "OK", note: "", lines: short })),
  ).toMatchObject({
    status: 422,
    code: "CONCLUSION_INCONSISTENT",
  });
  const other = await fail(stationApi.saveInspection(s.id, { conclusion: "OTHER", note: "", lines: short }));
  expect(other.fieldErrors.note).toBeTruthy();
  const bad = [{ order_item_id: id, quantity_received: 1000, condition: "OK" as const, note: null }];
  expect(
    (await fail(stationApi.saveInspection(s.id, { conclusion: null, note: "", lines: bad }))).fieldErrors,
  ).toHaveProperty("lines.0.quantity_received");
  const ok = await stationApi.saveInspection(s.id, { conclusion: "MISSING_ITEM", note: "", lines: short });
  expect(ok.inspection).toMatchObject({ conclusion: "MISSING_ITEM", lines: [{ quantity_received: 1 }] });
  expect(ok.inspection.saved_at).toBeTruthy();
});

test("TC-04.18 / TC-04.20: quét đóng khi chưa kết luận → INSPECTION_REQUIRED; mã khác hồ sơ → RETURN_CODE_DIFFERENT", async () => {
  await returnMode();
  await scan("SPXRTTST000041");
  expect((await scan("SPXRTTST000041")).alert?.code).toBe("INSPECTION_REQUIRED");
  const diff = await scan("SPXTST0000042");
  expect(diff.alert).toMatchObject({ code: "RETURN_CODE_DIFFERENT", data: { code: "SPXTST0000042" } });
  expect(diff.alert?.data.expected_codes).toEqual(
    expect.arrayContaining(["SPXRTTST000041", "SPXTST0000041"]),
  );
  expect(diff.state.state).toBe("INSPECTING");
});

test("TC-04.19: đóng bằng mã gốc cùng hồ sơ, Nguyên vẹn → R1 + closed_session, kiện / hồ sơ RECEIVED_OK", async () => {
  await returnMode();
  await openAndConclude("OK");
  const r: ScanResult = await scan("SPXTST0000041");
  expect(r.outcome).toBe("SESSION_COMPLETED");
  expect(r.state.state).toBe("READY");
  expect(r.closed_session).toMatchObject({
    type: "RETURN",
    tracking_number: "SPXRTTST000041", // BE: mã đã quét để mở (open_code)
    conclusion: "OK",
    claim_code: null,
    package_status: "RETURN_RECEIVED_OK",
    return_case_status: "RECEIVED_OK",
  });
  expect(r.state.today_return_count).toBe(1);
});

test("TC-04.21: kết luận Hộp rỗng → hồ sơ khiếu nại tự tạo; API-15 có type / conclusion / claim_code", async () => {
  await returnMode();
  await openAndConclude("EMPTY_BOX");
  const r = await scan("SPXRTTST000041");
  expect(r.closed_session).toMatchObject({
    conclusion: "EMPTY_BOX",
    package_status: "RETURN_RECEIVED_ISSUE",
  });
  expect(r.closed_session?.claim_code).toMatch(/^KN-\d{6}$/);
  const claim = mockClaims.find((c) => c.code === r.closed_session?.claim_code)!;
  expect(claim).toMatchObject({
    type: "EMPTY_BOX",
    counterparty: "PLATFORM",
    source: "AUTO_RETURN",
    status: "NEW",
  });
  expect(r.state.today_return_issue_count).toBe(1);
  const recent = await stationApi.recent();
  expect(recent.items[0]).toMatchObject({
    type: "RETURN",
    conclusion: "EMPTY_BOX",
    claim_code: claim.code,
  });
});

test("TC-04.08 / TC-04.09: mã lạ → RETURN_NOT_FOUND; API-105 mở phiên chưa xác định trên kiện tạm TAM-", async () => {
  await returnMode();
  const nf = await scan("SPXVN0000000000");
  expect(nf.alert).toMatchObject({
    code: "RETURN_NOT_FOUND",
    data: { code: "SPXVN0000000000", can_open_unidentified: true },
  });
  const r = await stationApi.openReturnSession({
    unidentified_code: "SPXVN0000000000",
    client_scan_id: "u-1",
  });
  expect(r.outcome).toBe("SESSION_OPENED");
  expect(r.state.session?.package.tracking_number).toMatch(/^TAM-\d{6}$/);
  expect(r.state.session?.return_case?.kind).toBe("UNIDENTIFIED");
  expect(r.state.session?.inspection?.lines).toEqual([]);
  expect(r.state.session?.flags).toContain("UNIDENTIFIED");
});

test("TC-04.10: kiện chưa gửi đi (PACKED) → NOT_SHIPPED", async () => {
  await returnMode();
  const r = await scan("SPXTST0000010");
  expect(r.alert).toMatchObject({ code: "NOT_SHIPPED", data: { warehouse_status: "PACKED" } });
  expect(r.alert?.message).toContain("Đây không phải hàng hoàn");
});

test("TC-04.11 / TC-04.12: kiện đã nhận → can_record_other; force_new cần ghi chú, chỉ nhận khi kiện đã nhận", async () => {
  await returnMode();
  const r = await scan("SPXTST0000053");
  expect(r.alert).toMatchObject({
    code: "RETURN_ALREADY_RECEIVED",
    data: { conclusion: "EMPTY_BOX", can_record_other: true },
  });
  const noNote = await fail(
    stationApi.openReturnSession({
      unidentified_code: "SPXTST0000053",
      client_scan_id: "f-1",
      force_new: true,
      note: "ab",
    }),
  );
  expect(noNote.fieldErrors.note).toBeTruthy();
  const notAllowed = await fail(
    stationApi.openReturnSession({
      unidentified_code: "SPXTST0000042",
      client_scan_id: "f-2",
      force_new: true,
      note: "thử thôi",
    }),
  );
  expect(notAllowed).toMatchObject({ status: 409, code: "FORCE_NEW_NOT_ALLOWED" });
  expect(notAllowed.details.reason).not.toBe("RETURN_ALREADY_RECEIVED");
  const ok = await stationApi.openReturnSession({
    unidentified_code: "SPXTST0000053",
    client_scan_id: "f-3",
    force_new: true,
    note: "Kiện thứ hai cùng mã",
  });
  expect(ok.state.session?.return_case?.kind).toBe("UNIDENTIFIED");
});

test("TC-04.13: mã đơn có 2 kiện (giao thất bại) → RETURN_MULTIPLE_PACKAGES; R3 tìm ra 2 kiện", async () => {
  await returnMode();
  const r = await scan("2410TST00043");
  expect(r.alert).toMatchObject({
    code: "RETURN_MULTIPLE_PACKAGES",
    data: { platform_order_sn: "2410TST00043" },
  });
  const found = await stationApi.returnLookup("2410tst00043");
  expect(found.items.map((i) => i.tracking_number).sort()).toEqual(["SPXTST0000043-1", "SPXTST0000043-2"]);
  expect(found.items.every((i) => i.can_open && i.return_case?.kind === "FAILED_DELIVERY")).toBe(true);
});

test("TC-04.48: giao thất bại đơn 2 kiện → lines_mode REFERENCE, Nguyên vẹn không bị BR-22 chặn; hồ sơ PARTIALLY_RECEIVED", async () => {
  await returnMode();
  const s = (await scan("SPXTST0000043-1")).state.session!;
  expect(s.inspection?.lines_mode).toBe("REFERENCE");
  await stationApi.saveInspection(s.id, { conclusion: "OK", note: "", lines: [] });
  const r = await scan("SPXTST0000043-1");
  expect(r.closed_session?.return_case_status).toBe("PARTIALLY_RECEIVED");
  expect(findPackage("pkg-0000043-2")!.warehouse_status).toBe("RETURN_EXPECTED");
});

test("TC-04.51 / TC-04.52: trả trọn đơn → cả 2 kiện nhận; trả một phần → kiện còn lại rời hồ sơ, về trạng thái trước", async () => {
  await returnMode();
  for (const [code, pkg2, expected] of [
    ["SPXRTTST000047", "pkg-0000047-2", "RETURN_RECEIVED_OK"],
    ["SPXRTTST000048", "pkg-0000048-2", "DELIVERED"],
  ] as const) {
    const s = (await scan(code)).state.session!;
    await stationApi.saveInspection(s.id, {
      conclusion: "OK",
      note: "",
      lines: s.inspection!.lines.map((l) => ({
        order_item_id: l.order_item_id,
        quantity_received: l.quantity_requested,
        condition: "OK" as const,
        note: null,
      })),
    });
    const r = await scan(code);
    expect(r.closed_session?.return_case_status).toBe("RECEIVED_OK");
    expect(findPackage(pkg2)!.warehouse_status).toBe(expected);
  }
});

test("TC-04.44: đơn trước khi dùng hệ thống → pack_reference null + cờ NO_PACK_CLIP", async () => {
  await returnMode();
  const s = (await scan("SPXTST0000050")).state.session!;
  expect(s.pack_reference).toBeNull();
  expect(s.flags).toContain("NO_PACK_CLIP");
});

test("TC-04.14: kiện đang kiểm ở station khác → RETURN_IN_PROGRESS_ELSEWHERE", async () => {
  await returnMode();
  expect((await scan("SPXTST0000055")).alert).toMatchObject({
    code: "RETURN_IN_PROGRESS_ELSEWHERE",
    data: { station_name: "TST Station 02" },
  });
});

test("TC-04.24: hủy phiên hoàn (lý do RETURN) → kiện về trạng thái trước, hồ sơ về Đang về; lý do PACK bị từ chối", async () => {
  await returnMode();
  const s = (await scan("SPXRTTST000041")).state.session!;
  expect((await fail(stationApi.cancel(s.id, "OUT_OF_STOCK"))).status).toBe(422);
  const r = await stationApi.cancel(s.id, "NOT_A_RETURN");
  expect(r.state.state).toBe("READY");
  expect(findPackage("pkg-0000041")!.warehouse_status).toBe("RETURN_EXPECTED");
  expect(mockReturnCases.find((c) => c.code === "HH-000041")!.status).toBe("EXPECTED");
});

test("TC-04.33: đổi chế độ / người kiểm khi đang có phiên → 409 SESSION_ACTIVE", async () => {
  await returnMode();
  await scan("SPXRTTST000041");
  expect((await fail(stationApi.setWorkMode("PACK"))).code).toBe("SESSION_ACTIVE");
  expect((await fail(stationApi.setOperator("Minh"))).code).toBe("SESSION_ACTIVE");
});

test("TC-04.40 / TC-04.41 / TC-04.42: API-103 ảnh 201 có sha256; tối đa 20 → SNAPSHOT_LIMIT; Cam 1 offline → CAMERA_UNREACHABLE", async () => {
  await returnMode();
  const s = (await scan("SPXRTTST000041")).state.session!;
  const first = await stationApi.takeSnapshot(s.id);
  expect(first.snapshot).toMatchObject({ kind: "MANUAL", camera_role: "CAM1" });
  expect(first.snapshot.sha256).toHaveLength(64);
  for (let i = 1; i < SNAPSHOT_MAX; i++) await stationApi.takeSnapshot(s.id);
  expect(await fail(stationApi.takeSnapshot(s.id))).toMatchObject({
    code: "SNAPSHOT_LIMIT",
    details: { max: 20 },
  });
  expect((await stationApi.state()).session?.snapshots).toHaveLength(SNAPSHOT_MAX);
  stationSim.session!.snapshots = [];
  stationSim.cameras = [
    { role: "CAM1", status: "OFFLINE" },
    { role: "CAM2", status: "ONLINE" },
  ];
  expect(await fail(stationApi.takeSnapshot(s.id))).toMatchObject({
    status: 422,
    code: "CAMERA_UNREACHABLE",
  });
});

test("TC-04.45 / TC-04.46: tìm thủ công theo tiền tố ≥ 6 ký tự; < 4 ký tự → 422", async () => {
  await returnMode();
  const r = await stationApi.returnLookup("2410TST0004");
  expect(r.items.map((i) => i.tracking_number)).toContain("SPXTST0000041");
  expect(r.items.length).toBeLessThanOrEqual(10);
  expect((await fail(stationApi.returnLookup("241"))).code).toBe("VALIDATION_ERROR");
  const opened = await stationApi.openReturnSession({ package_id: "pkg-0000041", client_scan_id: "l-1" });
  expect(opened.state.session?.return_case?.code).toBe("HH-000041");
  expect(
    (await fail(stationApi.openReturnSession({ package_id: "pkg-x", client_scan_id: "l-2" }))).code,
  ).toBe("SESSION_ACTIVE");
});

test("API-105: package_id không tồn tại → 404; kiện bị chặn → 200 ALERT như API-11", async () => {
  await returnMode();
  expect(
    (await fail(stationApi.openReturnSession({ package_id: "pkg-x", client_scan_id: "n-1" }))).status,
  ).toBe(404);
  const blocked = await stationApi.openReturnSession({ package_id: "pkg-0000010", client_scan_id: "n-2" });
  expect(blocked).toMatchObject({ outcome: "ALERT", alert: { code: "NOT_SHIPPED" } });
});

test("TC-04.26 / TC-04.27 (mock J-07): đã lưu kết luận → SESSION_AUTO_CLOSED cờ AUTO_CLOSED; chưa → SESSION_ABANDONED", async () => {
  await returnMode();
  await openAndConclude("EMPTY_BOX");
  const auto = stationJobs.expireReturnSession();
  expect(auto).toMatchObject({ code: "SESSION_AUTO_CLOSED", tracking_number: "SPXRTTST000041" });
  expect(auto && "closed_session" in auto && auto.closed_session.flags).toContain("AUTO_CLOSED");
  await scan("SPXTST0000042");
  expect(stationJobs.expireReturnSession()).toMatchObject({ code: "SESSION_ABANDONED" });
  expect(findPackage("pkg-0000042")!.warehouse_status).toBe("RETURN_EXPECTED");
});

test("TC-04.53: kiện hoàn quét ở bàn đóng gói → ALREADY_HANDED_OVER kèm is_return", async () => {
  const r = await scan("SPXTST0000049");
  expect(r.alert).toMatchObject({ code: "ALREADY_HANDED_OVER", data: { is_return: true } });
  expect(r.alert?.message).toContain("kiện hàng hoàn");
});

test("FR-03.14: đóng phiên PACK trả closed_session; FR-03.15 hook đơn hủy gắn cờ ORDER_CANCELLED → CANCELLED_AFTER_PACK", async () => {
  await scan("SPXTST0000001");
  expect(stationJobs.orderCancelled()).toMatchObject({ code: "ORDER_CANCELLED_DURING_SESSION" });
  const r = await scan("SPXTST0000001");
  expect(r.closed_session).toMatchObject({
    type: "PACK",
    tracking_number: "SPXTST0000001",
    package_status: "CANCELLED_AFTER_PACK",
  });
  expect(r.closed_session?.flags).toContain("ORDER_CANCELLED");
});

test("TC-P2.04: STATION xem clip đóng gói chỉ khi phiên hoàn của kiện đang hoạt động", async () => {
  await returnMode();
  const s = (await scan("SPXRTTST000041")).state.session!;
  const clipId = s.pack_reference!.clips[0]!.id;
  expect((await clipsApi.playUrl(clipId)).url).toBeTruthy();
  expect((await fail(clipsApi.playUrl("clip-0000001-1-1"))).status).toBe(403);
  await stationApi.cancel(s.id, "WRONG_SCAN");
  expect((await fail(clipsApi.playUrl(clipId))).status).toBe(403);
});

test("TC-04.35: đăng xuất station xóa người kiểm (BR-28)", async () => {
  await returnMode();
  await logout();
  await login("tst_station01", "matkhau123", "STATION");
  expect((await stationApi.state()).station.operator_name).toBeNull();
});

test("TC-04.31: ASSIST từ phiên hoàn — CLOSE_WITH_NOTE bị từ chối, MISMATCH / REPACK không hợp lệ", async () => {
  await returnMode();
  const s = (await scan("SPXRTTST000041")).state.session!;
  expect(stationSim.requestApproval({ type: "MISMATCH", session_id: s.id })).toBe("NOT_ELIGIBLE");
  expect(stationSim.requestApproval({ type: "ASSIST", session_id: s.id })).toBeNull();
  expect((await stationApi.state()).state).toBe("WAITING_APPROVAL");
  expect(stationSim.decide(stationSim.approval!.id, "CLOSE_WITH_NOTE")).toBe("INVALID_ACTION");
  expect(stationSim.decide(stationSim.approval!.id, "CONTINUE")).toBeNull();
  expect((await stationApi.state()).state).toBe("INSPECTING");
});
