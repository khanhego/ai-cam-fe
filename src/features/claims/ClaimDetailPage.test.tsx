/**
 * D17 — Chi tiết hồ sơ khiếu nại (T-158; 01 §10.5 D17, FR-08.02, 08.03, 08.06; 02b-admin §13 component + integration).
 * TC-08.01 (UI), 08.06 (UI), 08.07 (UI), 08.14 (UI), 08.15 (UI).
 */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { claimsApi } from "@/lib/api/claims";
import { login } from "@/lib/api/auth";
import { apiError } from "@/mocks/http";
import { mockClaims } from "@/mocks/returnsDb";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

const as = (user = "tst_cskh") => login(user, "matkhau123", "DASHBOARD");
const claim = (code: string) => mockClaims.find((c) => c.code === code)!;
const stepper = () => screen.getByRole("list", { name: "Tiến trình hồ sơ" });
const current = () => stepper().querySelector('[aria-current="step"]')!;

async function transition(user: ReturnType<typeof userEvent.setup>, to: string) {
  await user.click(screen.getByRole("button", { name: "Đổi trạng thái" }));
  await user.click(screen.getByRole("menuitem", { name: to }));
  return screen.getByRole("dialog", { name: `Chuyển sang "${to}"` });
}

test("TC-08.01 (UI): Nhận phụ trách → Đã gửi (mã sàn bắt buộc) → Đang chờ → Thắng (số tiền) → Đóng; ghi chú tự ghi", async () => {
  await as();
  const user = userEvent.setup();
  renderApp("/admin/claims/cl-000124");

  expect(await screen.findByRole("heading", { name: /KN-000124 · Hộp rỗng · gửi Sàn/ })).toBeInTheDocument();
  expect(current()).toHaveTextContent("Mới");
  expect(screen.getByText("Đơn 2410TST00053 ·")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "SPXTST0000053" })).toHaveAttribute(
    "href",
    "/admin/packages/pkg-0000053",
  );
  expect(screen.getByText(/Hàng hoàn: Khách trả hàng \(SPXRTTST000053\)/)).toBeInTheDocument();
  expect(screen.getByText(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2} \(còn \d+ (giờ|ngày)\)/)).toHaveClass(
    "text-error",
  );

  await user.click(screen.getByRole("button", { name: "Nhận phụ trách" }));
  expect(await screen.findByText("Đã cập nhật hồ sơ.")).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Nhận phụ trách" })).not.toBeInTheDocument(),
  );

  // Menu chỉ bước hợp lệ (RF-21).
  await user.click(screen.getByRole("button", { name: "Đổi trạng thái" }));
  expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Đã gửi", "Đóng"]);
  await user.click(screen.getByRole("menuitem", { name: "Đã gửi" }));
  let dialog = screen.getByRole("dialog", { name: 'Chuyển sang "Đã gửi"' });
  await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
  expect(within(dialog).getByText("Nhập mã tham chiếu sàn hoặc ghi chú.")).toBeInTheDocument();
  await user.type(within(dialog).getByLabelText("Mã tham chiếu sàn"), "SPE-998877");
  await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
  await waitFor(() => expect(current()).toHaveTextContent("Đã gửi"));
  expect(screen.getByLabelText("Mã tham chiếu sàn")).toHaveValue("SPE-998877");

  dialog = await transition(user, "Đang chờ");
  await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
  await waitFor(() => expect(current()).toHaveTextContent("Đang chờ"));

  dialog = await transition(user, "Thắng");
  await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
  expect(within(dialog).getByText("Nhập số tiền là số nguyên ≥ 0.")).toBeInTheDocument();
  await user.type(within(dialog).getByLabelText("Số tiền thu hồi (đ)"), "150000");
  await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
  await waitFor(() => expect(current()).toHaveTextContent("Thắng"));
  expect(screen.getByText("150.000 đ")).toBeInTheDocument();

  dialog = await transition(user, "Đóng");
  expect(
    within(dialog).getByText(
      "Sau khi đóng, clip và ảnh trong hồ sơ được xóa theo thời hạn lưu thông thường tính từ hôm nay.",
    ),
  ).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
  await waitFor(() => expect(current()).toHaveTextContent("Đóng"));
  expect(screen.queryByRole("button", { name: "Đổi trạng thái" })).not.toBeInTheDocument();
  expect(screen.getByText(/Hồ sơ đã đóng — chỉ xem/)).toBeInTheDocument();

  const notes = screen.getByRole("list", { name: "Ghi chú" });
  for (const t of ["Người phụ trách: Lan.", "Mới → Đã gửi.", "Đang chờ → Thắng.", "Thắng → Đóng."])
    expect(within(notes).getByText(t)).toBeInTheDocument();
});

