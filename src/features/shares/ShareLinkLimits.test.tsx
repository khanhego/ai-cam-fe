/**
 * T-262 (02b-admin §13 "ShareLinkDialog validate (0 / 5 phiên, 31 phút, gửi cho 2 ký tự)") + contract M16 (02 §6.2
 * API-164 — BE DEC-667): phiên `excluded` không chọn sẵn nhưng chọn tay được; "Kèm ảnh (n)" đếm theo phiên đang chọn
 * (`sessions[].snapshot_count`, DEC-801). 0 phiên / gửi cho 2 ký tự / 2 Alert: `ShareLinkDialog.test.tsx`.
 */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { login } from "@/lib/api/auth";
import type { CreateShareBody, ShareOptions, ShareOptionSession } from "@/lib/api/shares";
import { apiError } from "@/mocks/http";
import { P3_CLAIM_ID } from "@/mocks/returnsDb";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

beforeEach(async () => {
  await login("tst_cskh", "matkhau123", "DASHBOARD");
});

function session(n: number, over: Partial<ShareOptionSession>): ShareOptionSession {
  return {
    id: `opt-${n}`,
    type: "RETURN",
    status: "COMPLETED",
    started_at: `2026-10-0${n}T02:00:00Z`,
    ended_at: `2026-10-0${n}T02:10:00Z`,
    station_name: `Station 0${n}`,
    operator_name: null,
    conclusion: null,
    duration_s: 400,
    prior_return: false,
    primary: false,
    default_selected: true,
    selectable: true,
    unavailable_reason: null,
    unavailable_at: null,
    cameras: ["CAM1", "CAM2"],
    review_needed: false,
    excluded: false,
    snapshot_count: 0,
    ...over,
  };
}

const OPTIONS: ShareOptions = {
  storage_configured: true,
  source: {
    type: "CLAIM",
    claim_id: P3_CLAIM_ID,
    claim_code: "KN-000141",
    package_id: "pkg-x",
    tracking_number: "SPXTST0000060",
    platform: "SHOPEE",
    shop_name: "TST Shop A",
  },
  sessions: [
    session(1, { type: "PACK", primary: false, snapshot_count: 2 }),
    session(2, { primary: true }),
    session(3, {}),
    session(4, {}),
    // Phiên bị loại theo BR-39 nhưng có trong bằng chứng (thêm tay): server không chọn sẵn.
    session(5, { excluded: true, default_selected: false, duration_s: 700, snapshot_count: 3 }),
  ],
  snapshot_count: 5,
  review_pending_count: 0,
  limits: { max_sessions: 4, max_total_seconds: 1800, max_snapshots: 20 },
  default_expires_days: 7,
};

test("giới hạn 4 phiên / 30 phút, phiên bị loại không chọn sẵn, Kèm ảnh theo phiên chọn → body API-160", async () => {
  let body: CreateShareBody | null = null;
  server.use(
    http.get("/api/v1/shares/options", () => HttpResponse.json(OPTIONS)),
    http.post("/api/v1/shares", async ({ request }) => {
      body = (await request.json()) as CreateShareBody;
      return apiError(500, "INTERNAL", "Lỗi máy chủ.");
    }),
  );
  const user = userEvent.setup();
  renderApp(`/admin/claims/${P3_CLAIM_ID}`);
  await user.click(await screen.findByRole("button", { name: "Tạo link chia sẻ" }));
  const dialog = await screen.findByRole("dialog", { name: "Tạo link chia sẻ bằng chứng" });
  const box = (n: number) => within(dialog).getByRole("checkbox", { name: new RegExp(`Station 0${n}`) });
  const create = within(dialog).getByRole("button", { name: "Tạo link" });
  const photos = () => within(dialog).getByRole("checkbox", { name: /^Kèm ảnh/ });

  await within(dialog).findByText("Phiên gửi kèm (tối đa 4)");
  for (const n of [1, 2, 3, 4]) expect(box(n)).toBeChecked();
  expect(box(5)).not.toBeChecked();
  expect(box(5)).toBeEnabled();
  expect(photos()).toHaveAccessibleName("Kèm ảnh (2)");
  expect(photos()).toBeChecked();
  await user.type(within(dialog).getByLabelText(/^Gửi cho/), "ĐVVC SPX – phiếu 7788");
  expect(create).toBeEnabled();

  // 5 phiên → lỗi + khóa.
  await user.click(box(5));
  expect(within(dialog).getByText("Chọn tối đa 4 phiên.")).toBeInTheDocument();
  expect(create).toBeDisabled();
  expect(photos()).toHaveAccessibleName("Kèm ảnh (5)");

  // 4 phiên nhưng 400 × 3 + 700 = 1.900 giây (31 phút 40 giây) > 1.800 → lỗi tổng thời lượng.
  await user.click(box(1));
  expect(within(dialog).queryByText("Chọn tối đa 4 phiên.")).toBeNull();
  expect(within(dialog).getByText("Tổng thời lượng tối đa 30 phút.")).toBeInTheDocument();
  expect(create).toBeDisabled();
  expect(photos()).toHaveAccessibleName("Kèm ảnh (3)");

  // Bỏ 1 phiên → 1.500 giây: hợp lệ.
  await user.click(box(4));
  expect(within(dialog).queryByText("Tổng thời lượng tối đa 30 phút.")).toBeNull();
  expect(create).toBeEnabled();

  // Phiên chọn không có ảnh → "Kèm ảnh (0)" khóa, không gửi kèm ảnh.
  await user.click(box(5));
  expect(photos()).toHaveAccessibleName("Kèm ảnh (0)");
  expect(photos()).toBeDisabled();
  expect(photos()).not.toBeChecked();

  await user.click(box(5));
  await user.click(create);
  expect(await screen.findByText("Lỗi máy chủ.")).toBeInTheDocument();
  expect(body).toMatchObject({
    source_type: "CLAIM",
    claim_id: P3_CLAIM_ID,
    session_ids: ["opt-2", "opt-3", "opt-5"],
    include_snapshots: true,
    recipient: "ĐVVC SPX – phiếu 7788",
    expires_days: 7,
  });
});

test("biên 1.800 giây (đúng 30 phút) vẫn hợp lệ", async () => {
  server.use(
    http.get("/api/v1/shares/options", () =>
      HttpResponse.json({
        ...OPTIONS,
        sessions: [session(1, { duration_s: 1200 }), session(2, { duration_s: 600 })],
      } satisfies ShareOptions),
    ),
  );
  const user = userEvent.setup();
  renderApp(`/admin/claims/${P3_CLAIM_ID}`);
  await user.click(await screen.findByRole("button", { name: "Tạo link chia sẻ" }));
  const dialog = await screen.findByRole("dialog", { name: "Tạo link chia sẻ bằng chứng" });
  await within(dialog).findByText("Phiên gửi kèm (tối đa 4)");
  await user.type(within(dialog).getByLabelText(/^Gửi cho/), "CSKH");
  expect(within(dialog).queryByText("Tổng thời lượng tối đa 30 phút.")).toBeNull();
  expect(within(dialog).getByRole("button", { name: "Tạo link" })).toBeEnabled();
  // Phiên chọn không có ảnh (ảnh của hồ sơ thuộc phiên khác) → "Kèm ảnh (0)" khóa.
  expect(within(dialog).getByRole("checkbox", { name: "Kèm ảnh (0)" })).toBeDisabled();
});
