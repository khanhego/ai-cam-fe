/**
 * Item 03 T-257 — D21 Link chia sẻ + `SharesBlock` D4 / D17 + thu hồi + sao chép (01 §10.5 D21, FR-07.08, 07.09,
 * UC-16 / 17, EX-S7; 02b-admin §3, §6, §7, §8): tab có số, tìm, Của tôi, lọc nguồn, quyền thu hồi (CSKH chỉ link mình
 * tạo), Dialog xác nhận, "Đang thu hồi — chờ Internet", sao chép + Toast, empty / error, 409 SHARE_NOT_ACTIVE.
 */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { login } from "@/lib/api/auth";
import { navFor } from "@/features/shell/nav";
import { apiError } from "@/mocks/http";
import { mockCloud, mockShares } from "@/mocks/sharesDb";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

const as = (u: "tst_cskh" | "tst_sup" | "tst_admin") => login(u, "matkhau123", "DASHBOARD");
const table = async () => within(await screen.findByRole("table", { name: "Danh sách link chia sẻ" }));
const row = (t: ReturnType<typeof within>, text: string) => t.getByText(text).closest("tr")!;

test("drawer có 'Link chia sẻ' cho 3 vai dashboard", () => {
  for (const role of ["ADMIN", "SUPERVISOR", "CSKH"] as const)
    expect(navFor(role).some((i) => i.to === "/admin/shares")).toBe(true);
});

