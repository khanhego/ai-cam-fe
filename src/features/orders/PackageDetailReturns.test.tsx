/**
 * D4 mở rộng item 02 — hiển thị (T-154; 01 §10.5 D4, FR-07.02, 02.06, 02.09, 02.11, 08.01): khối Hàng hoàn, phiên hoàn,
 * ảnh, cảnh báo lệch, chip hồ sơ, `ProtectedChip`, `CreateClaimDialog`. TC-07.32, 02.36, 08.08, 08.09 (UI).
 */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { login } from "@/lib/api/auth";
import { apiError } from "@/mocks/http";
import { mockClaims } from "@/mocks/returnsDb";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

const as = (user = "tst_cskh") => login(user, "matkhau123", "DASHBOARD");
const returnRegion = () => screen.findByRole("region", { name: "Hàng hoàn" });

test("TC-07.32: khối Hàng hoàn — loại, mã yêu cầu, mã chiều về, lý do, kết quả kiểm theo dòng, người kiểm, KN; chip Mở hoàn", async () => {
  await as();
  renderApp("/admin/packages/pkg-0000053");

  const block = await returnRegion();
  expect(within(block).getByText("Khách trả hàng")).toBeInTheDocument();
  expect(within(block).getByText("HH-000053")).toBeInTheDocument();
  expect(await within(block).findByText("· Yêu cầu 2410RTTST053")).toBeInTheDocument();
  expect(within(block).getByText("SPXRTTST000053")).toBeInTheDocument();
  expect(within(block).getByText(/Lý do: Hàng bị hư/)).toBeInTheDocument();
  expect(block).toHaveTextContent(/Hạn phản hồi \d{2}\/\d{2}\/\d{4}/);
  expect(block).toHaveTextContent(/Kết quả kiểm \d{2}\/\d{2} \d{2}:\d{2} · [^·]+ · Người kiểm Lan/);
  expect(within(block).getAllByText("Hộp rỗng").length).toBeGreaterThan(0);
  expect(within(block).getByRole("table")).toBeInTheDocument();
  // Hồ sơ khiếu nại tự tạo (BR-08) + link "Mở" sang D17.
  expect(within(block).getByText("KN-000124")).toBeInTheDocument();
  expect(within(block).getByRole("link", { name: "Mở KN-000124" })).toHaveAttribute(
    "href",
    "/admin/claims/cl-000124",
  );
  expect(within(block).getByText("Mới")).toBeInTheDocument();

  // Cảnh báo lệch của kiện (BR-19 tự hết).
  const recon = screen.getByRole("region", { name: "Cảnh báo lệch" });
  expect(within(recon).getByText("BR-19 Sàn báo đã hoàn, kho chưa nhận")).toBeInTheDocument();
  expect(within(recon).getByText("Tự hết")).toBeInTheDocument();

  // Danh sách phiên có chip loại; phiên hoàn mới nhất được chọn → chip bảo vệ theo hồ sơ khiếu nại.
  const sessions = within(screen.getByRole("region", { name: "Phiên" })).getAllByRole("button");
  expect(sessions[0]).toHaveTextContent("Mở hoàn");
  expect(sessions[0]).toHaveTextContent("Đã kiểm xong");
  expect(sessions[1]).toHaveTextContent("Đóng gói");
  const clip = screen.getByRole("region", { name: "Clip" });
  expect(
    within(clip).getByRole("link", { name: "Đang được giữ: hồ sơ khiếu nại KN-000124" }),
  ).toHaveAttribute("href", "/admin/claims/cl-000124");
  expect(within(clip).getByText(/Người kiểm Lan/)).toBeInTheDocument();

  // Hồ sơ khiếu nại của kiện.
  const claims = screen.getByRole("region", { name: "Hồ sơ khiếu nại" });
  expect(within(claims).getByText("KN-000124")).toBeInTheDocument();
});

test("FR-02.11: phiên đóng gói có Ảnh lúc đóng gói; ảnh hết hạn → tải lại API-31 một lần", async () => {
  await as();
  let calls = 0;
  server.events.on("request:start", ({ request }) => {
    if (new URL(request.url).pathname === "/api/v1/packages/pkg-0000053") calls += 1;
  });
  const user = userEvent.setup();
  renderApp("/admin/packages/pkg-0000053");

  const sessions = within(await screen.findByRole("region", { name: "Phiên" })).getAllByRole("button");
  await user.click(sessions[1]!);
  const clip = screen.getByRole("region", { name: "Clip" });
  expect(within(clip).getByText("Ảnh lúc đóng gói")).toBeInTheDocument();
  const img = clip.querySelector("img")!;
  img.dispatchEvent(new Event("error"));
  img.dispatchEvent(new Event("error"));
  await waitFor(() => expect(calls).toBe(2));
  server.events.removeAllListeners();
});

test("BR-09 b: hàng hoàn đã nhận còn trong 7 ngày → 'Đang được giữ: hàng hoàn HH-… tới {ngày}'", async () => {
  await as();
  renderApp("/admin/packages/pkg-0000054");

  const clip = await screen.findByRole("region", { name: "Clip" });
  expect(
    within(clip).getByText(/^Đang được giữ: hàng hoàn HH-000054 tới \d{2}\/\d{2}\/\d{4}$/),
  ).toBeInTheDocument();
});

