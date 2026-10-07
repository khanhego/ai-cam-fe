/**
 * Item 03 T-264 — D17 API-189 (01 §10.5 D17 v0.4; BR-39, EX-R21; TC-08.50, 08.52, TC-P3.14) + D13 "Hủy phiên mở hoàn?"
 * (FR-04.14, DEC-514). Hồ sơ mẫu KN-000141 (`cl-000141`): R "Cần soát" 09:05, M đã đánh dấu 09:10, A bỏ dở 08:51 (chính).
 */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { login } from "@/lib/api/auth";
import { apiError } from "@/mocks/http";
import { findSessionAnywhere, P3_CLAIM_ID } from "@/mocks/returnsDb";
import { fmtShort, vnDay } from "@/shared/format";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

function yesterdayAt(hhmm: string) {
  return fmtShort(new Date(Date.parse(`${vnDay()}T${hhmm}:00+07:00`) - 86_400_000).toISOString());
}
const evidence = () => screen.getByRole("heading", { name: "Bằng chứng" }).closest("section")!;
const rowOf = (text: string) =>
  within(evidence())
    .getAllByText((_, el) => el?.tagName === "LI" && (el.textContent ?? "").includes(text))
    .at(-1)!;

beforeEach(() => login("tst_cskh", "matkhau123", "DASHBOARD"));

test("TC-08.50: menu ⋮ → Đánh dấu quét nhầm phiên chính → lý do + ghi chú bắt buộc → phiên rời bằng chứng, phiên chính theo server", async () => {
  const user = userEvent.setup();
  renderApp(`/admin/claims/${P3_CLAIM_ID}`);
  const a = `Phiên mở hoàn ${yesterdayAt("08:51")}`;
  await screen.findByRole("heading", { name: "Bằng chứng" });
  // Phiên kết luận (COMPLETED) không có menu.
  expect(screen.queryByRole("button", { name: `Thao tác Phiên mở hoàn ${yesterdayAt("10:15")}` })).toBeNull();
  await user.click(screen.getByRole("button", { name: `Thao tác ${a}` }));
  await user.click(screen.getByRole("menuitem", { name: "Đánh dấu quét nhầm" }));
  const dialog = await screen.findByRole("dialog", { name: "Đánh dấu phiên quét nhầm?" });
  expect(within(dialog).getByRole("radio", { name: "Quét nhầm kiện khác" })).not.toBeChecked();
  expect(within(dialog).getByRole("radio", { name: "Không phải kiện hàng hoàn" })).not.toBeChecked();
  expect(
    within(dialog).getByText(
      /^Phiên sẽ bị bỏ khỏi bằng chứng của mọi hồ sơ chưa đóng .* Video vẫn được giữ tới \d{2}\/\d{2}\/\d{4}/,
    ),
  ).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Đánh dấu" }));
  expect(within(dialog).getByText("Chọn lý do.")).toBeInTheDocument();
  expect(within(dialog).getByText("Nhập ghi chú (5–500 ký tự).")).toBeInTheDocument();
  await user.click(within(dialog).getByRole("radio", { name: "Quét nhầm kiện khác" }));
  await user.type(within(dialog).getByLabelText(/^Ghi chú/), "Video là kiện khác");
  await user.click(within(dialog).getByRole("button", { name: "Đánh dấu" }));

  expect(await screen.findByText("Đã đánh dấu phiên quét nhầm.")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  const removed = screen.getByText(/^Bằng chứng đã bỏ \(\d\)$/).closest("details")!;
  expect(within(removed).getByText(a)).toBeInTheDocument();
  expect(within(removed).getByText(/Lý do: Đánh dấu quét nhầm: Video là kiện khác/)).toBeInTheDocument();
  // Phiên chính chuyển sang phiên khác theo response (B 10:15 — phiên R còn "Cần soát").
  expect(within(rowOf(`Phiên mở hoàn ${yesterdayAt("10:15")}`)).getByText("Phiên chính")).toBeInTheDocument();
  expect(findSessionAnywhere("ses-p3-a")!.session.review?.wrong_scan).toMatchObject({
    code: "WRONG_SCAN",
    note: "Video là kiện khác",
  });
});

test("Bỏ đánh dấu phiên MARKED → Toast 'Đã bỏ đánh dấu.', không tự vào lại bằng chứng", async () => {
  const user = userEvent.setup();
  renderApp(`/admin/claims/${P3_CLAIM_ID}`);
  await user.click(await screen.findByRole("button", { name: `Bỏ đánh dấu phiên ${yesterdayAt("09:10")}` }));
  const dialog = await screen.findByRole("dialog", { name: "Bỏ đánh dấu quét nhầm?" });
  expect(
    within(dialog).getByText("Phiên không tự vào lại bằng chứng — thêm tay nếu cần."),
  ).toBeInTheDocument();
  await user.type(within(dialog).getByLabelText(/^Ghi chú/), "Đánh dấu nhầm phiên");
  await user.click(within(dialog).getByRole("button", { name: "Bỏ đánh dấu" }));
  expect(await screen.findByText("Đã bỏ đánh dấu.")).toBeInTheDocument();
  expect(findSessionAnywhere("ses-p3-m")!.session.review?.wrong_scan).toBeNull();
  expect(
    within(evidence()).queryByText(`Phiên mở hoàn ${yesterdayAt("09:10")}`, { exact: false }),
  ).toBeNull();
});

test("TC-08.52: Alert 'Cần soát' → Là phiên hoàn thật → ghi chú → phiên thành phiên chính (server)", async () => {
  const user = userEvent.setup();
  renderApp(`/admin/claims/${P3_CLAIM_ID}`);
  const alert = await screen.findByText(
    /^Kiện có 1 phiên mở hoàn do quản lý hủy trước khi hệ thống ghi lý do/,
  );
  const box = alert.closest("[role=status]") as HTMLElement;
  await user.click(within(box).getByRole("button", { name: "Là phiên hoàn thật" }));
  const dialog = await screen.findByRole("dialog", { name: "Xác nhận là phiên hoàn thật?" });
  expect(
    within(dialog).getByText("Phiên sẽ được tính như phiên mở hoàn thường và có thể thành phiên chính."),
  ).toBeInTheDocument();
  await user.type(within(dialog).getByLabelText(/^Ghi chú/), "Đã xem video, đúng kiện");
  await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
  expect(await screen.findByText("Đã xác nhận.")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText(/^Kiện có 1 phiên mở hoàn do quản lý hủy/)).toBeNull());
  // A (08:51) sớm hơn R (09:05) → A vẫn chính; R hết chip "Cần soát".
  expect(within(rowOf(`Phiên mở hoàn ${yesterdayAt("09:05")}`)).queryByText(/^Cần soát/)).toBeNull();
});