test("D21 mặc định tab Đang hoạt động có số; cột; hạn ≤ 24 giờ đỏ; CSKH chỉ thu hồi link mình tạo", async () => {
  await as("tst_cskh");
  renderApp("/admin/shares");
  const t = await table();
  expect(screen.getByRole("tab", { name: "Đang hoạt động 4" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tab", { name: "Đã thu hồi 1" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Hết hạn 1" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Tất cả 6" })).toBeInTheDocument();
  for (const h of ["Tạo lúc", "Người tạo", "Gửi cho", "Nguồn", "Phiên", "Hết hạn", "Trạng thái"])
    expect(t.getByRole("columnheader", { name: h })).toBeInTheDocument();
  // Không hiện chuỗi URL trong bảng (DEC-489).
  expect(screen.queryByText(/^https?:\/\//)).toBeNull();

  const mine = row(t, "CSKH Shopee – phiếu 98765");
  expect(within(mine).getByRole("button", { name: /^Sao chép/ })).toBeInTheDocument();
  expect(within(mine).getByRole("button", { name: /^Thu hồi/ })).toBeInTheDocument();
  const other = row(t, "Bưu cục Thủ Đức – khiếu nại 5521");
  expect(within(other).getByRole("button", { name: /^Sao chép/ })).toBeInTheDocument();
  expect(within(other).queryByRole("button", { name: /^Thu hồi/ })).toBeNull();
  expect(within(other).getAllByText(/^\d{2}\/\d{2} \d{2}:\d{2}$/)[1]).toHaveClass("text-error");
  // Nguồn: mã hồ sơ → D17, mã kiện → D4.
  const share = mockShares.find((s) => s.id === "share-1")!;
  expect(within(mine).getByRole("link", { name: share.source.claim_code! })).toHaveAttribute(
    "href",
    `/admin/claims/${share.source.claim_id}`,
  );
  expect(within(mine).getByRole("link", { name: share.source.tracking_number })).toHaveAttribute(
    "href",
    `/admin/packages/${share.source.package_id}`,
  );
});

test("Sao chép → clipboard + Toast 'Đã sao chép link.'", async () => {
  await as("tst_cskh");
  const user = userEvent.setup();
  renderApp("/admin/shares");
  const t = await table();
  await user.click(within(row(t, "CSKH Shopee – phiếu 98765")).getByRole("button", { name: /^Sao chép/ }));
  expect(await navigator.clipboard.readText()).toBe(mockShares.find((s) => s.id === "share-1")!.url);
  expect(await screen.findByText("Đã sao chép link.")).toBeInTheDocument();
});

test("Thu hồi: Dialog xác nhận → Hủy không gọi API; xác nhận → Toast, rời tab Đang hoạt động, sang Đã thu hồi", async () => {
  await as("tst_cskh");
  const user = userEvent.setup();
  renderApp("/admin/shares");
  const t = await table();
  await user.click(within(row(t, "CSKH Shopee – phiếu 98765")).getByRole("button", { name: /^Thu hồi/ }));
  let dialog = await screen.findByRole("dialog", { name: "Thu hồi link?" });
  expect(
    within(dialog).getByText(
      "Người nhận sẽ không mở được link này nữa (trong vòng 1 phút). Không hoàn tác được.",
    ),
  ).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Hủy" }));
  expect(mockShares.find((s) => s.id === "share-1")!.status).toBe("ACTIVE");

  await user.click(within(row(t, "CSKH Shopee – phiếu 98765")).getByRole("button", { name: /^Thu hồi/ }));
  dialog = await screen.findByRole("dialog", { name: "Thu hồi link?" });
  await user.click(within(dialog).getByRole("button", { name: "Thu hồi link" }));
  expect(await screen.findByText("Đã thu hồi link.")).toBeInTheDocument();
  expect(mockShares.find((s) => s.id === "share-1")!.status).toBe("REVOKED");
  await waitFor(() => expect(screen.queryByText("CSKH Shopee – phiếu 98765")).toBeNull());
  expect(screen.getByRole("tab", { name: "Đang hoạt động 3" })).toBeInTheDocument();
});

test("EX-S7: kho mất Internet → tab Đã thu hồi chip 'Đang thu hồi — chờ Internet' + ⓘ", async () => {
  mockCloud.offline = true;
  await as("tst_sup");
  const user = userEvent.setup();
  renderApp("/admin/shares");
  const t = await table();
  // Supervisor thu hồi được link người khác.
  await user.click(within(row(t, "CSKH Shopee – phiếu 98765")).getByRole("button", { name: /^Thu hồi/ }));
  await user.click(
    within(await screen.findByRole("dialog", { name: "Thu hồi link?" })).getByRole("button", {
      name: "Thu hồi link",
    }),
  );
  await screen.findByText("Đã thu hồi link.");
  await user.click(screen.getByRole("tab", { name: /^Đã thu hồi/ }));
  const t2 = await table();
  await waitFor(() => expect(t2.getByText("Đang thu hồi — chờ Internet")).toBeInTheDocument());
  expect(
    t2.getByRole("button", { name: "Link vẫn mở được trên cloud tới khi kho có mạng lại hoặc hết hạn." }),
  ).toBeInTheDocument();
  // Link đã thu hồi xong: "Đã thu hồi — người, lúc"; không có nút.
  const done = row(t2, "Bưu cục Quận 7");
  expect(within(done).getByText(/^Đã thu hồi — Nguyễn B, \d{2}\/\d{2} \d{2}:\d{2}$/)).toBeInTheDocument();
  expect(within(done).queryByRole("button")).toBeNull();
});

test("409 SHARE_NOT_ACTIVE khi thu hồi → Toast message + tải lại", async () => {
  server.use(
    http.post("/api/v1/shares/:id/revoke", () =>
      apiError(409, "SHARE_NOT_ACTIVE", "Link đã thu hồi, hết hạn hoặc bị lỗi."),
    ),
  );
  await as("tst_admin");
  const user = userEvent.setup();
  renderApp("/admin/shares");
  const t = await table();
  await user.click(within(row(t, "CSKH Shopee – phiếu 98765")).getByRole("button", { name: /^Thu hồi/ }));
  await user.click(
    within(await screen.findByRole("dialog", { name: "Thu hồi link?" })).getByRole("button", {
      name: "Thu hồi link",
    }),
  );
  expect(await screen.findByText("Link đã thu hồi, hết hạn hoặc bị lỗi.")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("Tìm + Của tôi ghi URL; không khớp → empty có Bỏ lọc", async () => {
  await as("tst_cskh");
  const user = userEvent.setup();
  const router = renderApp("/admin/shares");
  await table();
  await user.click(screen.getByRole("button", { name: "Của tôi" }));
  await waitFor(() => expect(router.state.location.search).toBe("?mine=true"));
  await waitFor(() => expect(screen.getByRole("tab", { name: "Đang hoạt động 2" })).toBeInTheDocument());
  await user.type(screen.getByLabelText("Tìm mã kiện / mã hồ sơ / gửi cho"), "không-có");
  await user.click(screen.getByRole("button", { name: "Tìm" }));
  expect(await screen.findByText("Không có link nào khớp bộ lọc.")).toBeInTheDocument();
  await user.click(screen.getAllByRole("button", { name: "Bỏ lọc" })[0]!);
  await waitFor(() => expect(router.state.location.search).toBe(""));
});

test("chưa có link nào → empty 01; lỗi tải → Alert + Thử lại", async () => {
  mockShares.splice(0, mockShares.length);
  await as("tst_cskh");
  renderApp("/admin/shares");
  expect(await screen.findByText("Chưa có link chia sẻ nào.")).toBeInTheDocument();
  expect(screen.getByText("Tạo link từ hồ sơ khiếu nại hoặc chi tiết đơn.")).toBeInTheDocument();
});

test("lỗi tải → Alert + Thử lại", async () => {
  let fail = true;
  server.use(http.get("/api/v1/shares", () => (fail ? apiError(500, "INTERNAL", "lỗi") : undefined)));
  await as("tst_cskh");
  const user = userEvent.setup();
  renderApp("/admin/shares");
  expect(await screen.findByText("Không tải được danh sách link chia sẻ.")).toBeInTheDocument();
  fail = false;
  await user.click(screen.getByRole("button", { name: "Thử lại" }));
  await table();
});

test("D17 khối 'Link chia sẻ (n đang hoạt động)' ≤ 3 dòng + Xem tất cả → D21 lọc hồ sơ (tab Tất cả)", async () => {
  await as("tst_cskh");
  const user = userEvent.setup();
  const claimId = mockShares[0]!.source.claim_id!;
  const router = renderApp(`/admin/claims/${claimId}`);
  const block = within(await screen.findByRole("region", { name: "Link chia sẻ (2 đang hoạt động)" }));
  expect(block.getAllByRole("listitem")).toHaveLength(3);
  expect(block.getByText("Đã thu hồi")).toBeInTheDocument();
  const own = block.getByText("CSKH Shopee – phiếu 98765").closest("li")!;
  expect(within(own).getByRole("button", { name: /^Thu hồi/ })).toBeInTheDocument();
  const sup = block.getByText("Bưu cục Thủ Đức – khiếu nại 5521").closest("li")!;
  expect(within(sup).queryByRole("button", { name: /^Thu hồi/ })).toBeNull();

  await user.click(within(own).getByRole("button", { name: /^Thu hồi/ }));
  await user.click(
    within(await screen.findByRole("dialog", { name: "Thu hồi link?" })).getByRole("button", {
      name: "Thu hồi link",
    }),
  );
  expect(await screen.findByRole("region", { name: "Link chia sẻ (1 đang hoạt động)" })).toBeInTheDocument();

  await user.click(screen.getByRole("link", { name: "Xem tất cả" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/admin/shares"));
  expect(router.state.location.search).toBe(`?status=ALL&claim_id=${claimId}`);
  const code = mockShares[0]!.source.claim_code!;
  expect(await screen.findByText(`Nguồn: ${code}`)).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Tất cả 4" })).toHaveAttribute("aria-selected", "true");
});

test("D4 khối Link chia sẻ của kiện", async () => {
  await as("tst_cskh");
  const pkgId = mockShares[0]!.source.package_id;
  renderApp(`/admin/packages/${pkgId}`);
  const block = within(await screen.findByRole("region", { name: "Link chia sẻ (2 đang hoạt động)" }));
  expect(block.getByRole("link", { name: "Xem tất cả" })).toHaveAttribute(
    "href",
    `/admin/shares?status=ALL&package_id=${pkgId}`,
  );
});
