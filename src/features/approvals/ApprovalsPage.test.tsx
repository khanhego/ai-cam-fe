/**
 * D13 Yêu cầu duyệt (01 §10.5, FR-03.10, 03.12, UC-08) trên MSW — phần dashboard của TC-03.40..03.54.
 * Station giả (`stationSim`) chạy cùng tiến trình nên kiểm được station đổi trạng thái sau quyết định.
 */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { login } from "@/lib/api/auth";
import { closedApprovals, mockApprovals, resolveMockApproval } from "@/mocks/handlers/approvals";
import { apiError } from "@/mocks/http";
import { stationSim } from "@/mocks/stationSim";
import { fmtHourMinute } from "@/shared/format";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

const card = async (station: string) =>
  (await screen.findByRole("heading", { name: station })).closest("article")!;

/** Station 01 (giả): quét …01 rồi …02 → LỆCH MÃ → gửi duyệt MISMATCH (TC-03.40 bước 1–3). */
function stationSendsMismatch() {
  stationSim.scan("SPXTST0000001", "s1");
  stationSim.scan("SPXTST0000002", "s2");
  expect(stationSim.requestApproval({ type: "MISMATCH", session_id: stationSim.session!.id })).toBeNull();
}

test("TC-03.40: Lệch mã — thẻ đủ thông tin, badge, Cho tiếp tục → station về ĐANG ĐÓNG GÓI", async () => {
  stationSendsMismatch();
  await login("tst_sup", "matkhau123", "DASHBOARD");
  const user = userEvent.setup();
  renderApp("/admin/approvals");

  const row = await card("TST Station 01");
  expect(within(row).getByText("Lệch mã")).toBeInTheDocument();
  expect(within(row).getByText("SPXTST0000001")).toBeInTheDocument();
  expect(within(row).getByText("Vừa quét")).toBeInTheDocument();
  expect(within(row).getByText("SPXTST0000002")).toBeInTheDocument();
  expect(within(row).getByText("Vừa gửi")).toBeInTheDocument();
  // Badge drawer: yêu cầu của Station 01 + yêu cầu seed của Station 02.
  expect(
    await screen.findByRole("link", { name: /^Yêu cầu duyệt\s*,\s*2 yêu cầu đang chờ$/ }),
  ).toBeInTheDocument();

  await user.click(within(row).getByRole("button", { name: "Cho tiếp tục" }));

  expect(await screen.findByText("Đã cho station tiếp tục.")).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: "TST Station 01" })).not.toBeInTheDocument(),
  );
  expect(stationSim.state().state).toBe("PACKING");
  expect(
    await screen.findByRole("link", { name: /^Yêu cầu duyệt\s*,\s*1 yêu cầu đang chờ$/ }),
  ).toBeInTheDocument();
});

test("TC-03.43 / 03.44: Cam 2 còn thấy phiếu sai → khóa Đóng phiên có ghi chú, cảnh báo, Cho tiếp tục vẫn bấm được", async () => {
  await login("tst_sup", "matkhau123", "DASHBOARD");
  renderApp("/admin/approvals");

  const row = await card("TST Station 02");
  expect(within(row).getByText("Cam 2 thấy")).toBeInTheDocument();
  expect(
    within(row).getByText("Cam 2 vẫn thấy phiếu sai, Cho tiếp tục sẽ đưa station về Lệch mã."),
  ).toBeInTheDocument();
  expect(within(row).getByRole("button", { name: "Đóng phiên có ghi chú" })).toBeDisabled();
  expect(within(row).getByRole("button", { name: "Cho tiếp tục" })).toBeEnabled();
  expect(within(row).getByRole("button", { name: "Hủy phiên" })).toBeEnabled();
  expect(within(row).getByText("Chờ 3 phút")).toBeInTheDocument();
});

test("TC-03.43: server trả TRAY_STILL_DIFFERENT → Alert trên thẻ", async () => {
  stationSim.scan("SPXTST0000001", "s1");
  stationSim.requestApproval({ type: "ASSIST", session_id: stationSim.session!.id });
  server.use(
    http.post("/api/v1/approval-requests/:id/decision", () =>
      apiError(409, "TRAY_STILL_DIFFERENT", "Cam 2 vẫn thấy phiếu sai trên khay."),
    ),
  );
  await login("tst_sup", "matkhau123", "DASHBOARD");
  const user = userEvent.setup();
  renderApp("/admin/approvals");

  const row = await card("TST Station 01");
  await user.click(within(row).getByRole("button", { name: "Đóng phiên có ghi chú" }));
  await user.type(screen.getByLabelText("Ghi chú"), "QA");
  await user.click(screen.getByRole("button", { name: "Đóng phiên" }));

  expect(
    await within(row).findByText("Cam 2 vẫn thấy phiếu sai trên khay. Yêu cầu bỏ phiếu sai trước."),
  ).toBeInTheDocument();
});

