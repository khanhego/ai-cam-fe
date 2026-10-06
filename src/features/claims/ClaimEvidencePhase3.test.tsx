/**
 * Item 03 T-260 — D17 L11 / L14 / L15 (01 §10.5 D17; BR-38, BR-39, BR-42; TC-08.40, 08.42, 08.44.., 08.66) + D13
 * `return_summary` (FR-04.14). Hồ sơ mẫu KN-000141 (`cl-000141`, kiện SPXTST0000060 — returnsDb `seedPhase3Claim`).
 */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { login } from "@/lib/api/auth";
import { mockClaims, P3_CLAIM_ID } from "@/mocks/returnsDb";
import { fmtShort, vnDay } from "@/shared/format";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

/** Giờ "dd/mm HH:mm" hôm qua (giờ VN) — các phiên mẫu của KN-000141. */
function yesterdayAt(hhmm: string) {
  const day = Date.parse(`${vnDay()}T${hhmm}:00+07:00`) - 86_400_000;
  return fmtShort(new Date(day).toISOString());
}

const evidenceSection = () => screen.getByRole("heading", { name: "Bằng chứng" }).closest("section")!;
const rowOf = (text: string) =>
  within(evidenceSection())
    .getAllByText((_, el) => el?.tagName === "LI" && (el.textContent ?? "").includes(text))
    .at(-1)!;

beforeEach(() => login("tst_cskh", "matkhau123", "DASHBOARD"));

test("TC-08.40 / 08.42: Alert phiên mở hoàn trước (là phiên chính) + Alert phiên bị loại; chip; 'Hạn sàn đã qua'", async () => {
  renderApp(`/admin/claims/${P3_CLAIM_ID}`);
  await screen.findByRole("heading", { name: "Bằng chứng" });
  const a = yesterdayAt("08:51");
  expect(
    screen.getByText(`Kiện có 1 phiên mở hoàn trước (bỏ dở ${a}) — đã đưa vào bằng chứng, là phiên chính.`),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      `Kiện có 2 phiên mở hoàn bị loại vì quét nhầm (${yesterdayAt("09:00")}, ${yesterdayAt("09:10")}) — không đưa vào bằng chứng. Video vẫn được giữ; thêm tay nếu cần.`,
    ),
  ).toBeInTheDocument();

  const rowA = rowOf(`Phiên mở hoàn ${a}`);
  expect(within(rowA).getByText("Phiên chính")).toBeInTheDocument();
  expect(within(rowA).getByText("Phiên mở hoàn trước · Bỏ dở")).toBeInTheDocument();
  // Phiên "Cần soát" (quản lý hủy trước Phase 3) có chip vàng, không là phiên chính.
  const rowR = rowOf(`Phiên mở hoàn ${yesterdayAt("09:05")}`);
  expect(within(rowR).getByText("Cần soát: quản lý hủy, chưa rõ lý do")).toBeInTheDocument();
  expect(within(rowR).queryByText("Phiên chính")).toBeNull();
  // Phiên kết luận không là phiên chính (FE không tự tính).
  expect(within(rowOf(`Phiên mở hoàn ${yesterdayAt("10:15")}`)).queryByText("Phiên chính")).toBeNull();

  expect(screen.getByText("Hạn sàn đã qua")).toBeInTheDocument();
});

test("thêm phiên bị loại vào bằng chứng (thêm tay) → chip 'Hủy: quét nhầm', không thành phiên chính", async () => {
  const user = userEvent.setup();
  renderApp(`/admin/claims/${P3_CLAIM_ID}`);
  const c = yesterdayAt("09:00");
  await user.click(await screen.findByRole("button", { name: `Thêm vào bằng chứng phiên ${c}` }));
  const rowC = await waitFor(() => rowOf(`Phiên mở hoàn ${c}`));
  expect(within(rowC).getByText("Hủy: quét nhầm")).toBeInTheDocument();
  expect(within(rowC).queryByText("Phiên chính")).toBeNull();
  expect(within(rowOf(`Phiên mở hoàn ${yesterdayAt("08:51")}`)).getByText("Phiên chính")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: `Thêm vào bằng chứng phiên ${c}` })).toBeNull();
});

