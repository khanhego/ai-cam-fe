/**
 * D4 hành động item 02 (T-155; 01 §10.5 D4, FR-04.11, 04.13, 06.05): `LinkOrderDialog` (API-30 + API-112),
 * `CorrectInspectionDialog` (API-113), `AdjustStatusForm` (API-122). TC-07.33, 07.34, 07.35 (UI), TC-P2.08 (UI).
 */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { login } from "@/lib/api/auth";
import { apiError } from "@/mocks/http";
import { findPackage, mockClaims } from "@/mocks/returnsDb";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

const as = (user = "tst_sup") => login(user, "matkhau123", "DASHBOARD");

test("02b-admin §7: CSKH không thấy Gắn đơn / Sửa kết luận / Điều chỉnh trạng thái", async () => {
  await as("tst_cskh");
  renderApp("/admin/packages/pkg-TAM-000001");
  expect(await screen.findByRole("region", { name: "Hàng hoàn" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Gắn đơn" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Sửa kết luận" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Điều chỉnh trạng thái" })).not.toBeInTheDocument();
});

test("TC-07.33 (UI): Gắn đơn — mã < 6 ký tự, không tìm thấy, xem trước → Gắn đơn này → D4 kiện đích", async () => {
  await as();
  const user = userEvent.setup();
  const router = renderApp("/admin/packages/pkg-TAM-000001");

  await user.click(await screen.findByRole("button", { name: "Gắn đơn" }));
  const dialog = screen.getByRole("dialog", { name: "Gắn đơn" });
  const input = within(dialog).getByLabelText("Mã đơn sàn hoặc mã vận đơn gốc");
  await user.type(input, "2410");
  await user.click(within(dialog).getByRole("button", { name: "Tìm" }));
  expect(within(dialog).getByText("Nhập ít nhất 6 ký tự.")).toBeInTheDocument();

  await user.clear(input);
  await user.type(input, "KHONGCO999{Enter}");
  expect(await within(dialog).findByText("Không tìm thấy đơn.")).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Gắn đơn này" })).toBeDisabled();

  await user.clear(input);
  await user.type(input, "2410tst00046{Enter}");
  const preview = await within(dialog).findByRole("group", { name: "Đơn tìm được" });
  expect(preview).toHaveTextContent("SPXTST0000046");
  expect(preview).toHaveTextContent("Đơn 2410TST00046");
  await user.click(within(dialog).getByRole("button", { name: "Gắn đơn này" }));

  expect(await screen.findByText("Đã gắn đơn 2410TST00046.")).toBeInTheDocument();
  await waitFor(() => expect(router.state.location.pathname).toBe("/admin/packages/pkg-0000046"));
  // Hồ sơ khiếu nại của kiện tạm chuyển sang kiện đích (API-112, DEC-260).
  expect(mockClaims.find((c) => c.code === "KN-000123")!.package_id).toBe("pkg-0000046");
  expect(await screen.findByRole("heading", { name: /SPXTST0000046/ })).toBeInTheDocument();
});

test("UC-13: đơn nhiều kiện → chọn kiện (radio); kiện có hồ sơ mở → 'Sẽ gộp vào HH-…'", async () => {
  await as();
  const user = userEvent.setup();
  renderApp("/admin/packages/pkg-TAM-000001");

  await user.click(await screen.findByRole("button", { name: "Gắn đơn" }));
  const dialog = screen.getByRole("dialog");
  await user.type(within(dialog).getByLabelText("Mã đơn sàn hoặc mã vận đơn gốc"), "2410TST00047{Enter}");
  const radios = await within(dialog).findAllByRole("radio");
  expect(radios).toHaveLength(2);
  expect(within(dialog).getAllByText("Sẽ gộp vào HH-000047")).toHaveLength(2);
  expect(within(dialog).getByRole("button", { name: "Gắn đơn này" })).toBeDisabled();
  await user.click(within(dialog).getByRole("radio", { name: "SPXTST0000047-2" }));
  expect(within(dialog).getByRole("button", { name: "Gắn đơn này" })).toBeEnabled();
});

test("Gắn đơn: PACKAGE_ALREADY_RETURNED → 'Đơn này đã có kiện hoàn được nhận.'; NOT_UNIDENTIFIED → message", async () => {
  await as();
  const user = userEvent.setup();
  renderApp("/admin/packages/pkg-TAM-000001");
  await user.click(await screen.findByRole("button", { name: "Gắn đơn" }));
  const dialog = screen.getByRole("dialog");
  await user.type(within(dialog).getByLabelText("Mã đơn sàn hoặc mã vận đơn gốc"), "SPXTST0000053{Enter}");
  await within(dialog).findByRole("group", { name: "Đơn tìm được" });
  await user.click(within(dialog).getByRole("button", { name: "Gắn đơn này" }));
  expect(await within(dialog).findByText("Đơn này đã có kiện hoàn được nhận.")).toBeInTheDocument();

  server.use(
    http.post("/api/v1/returns/:id/link-order", () =>
      apiError(409, "NOT_UNIDENTIFIED", "Hồ sơ không còn ở trạng thái chưa xác định. Tải lại."),
    ),
  );
  await user.click(within(dialog).getByRole("button", { name: "Gắn đơn này" }));
  expect(
    await within(dialog).findByText("Hồ sơ không còn ở trạng thái chưa xác định. Tải lại."),
  ).toBeInTheDocument();
});

test("TC-07.34 (UI): Sửa kết luận Hộp rỗng → Nguyên vẹn (BR-22 khóa tới khi đủ dòng) + lý do → 'Đã sửa 1 lần'; KN NEW tự đóng", async () => {
  await as();
  const user = userEvent.setup();
  renderApp("/admin/packages/pkg-0000053");

  const block = await screen.findByRole("region", { name: "Hàng hoàn" });
  await user.click(within(block).getByRole("button", { name: "Sửa kết luận" }));
  const dialog = screen.getByRole("dialog", { name: "Sửa kết luận" });
  const ok = within(dialog).getByRole("radio", { name: "Nguyên vẹn" });
  expect(ok).toBeDisabled();

  // Đủ số nhận + tình trạng Nguyên vẹn mọi dòng → mở khóa.
  for (const qty of within(dialog).getAllByRole("spinbutton")) {
    const row = qty.closest("tr")!;
    const requested = row.querySelectorAll("td")[1]!.textContent!;
    await user.clear(qty);
    await user.type(qty, requested);
  }
  for (const sel of within(dialog).getAllByRole("combobox")) await user.selectOptions(sel, "OK");
  expect(ok).toBeEnabled();
  await user.click(ok);

  // Lý do bắt buộc 5–500.
  await user.click(within(dialog).getByRole("button", { name: "Lưu kết luận" }));
  expect(within(dialog).getByText("Nhập lý do 5–500 ký tự.")).toBeInTheDocument();
  await user.type(within(dialog).getByLabelText("Lý do sửa"), "Người kiểm chọn nhầm");
  await user.click(within(dialog).getByRole("button", { name: "Lưu kết luận" }));

  expect(await screen.findByText("Đã sửa kết luận.")).toBeInTheDocument();
  expect(await within(block).findByRole("button", { name: "Đã sửa 1 lần" })).toBeInTheDocument();
  expect(findPackage("pkg-0000053")!.warehouse_status).toBe("RETURN_RECEIVED_OK");
  expect(mockClaims.find((c) => c.code === "KN-000124")).toMatchObject({
    status: "CLOSED",
    close_reason: "Kết luận đã sửa thành Nguyên vẹn",
  });
});

test("TC-07.35 (UI): API-113 CORRECTION_WINDOW_EXPIRED → 'Đã quá 7 ngày, không sửa được.'; CONCLUSION_INCONSISTENT → message", async () => {
  await as("tst_admin");
  const user = userEvent.setup();
  server.use(
    http.put("/api/v1/sessions/:id/inspection", () =>
      apiError(409, "CORRECTION_WINDOW_EXPIRED", "Đã quá 7 ngày, không sửa được."),
    ),
  );
  renderApp("/admin/packages/pkg-0000053");
  await user.click(await screen.findByRole("button", { name: "Sửa kết luận" }));
  const dialog = screen.getByRole("dialog");
  await user.click(within(dialog).getByRole("radio", { name: "Hư hỏng" }));
  await user.type(within(dialog).getByLabelText("Lý do sửa"), "Kiểm lại thấy rách");
  await user.click(within(dialog).getByRole("button", { name: "Lưu kết luận" }));
  expect(await within(dialog).findByText("Đã quá 7 ngày, không sửa được.")).toBeInTheDocument();

  server.use(
    http.put("/api/v1/sessions/:id/inspection", () =>
      apiError(422, "CONCLUSION_INCONSISTENT", "Có dòng thiếu / hỏng — không chọn Nguyên vẹn được."),
    ),
  );
  await user.click(within(dialog).getByRole("button", { name: "Lưu kết luận" }));
  expect(
    await within(dialog).findByText("Có dòng thiếu / hỏng — không chọn Nguyên vẹn được."),
  ).toBeInTheDocument();
});

test("FR-04.11: phiên hoàn quá 7 ngày (can_correct = false) → chữ thay nút", async () => {
  await as();
  const returned = findPackage("pkg-0000053")!.sessions.find((s) => s.type === "RETURN")!;
  returned.ended_at = new Date(Date.now() - 8 * 86_400_000).toISOString();
  renderApp("/admin/packages/pkg-0000053");
  const block = await screen.findByRole("region", { name: "Hàng hoàn" });
  expect(await within(block).findByText("Đã quá 7 ngày, không sửa được.")).toBeInTheDocument();
  expect(within(block).queryByRole("button", { name: "Sửa kết luận" })).not.toBeInTheDocument();
});

test("TC-P2.08 (UI) / FR-06.05: Điều chỉnh trạng thái — chỉ đích cho phép, lý do bắt buộc, TRANSITION_NOT_ALLOWED cập nhật danh sách, thành công đổi chip", async () => {
  await as();
  const user = userEvent.setup();
  renderApp("/admin/packages/pkg-0000049");

  await user.click(await screen.findByRole("button", { name: "Điều chỉnh trạng thái" }));
  const dialog = screen.getByRole("dialog", { name: "Điều chỉnh trạng thái" });
  expect(within(dialog).getByText("Hoàn quá hạn")).toBeInTheDocument();
  expect(
    within(dialog)
      .getAllByRole("radio")
      .map((r) => r.closest("label")!.textContent),
  ).toEqual(["Hoàn đang về", "Đã giao"]);
  await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
  expect(within(dialog).getByText("Chọn trạng thái đích.")).toBeInTheDocument();
  expect(within(dialog).getByText("Nhập lý do 5–500 ký tự.")).toBeInTheDocument();

  server.use(
    http.post("/api/v1/packages/:id/warehouse-status", () =>
      apiError(409, "TRANSITION_NOT_ALLOWED", "Không được chuyển trạng thái kho này bằng tay.", {
        from: "RETURN_MISSING",
        allowed: ["DELIVERED"],
      }),
    ),
  );
  await user.click(within(dialog).getByRole("radio", { name: "Hoàn đang về" }));
  await user.type(within(dialog).getByLabelText("Lý do"), "Kho đã nhận lại");
  await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
  expect(
    await within(dialog).findByText("Không được chuyển trạng thái kho này bằng tay."),
  ).toBeInTheDocument();
  expect(within(dialog).getAllByRole("radio")).toHaveLength(1);

  server.resetHandlers();
  await user.click(within(dialog).getByRole("radio", { name: "Đã giao" }));
  await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
  expect(await screen.findByText("Đã điều chỉnh trạng thái kho.")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: /Đã giao/ })).toBeInTheDocument();
});

test("FR-06.05: SESSION_ACTIVE → Alert message", async () => {
  await as("tst_admin");
  const user = userEvent.setup();
  server.use(
    http.post("/api/v1/packages/:id/warehouse-status", () =>
      apiError(409, "SESSION_ACTIVE", "Kiện đang có phiên mở ở station."),
    ),
  );
  renderApp("/admin/packages/pkg-0000049");
  await user.click(await screen.findByRole("button", { name: "Điều chỉnh trạng thái" }));
  const dialog = screen.getByRole("dialog");
  await user.click(within(dialog).getByRole("radio", { name: "Đã giao" }));
  await user.type(within(dialog).getByLabelText("Lý do"), "Đã giao lại cho khách");
  await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
  expect(await within(dialog).findByText("Kiện đang có phiên mở ở station.")).toBeInTheDocument();
});