test("Đóng sớm (từ Mới) cần lý do 5–500", async () => {
  await as();
  const user = userEvent.setup();
  renderApp("/admin/claims/cl-000124");
  await screen.findByRole("heading", { name: /KN-000124/ });
  const dialog = await transition(user, "Đóng");
  await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
  expect(within(dialog).getByText("Nhập lý do 5–500 ký tự.")).toBeInTheDocument();
  await user.type(within(dialog).getByLabelText("Lý do"), "Khách rút yêu cầu");
  await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
  await waitFor(() => expect(claim("KN-000124").status).toBe("CLOSED"));
  expect(claim("KN-000124").close_reason).toBe("Khách rút yêu cầu");
});

test("TC-08.07 (UI): VERSION_CONFLICT → toast 'Hồ sơ vừa được Nguyễn B cập nhật. Đã tải lại.', Dialog giữ giá trị, gửi lại được", async () => {
  await as();
  const user = userEvent.setup();
  renderApp("/admin/claims/cl-000124");
  await screen.findByRole("heading", { name: /KN-000124/ });

  const dialog = await transition(user, "Đã gửi");
  await user.type(within(dialog).getByLabelText("Mã tham chiếu sàn"), "SPE-1");
  // Người khác sửa trong lúc đó.
  const c = claim("KN-000124");
  c.version += 1;
  c.notes.push({
    id: "n-x",
    kind: "STATUS_CHANGE",
    text: "Hạn khiếu nại: …",
    author: { id: "u-sup", display_name: "Nguyễn B" },
    at: new Date().toISOString(),
  });
  await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
  expect(await screen.findByText("Hồ sơ vừa được Nguyễn B cập nhật. Đã tải lại.")).toBeInTheDocument();
  expect(within(dialog).getByLabelText("Mã tham chiếu sàn")).toHaveValue("SPE-1");
  expect(screen.queryByText("Hồ sơ vừa được cập nhật.")).not.toBeInTheDocument();

  await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
  await waitFor(() => expect(current()).toHaveTextContent("Đã gửi"));
});

test("INVALID_TRANSITION → Alert message trong Dialog + tải lại", async () => {
  await as();
  const user = userEvent.setup();
  server.use(
    http.patch("/api/v1/claims/:id", () =>
      apiError(409, "INVALID_TRANSITION", "Không chuyển được từ Mới sang Đã gửi.", { allowed: ["CLOSED"] }),
    ),
  );
  renderApp("/admin/claims/cl-000124");
  await screen.findByRole("heading", { name: /KN-000124/ });
  const dialog = await transition(user, "Đã gửi");
  await user.type(within(dialog).getByLabelText("Mã tham chiếu sàn"), "SPE-1");
  await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
  expect(await within(dialog).findByText("Không chuyển được từ Mới sang Đã gửi.")).toBeInTheDocument();
});

test("WS: người khác sửa (claim.updated → tải lại) → toast 'Hồ sơ vừa được cập nhật.'", async () => {
  await as();
  const router = renderApp("/admin/claims/cl-000124");
  await screen.findByRole("heading", { name: /KN-000124/ });
  claim("KN-000124").version += 1;
  await router.queryClient.invalidateQueries({ queryKey: ["claim", "cl-000124"] });
  expect(await screen.findByText("Hồ sơ vừa được cập nhật.")).toBeInTheDocument();
});