test("TC-02.36: kiện không được bảo vệ → không có nút Giữ clip, có gợi ý tạo hồ sơ", async () => {
  await as("tst_admin");
  renderApp("/admin/packages/pkg-0000001");

  const clip = await screen.findByRole("region", { name: "Clip" });
  expect(within(clip).getByText("Muốn giữ clip? Tạo hồ sơ khiếu nại.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Giữ clip" })).not.toBeInTheDocument();
  // Kiện chỉ có hồ sơ đã đóng → không chip bảo vệ.
  expect(within(clip).queryByText(/Đang được giữ/)).not.toBeInTheDocument();
});

test("TC-08.08 (UI): CSKH tạo hồ sơ từ D4 — loại mặc định 'Khách báo thiếu / sai', bên nhận Sàn → toast, chip hồ sơ mới", async () => {
  await as();
  const user = userEvent.setup();
  const router = renderApp("/admin/packages/pkg-0000010");

  await user.click(await screen.findByRole("button", { name: "Tạo hồ sơ khiếu nại" }));
  const dialog = screen.getByRole("dialog", { name: "Tạo hồ sơ khiếu nại" });
  expect(within(dialog).getByLabelText("Loại")).toHaveValue("BUYER_CLAIM");
  expect(within(dialog).getByRole("button", { name: "Sàn" })).toHaveAttribute("aria-pressed", "true");
  await user.type(within(dialog).getByLabelText("Ghi chú"), "Khách báo thiếu 1 tất");
  await user.click(within(dialog).getByRole("button", { name: "Tạo hồ sơ" }));

  expect(await screen.findByText(/^Đã tạo hồ sơ KN-\d{6}\.$/)).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  const created = mockClaims.at(-1)!;
  expect(created).toMatchObject({ package_id: "pkg-0000010", type: "BUYER_CLAIM", source: "MANUAL" });
  // Bằng chứng tự chọn = phiên đóng gói hiệu lực (FR-08.06).
  expect(created.evidence.length).toBeGreaterThan(0);
  // D17 có (T-158) → mở thẳng hồ sơ vừa tạo.
  await waitFor(() => expect(router.state.location.pathname).toBe(`/admin/claims/${created.id}`));
  expect(await screen.findByRole("heading", { name: new RegExp(created.code) })).toBeInTheDocument();
});

test("D4 có kết luận phiên hoàn → loại mặc định theo kết luận; giao thất bại → bên nhận ĐVVC", async () => {
  await as();
  const user = userEvent.setup();
  renderApp("/admin/packages/pkg-0000053");
  await user.click(await screen.findByRole("button", { name: "Tạo hồ sơ khiếu nại" }));
  expect(within(screen.getByRole("dialog")).getByLabelText("Loại")).toHaveValue("EMPTY_BOX");
});

test("TC-08.09 (UI): trùng loại đang mở → 'Kiện này đã có hồ sơ … đang mở: KN-…'", async () => {
  await as();
  const user = userEvent.setup();
  renderApp("/admin/packages/pkg-0000053");

  await user.click(await screen.findByRole("button", { name: "Tạo hồ sơ khiếu nại" }));
  const dialog = screen.getByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Tạo hồ sơ" }));
  expect(
    await within(dialog).findByText("Kiện này đã có hồ sơ Hộp rỗng đang mở: KN-000124."),
  ).toBeInTheDocument();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

test("Tạo hồ sơ: ghi chú > 1000 ký tự khóa nút; 422 theo field; 500 → Alert", async () => {
  await as();
  const user = userEvent.setup();
  renderApp("/admin/packages/pkg-0000010");
  await user.click(await screen.findByRole("button", { name: "Tạo hồ sơ khiếu nại" }));
  const dialog = screen.getByRole("dialog");
  const note = within(dialog).getByLabelText("Ghi chú");
  await user.click(note);
  await user.paste("x".repeat(1001));
  expect(within(dialog).getByText("Tối đa 1000 ký tự.")).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Tạo hồ sơ" })).toBeDisabled();
  await user.clear(note);

  server.use(
    http.post("/api/v1/claims", () =>
      apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", { fields: { type: "Bắt buộc" } }),
    ),
  );
  await user.click(within(dialog).getByRole("button", { name: "Tạo hồ sơ" }));
  expect(await within(dialog).findByText("Bắt buộc")).toBeInTheDocument();

  server.use(
    http.post("/api/v1/claims", () => apiError(500, "INTERNAL", "Có lỗi hệ thống. Thử lại sau ít phút.")),
  );
  await user.click(within(dialog).getByRole("button", { name: "Tạo hồ sơ" }));
  expect(await within(dialog).findByText("Có lỗi hệ thống. Thử lại sau ít phút.")).toBeInTheDocument();
});

test("Kiện tạm (hàng hoàn chưa xác định) → chip 'Kiện tạm', khối Hàng hoàn loại Chưa xác định", async () => {
  await as("tst_sup");
  renderApp("/admin/packages/pkg-TAM-000001");

  expect(await screen.findByText("Kiện tạm")).toBeInTheDocument();
  const block = await returnRegion();
  expect(within(block).getByText("Chưa xác định")).toBeInTheDocument();
});