test("FR-08.09 / BR-38: bỏ bằng chứng cần lý do, chữ ngày giữ; danh sách đã bỏ; Thêm lại khôi phục", async () => {
  const user = userEvent.setup();
  renderApp(`/admin/claims/${P3_CLAIM_ID}`);
  const label = `Phiên mở hoàn ${yesterdayAt("10:15")}`;
  await user.click(await screen.findByRole("button", { name: `Bỏ ${label}` }));
  const dialog = await screen.findByRole("dialog", { name: "Bỏ bằng chứng?" });
  expect(
    within(dialog).getByText(
      /^Clip và ảnh của phiên này được giữ tới \d{2}\/\d{2}\/\d{4} rồi tự xóa \(trừ khi thuộc hồ sơ khác\)\.$/,
    ),
  ).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Bỏ bằng chứng" }));
  expect(within(dialog).getByText("Nhập lý do bỏ bằng chứng (5–500 ký tự).")).toBeInTheDocument();
  await user.type(within(dialog).getByLabelText(/^Lý do/), "Trùng clip");
  await user.click(within(dialog).getByRole("button", { name: "Bỏ bằng chứng" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  const removed = screen.getByText("Bằng chứng đã bỏ (1)").closest("details")!;
  expect(within(removed).getByText(label)).toBeInTheDocument();
  expect(
    within(removed).getByText(/Bỏ bởi Lan lúc .* · Lý do: Trùng clip · Giữ tới \d{2}\/\d{2}\/\d{4}/),
  ).toBeInTheDocument();
  const claim = mockClaims.find((c) => c.id === P3_CLAIM_ID)!;
  expect(claim.removed?.[0]).toMatchObject({ reason: "Trùng clip", ref_id: "ses-p3-b" });

  await user.click(within(removed).getByRole("button", { name: `Thêm lại ${label}` }));
  await waitFor(() => expect(screen.queryByText("Bằng chứng đã bỏ (1)")).toBeNull());
  expect(rowOf(label)).toBeInTheDocument();
  expect(claim.evidence.find((e) => e.ref_id === "ses-p3-b")?.auto).toBe(true);
});

test("bỏ ảnh bằng chứng cũng qua dialog có lý do", async () => {
  const user = userEvent.setup();
  renderApp(`/admin/claims/${P3_CLAIM_ID}`);
  const photo = `Ảnh ${yesterdayAt("10:16")}`;
  await user.click(await screen.findByRole("button", { name: `Bỏ ${photo}` }));
  const dialog = await screen.findByRole("dialog", { name: "Bỏ bằng chứng?" });
  expect(within(dialog).getByText(/^Ảnh này được giữ tới/)).toBeInTheDocument();
  await user.type(within(dialog).getByLabelText(/^Lý do/), "Ảnh mờ, chụp lại");
  await user.click(within(dialog).getByRole("button", { name: "Bỏ bằng chứng" }));
  expect(await screen.findByText("Bằng chứng đã bỏ (1)")).toBeInTheDocument();
});

test("D13: thẻ phiên hoàn có 'Đã có kết luận: Hộp rỗng · 3 ảnh · mở 4 phút'", async () => {
  await login("tst_sup", "matkhau123", "DASHBOARD");
  const now = Date.now();
  server.use(
    http.get("/api/v1/approval-requests", () =>
      Response.json({
        items: [
          {
            id: "apr-x",
            type: "ASSIST",
            status: "PENDING",
            station: { id: "st-1", name: "TST Station 01" },
            session_id: "ses-x",
            tracking_number: "SPXRTTST000041",
            context: null,
            created_at: new Date(now - 60_000).toISOString(),
            session_type: "RETURN",
            operator_name: "Lan",
            decision: null,
            decided_by: null,
            decided_at: null,
            note: null,
            return_summary: {
              conclusion: "EMPTY_BOX",
              snapshot_count: 3,
              opened_at: new Date(now - 4 * 60_000 - 5_000).toISOString(),
            },
          },
        ],
        total: 1,
        page: 1,
        page_size: 100,
      }),
    ),
  );
  renderApp("/admin/approvals");
  expect(await screen.findByText("Đã có kết luận: Hộp rỗng · 3 ảnh · mở 4 phút")).toBeInTheDocument();
});