test("TC-08.15 (UI): bỏ bằng chứng tự chọn cần lý do → phiên sang 'Phiên khác' → Thêm lại", async () => {
  await as();
  const user = userEvent.setup();
  renderApp("/admin/claims/cl-000124");
  await screen.findByRole("heading", { name: /KN-000124/ });

  const evidence = screen.getByRole("region", { name: "Bằng chứng" });
  expect(within(evidence).getAllByText("Tự chọn").length).toBeGreaterThanOrEqual(2);
  expect(within(evidence).getByRole("region", { name: "Clip bằng chứng" })).toBeInTheDocument();
  const remove = within(evidence).getByRole("button", { name: /^Bỏ Phiên đóng gói/ });
  await user.click(remove);
  const dialog = screen.getByRole("dialog", { name: "Lý do bỏ" });
  await user.click(within(dialog).getByRole("button", { name: "Bỏ bằng chứng" }));
  expect(within(dialog).getByText("Nhập lý do 5–500 ký tự.")).toBeInTheDocument();
  await user.type(within(dialog).getByLabelText("Lý do bỏ"), "Phiên đóng gói không liên quan");
  await user.click(within(dialog).getByRole("button", { name: "Bỏ bằng chứng" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(await within(evidence).findByText("Phiên khác của kiện:")).toBeInTheDocument();
  expect(
    within(screen.getByRole("list", { name: "Ghi chú" })).getByText(
      /Cập nhật bằng chứng: bỏ 1\. Lý do: Phiên đóng gói không liên quan/,
    ),
  ).toBeInTheDocument();

  await user.click(within(evidence).getByRole("button", { name: "Thêm" }));
  await waitFor(() => expect(within(evidence).queryByText("Phiên khác của kiện:")).not.toBeInTheDocument());
});

test("chọn phiên ▶ → player đổi; ảnh bằng chứng", async () => {
  await as();
  const user = userEvent.setup();
  renderApp("/admin/claims/cl-000124");
  await screen.findByRole("heading", { name: /KN-000124/ });
  const plays = screen.getAllByRole("button", { name: /^Xem Phiên/ });
  expect(plays.length).toBe(2);
  expect(plays[0]).toHaveAttribute("aria-pressed", "true");
  await user.click(plays[1]!);
  expect(plays[1]).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText(/^Ảnh \(\d+\)$/)).toBeInTheDocument();
});

test("TC-08.14 (UI): không có clip đóng gói → chip 'Không có clip đóng gói'; hồ sơ trống bằng chứng", async () => {
  await as();
  const c = await claimsApi.create({ package_id: "pkg-0000050", type: "OTHER", counterparty: "PLATFORM" });
  renderApp(`/admin/claims/${c.id}`);
  expect(await screen.findByText("Không có clip đóng gói")).toBeInTheDocument();
  expect(screen.getByText("Hồ sơ chưa có bằng chứng.")).toBeInTheDocument();
});

test("TC-08.06 (UI): hồ sơ Đóng → chỉ xem (không đổi trạng thái / phụ trách / bỏ bằng chứng), vẫn thêm ghi chú", async () => {
  await as();
  const user = userEvent.setup();
  renderApp("/admin/claims/cl-000117");
  await screen.findByRole("heading", { name: /KN-000117/ });
  expect(screen.getByText(/Hồ sơ đã đóng — chỉ xem/)).toBeInTheDocument();
  expect(screen.getByText("Khách rút khiếu nại")).toBeInTheDocument();
  for (const name of ["Đổi trạng thái", "Nhận phụ trách", "Đổi hạn", "Bỏ", "Lưu mã", "Lưu hạn"])
    expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Mã tham chiếu sàn")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Gửi" }));
  expect(screen.getByText("Nhập ghi chú 1–1000 ký tự.")).toBeInTheDocument();
  await user.type(screen.getByLabelText("Thêm ghi chú"), "Lưu hồ sơ để đối chiếu");
  await user.click(screen.getByRole("button", { name: "Gửi" }));
  expect(await screen.findByText("Lưu hồ sơ để đối chiếu")).toBeInTheDocument();
  expect(screen.getByLabelText("Thêm ghi chú")).toHaveValue("");
});

test("ADMIN giao người phụ trách + đổi hạn (giờ Việt Nam → Z)", async () => {
  await as("tst_admin");
  const user = userEvent.setup();
  renderApp("/admin/claims/cl-000124");
  await screen.findByRole("heading", { name: /KN-000124/ });

  const select = await screen.findByLabelText("Người phụ trách");
  await waitFor(() => expect(within(select).getAllByRole("option").length).toBeGreaterThan(2));
  await user.selectOptions(select, "u-sup");
  await user.click(screen.getByRole("button", { name: "Giao" }));
  await waitFor(() => expect(claim("KN-000124").owner?.display_name).toBe("Nguyễn B"));

  await user.click(screen.getByRole("button", { name: "Đổi hạn" }));
  const input = screen.getByLabelText("Hạn mới");
  await user.clear(input);
  await user.type(input, "2026-10-20T17:00");
  await user.click(screen.getByRole("button", { name: "Lưu hạn" }));
  await waitFor(() => expect(claim("KN-000124").deadline_at).toBe("2026-10-20T10:00:00.000Z"));
  expect(claim("KN-000124").deadline_source).toBe("MANUAL");
});

test("CSKH không có ô chọn người phụ trách (API-90 chỉ ADMIN); 404 → Không tìm thấy hồ sơ", async () => {
  await as();
  const user = userEvent.setup();
  const router = renderApp("/admin/claims/cl-000124");
  await screen.findByRole("heading", { name: /KN-000124/ });
  expect(screen.queryByLabelText("Người phụ trách")).not.toBeInTheDocument();

  await router.navigate("/admin/claims/khong-co");
  expect(await screen.findByText("Không tìm thấy hồ sơ.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Về Hồ sơ khiếu nại" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/admin/claims"));
});

test("lỗi tải → Alert + Thử lại", async () => {
  await as();
  const user = userEvent.setup();
  server.use(http.get("/api/v1/claims/:id", () => apiError(500, "INTERNAL", "x")));
  renderApp("/admin/claims/cl-000124");
  expect(await screen.findByText("Không tải được hồ sơ.")).toBeInTheDocument();
  server.resetHandlers();
  await user.click(screen.getByRole("button", { name: "Thử lại" }));
  expect(await screen.findByRole("heading", { name: /KN-000124/ })).toBeInTheDocument();
});