test("TC-03.41 / 03.42: Gọi quản lý → Đóng phiên có ghi chú (ghi chú bắt buộc) → phiên COMPLETED cờ Quản lý đóng phiên", async () => {
  stationSim.scan("SPXTST0000001", "s1");
  stationSim.requestApproval({ type: "ASSIST", session_id: stationSim.session!.id });
  await login("tst_sup", "matkhau123", "DASHBOARD");
  const user = userEvent.setup();
  renderApp("/admin/approvals");

  const row = await card("TST Station 01");
  expect(within(row).getByText("Gọi quản lý")).toBeInTheDocument();
  for (const name of ["Cho tiếp tục", "Đóng phiên có ghi chú", "Hủy phiên"])
    expect(within(row).getByRole("button", { name })).toBeEnabled();

  await user.click(within(row).getByRole("button", { name: "Đóng phiên có ghi chú" }));
  const dialog = screen.getByRole("dialog", { name: "Đóng phiên có ghi chú" });
  await user.click(within(dialog).getByRole("button", { name: "Đóng phiên" }));
  expect(within(dialog).getByText("Nhập ghi chú (1–500 ký tự).")).toBeInTheDocument();

  await user.type(within(dialog).getByLabelText("Ghi chú"), "QA đóng tay");
  await user.click(within(dialog).getByRole("button", { name: "Đóng phiên" }));

  expect(await screen.findByText("Đã đóng phiên có ghi chú.")).toBeInTheDocument();
  expect(stationSim.state().state).toBe("READY");
  expect(stationSim.recent[0]!.flags).toContain("CLOSED_BY_SUPERVISOR");
});

test("TC-03.45: Hủy phiên cần xác nhận → station SẴN SÀNG", async () => {
  stationSim.scan("SPXTST0000001", "s1");
  stationSim.requestApproval({ type: "ASSIST", session_id: stationSim.session!.id });
  await login("tst_admin", "matkhau123", "DASHBOARD");
  const user = userEvent.setup();
  renderApp("/admin/approvals");

  const row = await card("TST Station 01");
  await user.click(within(row).getByRole("button", { name: "Hủy phiên" }));
  const dialog = screen.getByRole("dialog", { name: "Hủy phiên?" });
  expect(stationSim.state().state).toBe("WAITING_APPROVAL");
  await user.click(within(dialog).getByRole("button", { name: "Hủy phiên" }));

  expect(await screen.findByText("Đã hủy phiên.")).toBeInTheDocument();
  expect(stationSim.state().state).toBe("READY");
});

test("TC-03.51 (bước 3): Đóng gói lại → Duyệt → station mở phiên mới cờ REPACK", async () => {
  stationSim.scan("SPXTST0000010", "s1"); // ALREADY_PACKED
  expect(stationSim.requestApproval({ type: "REPACK", tracking_number: "SPXTST0000010" })).toBeNull();
  await login("tst_sup", "matkhau123", "DASHBOARD");
  const user = userEvent.setup();
  renderApp("/admin/approvals");

  const row = await card("TST Station 01");
  expect(within(row).getByText("Đóng gói lại")).toBeInTheDocument();
  expect(within(row).queryByRole("button", { name: "Cho tiếp tục" })).not.toBeInTheDocument();
  await user.click(within(row).getByRole("button", { name: "Duyệt đóng gói lại" }));

  expect(await screen.findByText("Đã duyệt đóng gói lại.")).toBeInTheDocument();
  const st = stationSim.state();
  expect(st.state).toBe("PACKING");
  expect(st.session?.package.tracking_number).toBe("SPXTST0000010");
  expect(st.session?.flags).toContain("REPACK");
});

test("TC-03.54: Từ chối đóng gói lại → station SẴN SÀNG", async () => {
  stationSim.scan("SPXTST0000010", "s1");
  stationSim.requestApproval({ type: "REPACK", tracking_number: "SPXTST0000010" });
  await login("tst_sup", "matkhau123", "DASHBOARD");
  const user = userEvent.setup();
  renderApp("/admin/approvals");

  await user.click(within(await card("TST Station 01")).getByRole("button", { name: "Từ chối" }));

  expect(await screen.findByText("Đã từ chối yêu cầu đóng gói lại.")).toBeInTheDocument();
  expect(stationSim.state().state).toBe("READY");
});