test("409 SESSION_NOT_ELIGIBLE → Toast message, đóng dialog, tải lại", async () => {
  const user = userEvent.setup();
  server.use(
    http.post("/api/v1/claims/:id/return-sessions/:sid/review", () =>
      apiError(409, "SESSION_NOT_ELIGIBLE", "Phiên đã được loại khỏi bằng chứng."),
    ),
  );
  renderApp(`/admin/claims/${P3_CLAIM_ID}`);
  const alert = await screen.findByText(/^Kiện có 1 phiên mở hoàn do quản lý hủy/);
  await user.click(
    within(alert.closest("[role=status]") as HTMLElement).getByRole("button", { name: "Quét nhầm" }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Đánh dấu phiên quét nhầm?" });
  await user.click(within(dialog).getByRole("radio", { name: "Không phải kiện hàng hoàn" }));
  await user.type(within(dialog).getByLabelText(/^Ghi chú/), "Không phải hàng hoàn");
  await user.click(within(dialog).getByRole("button", { name: "Đánh dấu" }));
  expect(await screen.findByText("Phiên đã được loại khỏi bằng chứng.")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

test("422 fields.note từ server hiện dưới ô", async () => {
  const user = userEvent.setup();
  server.use(
    http.post("/api/v1/claims/:id/return-sessions/:sid/review", () =>
      HttpResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Dữ liệu không hợp lệ.",
            details: { fields: { note: "Ghi chú không hợp lệ (server)." } },
          },
        },
        { status: 422 },
      ),
    ),
  );
  renderApp(`/admin/claims/${P3_CLAIM_ID}`);
  await user.click(await screen.findByRole("button", { name: `Bỏ đánh dấu phiên ${yesterdayAt("09:10")}` }));
  const dialog = await screen.findByRole("dialog", { name: "Bỏ đánh dấu quét nhầm?" });
  await user.type(within(dialog).getByLabelText(/^Ghi chú/), "Ghi chú đủ dài");
  await user.click(within(dialog).getByRole("button", { name: "Bỏ đánh dấu" }));
  expect(await within(dialog).findByText("Ghi chú không hợp lệ (server).")).toBeInTheDocument();
});

test("hồ sơ Đóng: không có menu / nút API-189", async () => {
  const { mockClaims } = await import("@/mocks/returnsDb");
  mockClaims.find((c) => c.id === P3_CLAIM_ID)!.status = "CLOSED";
  renderApp(`/admin/claims/${P3_CLAIM_ID}`);
  await screen.findByText(/^Kiện có 1 phiên mở hoàn do quản lý hủy/);
  expect(screen.queryByRole("button", { name: "Là phiên hoàn thật" })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Thao tác Phiên/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Bỏ đánh dấu/ })).toBeNull();
});