test("TC-03.47: người khác đã xử lý → 'Yêu cầu này đã được Nguyễn B xử lý lúc HH:mm.', thẻ biến mất", async () => {
  await login("tst_admin", "matkhau123", "DASHBOARD");
  const user = userEvent.setup();
  renderApp("/admin/approvals");

  const row = await card("TST Station 02");
  const at = "2026-10-04T07:31:00Z";
  resolveMockApproval("apr-seed-1", "Nguyễn B", at);
  await user.click(within(row).getByRole("button", { name: "Cho tiếp tục" }));

  expect(
    await screen.findByText(`Yêu cầu này đã được Nguyễn B xử lý lúc ${fmtHourMinute(at)}.`),
  ).toBeInTheDocument();
  expect(fmtHourMinute(at)).toBe("14:31");
  expect(await screen.findByText("Không có yêu cầu nào đang chờ.")).toBeInTheDocument();
});

test("TC-03.48: station đã rút → 'Station đã rút yêu cầu.'", async () => {
  stationSim.scan("SPXTST0000001", "s1");
  stationSim.requestApproval({ type: "ASSIST", session_id: stationSim.session!.id });
  const id = stationSim.approval!.id;
  await login("tst_sup", "matkhau123", "DASHBOARD");
  const user = userEvent.setup();
  renderApp("/admin/approvals");

  const row = await card("TST Station 01");
  // Station rút (API-14) khi dashboard chưa kịp nhận WS `approval.resolved`.
  expect(stationSim.withdraw(id)).toBe(true);
  closedApprovals.set(id, { status: "WITHDRAWN", decided_by: null, decided_at: null });
  await user.click(within(row).getByRole("button", { name: "Cho tiếp tục" }));

  expect(await screen.findByText("Station đã rút yêu cầu.")).toBeInTheDocument();
  expect(stationSim.state().state).toBe("PACKING");
});

test("D13 trống + D2 có link 'Duyệt' cho Supervisor", async () => {
  mockApprovals.splice(0);
  await login("tst_sup", "matkhau123", "DASHBOARD");
  renderApp("/admin/approvals");

  expect(await screen.findByText("Không có yêu cầu nào đang chờ.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Yêu cầu duyệt" })).toBeInTheDocument();
  expect(screen.queryByText(/yêu cầu đang chờ/)).not.toBeInTheDocument();
});

test("D2 (Supervisor): mục 'Cần xử lý' có link 'Duyệt' tới D13; drawer có 'Yêu cầu duyệt' + badge", async () => {
  await login("tst_sup", "matkhau123", "DASHBOARD");
  renderApp("/admin");

  const attention = await screen.findByRole("region", { name: "Cần xử lý" });
  const row = (await within(attention).findByText("1 yêu cầu duyệt đang chờ")).closest("li")!;
  expect(within(row).getByRole("link", { name: "Duyệt" })).toHaveAttribute("href", "/admin/approvals");
  const nav = screen.getByRole("navigation", { name: "Điều hướng chính" });
  expect(within(nav).getByRole("link", { name: /Yêu cầu duyệt/ })).toHaveAttribute(
    "href",
    "/admin/approvals",
  );
  const link = await within(nav).findByRole("link", { name: /^Yêu cầu duyệt\s*,\s*1 yêu cầu đang chờ$/ });
  expect(link).toHaveTextContent("1");
  // Không còn live region trùng ở hai drawer (review G3).
  expect(within(nav).queryByRole("status")).not.toBeInTheDocument();
});

test("D13 lỗi tải → Alert + Thử lại", async () => {
  let fail = true;
  server.use(
    http.get("/api/v1/approval-requests", () => (fail ? apiError(500, "INTERNAL", "Lỗi") : undefined)),
  );
  await login("tst_sup", "matkhau123", "DASHBOARD");
  const user = userEvent.setup();
  renderApp("/admin/approvals");

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Không tải được danh sách yêu cầu duyệt.");
  fail = false;
  await user.click(within(alert).getByRole("button", { name: "Thử lại" }));
  expect(await card("TST Station 02")).toBeInTheDocument();
});

test("TC-P (D13): CSKH không thấy mục Yêu cầu duyệt và bị chặn ở /admin/approvals", async () => {
  await login("tst_cskh", "matkhau123", "DASHBOARD");
  const router = renderApp("/admin/approvals");

  await waitFor(() => expect(router.state.location.pathname).toBe("/admin/forbidden"));
  const nav = screen.getByRole("navigation", { name: "Điều hướng chính" });
  expect(within(nav).queryByRole("link", { name: /Yêu cầu duyệt/ })).not.toBeInTheDocument();
});