describe("D13 Hủy phiên mở hoàn?", () => {
  function mockReturnApproval() {
    const seen: unknown[] = [];
    server.use(
      http.get("/api/v1/approval-requests", () =>
        HttpResponse.json({
          items: [
            {
              id: "apr-r",
              type: "ASSIST",
              status: "PENDING",
              station: { id: "st-1", name: "TST Station 01" },
              session_id: "ses-r",
              tracking_number: "SPXRTTST000041",
              context: null,
              created_at: new Date().toISOString(),
              session_type: "RETURN",
              operator_name: "Lan",
              decision: null,
              decided_by: null,
              decided_at: null,
              note: null,
              return_summary: null,
            },
          ],
          total: 1,
          page: 1,
          page_size: 100,
        }),
      ),
      http.post("/api/v1/approval-requests/:id/decision", async ({ request }) => {
        seen.push(await request.json());
        return HttpResponse.json({
          approval_request: {
            id: "apr-r",
            status: "RESOLVED",
            decision: "CANCEL_SESSION",
            decided_by: { id: "u-sup", display_name: "Nguyễn B" },
            decided_at: new Date().toISOString(),
          },
        });
      }),
    );
    return seen;
  }

  test("radio không chọn sẵn, nút khóa tới khi đủ; chữ đổi theo lý do; gửi reason_code + note", async () => {
    await login("tst_sup", "matkhau123", "DASHBOARD");
    const seen = mockReturnApproval();
    const user = userEvent.setup();
    renderApp("/admin/approvals");
    await user.click(await screen.findByRole("button", { name: "Hủy phiên" }));
    const dialog = await screen.findByRole("dialog", { name: "Hủy phiên mở hoàn?" });
    const confirm = within(dialog).getByRole("button", { name: "Hủy phiên" });
    for (const r of ["Quét nhầm kiện khác", "Không phải kiện hàng hoàn", "Lý do khác (kiện hoàn thật)"])
      expect(within(dialog).getByRole("radio", { name: r })).not.toBeChecked();
    expect(confirm).toBeDisabled();
    expect(within(dialog).queryByText(/^Video phiên này/)).toBeNull();

    await user.click(within(dialog).getByRole("radio", { name: "Lý do khác (kiện hoàn thật)" }));
    expect(
      within(dialog).getByText(
        "Video phiên này vẫn được giữ và tự vào hồ sơ khiếu nại nếu kiện có hồ sơ sau này.",
      ),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("radio", { name: "Quét nhầm kiện khác" }));
    expect(
      within(dialog).getByText("Video phiên này vẫn được giữ nhưng không tự vào hồ sơ khiếu nại của kiện."),
    ).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/^Ghi chú/), "abc");
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/^Ghi chú/), " quét nhầm mã bên cạnh");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(await screen.findByText("Đã hủy phiên.")).toBeInTheDocument();
    expect(seen[0]).toEqual({
      action: "CANCEL_SESSION",
      note: "abc quét nhầm mã bên cạnh",
      reason_code: "WRONG_SCAN",
    });
  });

  test("422 fields.reason_code / note từ server → dưới ô", async () => {
    await login("tst_sup", "matkhau123", "DASHBOARD");
    mockReturnApproval();
    server.use(
      http.post("/api/v1/approval-requests/:id/decision", () =>
        HttpResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Dữ liệu không hợp lệ.",
              details: { fields: { reason_code: "Chọn lý do hủy.", note: "Nhập ghi chú (5–500 ký tự)." } },
            },
          },
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderApp("/admin/approvals");
    await user.click(await screen.findByRole("button", { name: "Hủy phiên" }));
    const dialog = await screen.findByRole("dialog", { name: "Hủy phiên mở hoàn?" });
    await user.click(within(dialog).getByRole("radio", { name: "Không phải kiện hàng hoàn" }));
    await user.type(within(dialog).getByLabelText(/^Ghi chú/), "Không phải hàng hoàn");
    await user.click(within(dialog).getByRole("button", { name: "Hủy phiên" }));
    expect(await within(dialog).findByText("Chọn lý do hủy.")).toBeInTheDocument();
    expect(within(dialog).getByText("Nhập ghi chú (5–500 ký tự).")).toBeInTheDocument();
  });
});
