/**
 * Item 03 T-261 — D2 Tổng quan mở rộng (01 §10.5 D2, 02 §6.2 "API-32 mở rộng"; FR-09.01, 08.08, 08.10): thẻ "Phiên hoàn
 * hủy / bỏ dở (7 ngày)", 4 mục Cần xử lý mới, `SYNC_ERROR` có tên shop / sàn.
 */
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { login } from "@/lib/api/auth";
import type { AnyAttentionItem } from "@/lib/api/reports";
import { mockReportsState } from "@/mocks/handlers/reports";
import { vnDay } from "@/shared/format";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import { attentionText } from "./copy";
import { droppedPath } from "./links";

const COUNTS = {
  packed: 0,
  had_mismatch: 0,
  abandoned: 0,
  cancelled: 0,
  packed_not_handed_over: 0,
  cancelled_after_pack: 0,
  returns_received: 0,
  returns_received_issue: 0,
  returns_unidentified: 0,
  returns_expected: 0,
  returns_missing: 0,
  recon_open: { HIGH: 0, MEDIUM: 0, LOW: 0 },
  claims_open: 0,
  claims_due_soon: 0,
  label_on_tray: 0,
  cam2_unverified: 0,
  returns_dropped_7d: 3,
  refund_only_pending: 2,
  claims_overdue_unsent: 1,
};
const ATTENTION: AnyAttentionItem[] = [
  { kind: "REFUND_ONLY_PENDING", count: 2, nearest_due_at: "2026-10-07T14:00:00Z" },
  { kind: "CLAIM_OVERDUE", count: 1 },
  { kind: "RETURN_SESSION_DROPPED", count: 3 },
  { kind: "BACKUP_STALE", reason: "DB_LATE", hours: 27 },
  {
    kind: "SYNC_ERROR",
    shop_id: "s",
    at: "2026-10-07T01:00:00Z",
    shop_name: "Áo Đẹp Outlet",
    platform: "TIKTOK",
    code: "AUTH_EXPIRED",
  },
];

function mockDaily() {
  server.use(
    http.get("/api/v1/reports/daily", () =>
      Response.json({ date: vnDay(), counts: COUNTS, stations: [], attention: ATTENTION }),
    ),
  );
}

describe("attentionText item 03", () => {
  test("chữ theo 01 §10.5 D2 / 02 §6.2 API-32", () => {
    expect(attentionText(ATTENTION[0]!)).toBe(
      "2 yêu cầu Chỉ hoàn tiền chưa xử lý · hạn gần nhất 07/10 21:00",
    );
    expect(attentionText({ kind: "REFUND_ONLY_PENDING", count: 1, nearest_due_at: null })).toBe(
      "1 yêu cầu Chỉ hoàn tiền chưa xử lý",
    );
    expect(attentionText(ATTENTION[1]!)).toBe("1 hồ sơ quá hạn chưa gửi");
    expect(attentionText(ATTENTION[2]!)).toBe("3 phiên mở hoàn bị hủy / bỏ dở trong 7 ngày");
    expect(attentionText(ATTENTION[3]!)).toBe("Sao lưu cloud trễ 27 giờ");
    expect(attentionText({ kind: "BACKUP_STALE", reason: "DB_FAILED_TWICE" })).toBe(
      "2 lần sao lưu DB gần nhất không thành công",
    );
    expect(attentionText({ kind: "BACKUP_STALE", reason: "HASH_MISMATCH", count: 2 })).toBe(
      "2 tệp lệch mã băm",
    );
    expect(attentionText({ kind: "BACKUP_STALE", reason: "SOURCE_MISSING", count: 1 })).toBe(
      "1 tệp bằng chứng không thấy tại kho",
    );
    expect(attentionText(ATTENTION[4]!)).toBe("Shop Áo Đẹp Outlet (TikTok) hết hạn ủy quyền");
    expect(
      attentionText({
        kind: "SYNC_ERROR",
        shop_id: "s",
        at: "2026-10-07T01:00:00Z",
        shop_name: "TST B",
        platform: "SHOPEE",
        code: "RATE_LIMIT",
      }),
    ).toBe("Shop TST B (Shopee) đồng bộ lỗi lúc 07/10 08:00");
  });

  test("link 7 ngày: date_from = hôm nay − 7 (giờ VN)", () => {
    expect(droppedPath("2026-10-07")).toBe(
      "/admin/packages?session_type=RETURN&return_dropped=true&date_from=2026-09-30",
    );
  });
});

test("D2 (ADMIN): thẻ Phiên hoàn hủy / bỏ dở → D3 lọc sẵn; 4 mục mới + SYNC_ERROR; BACKUP_STALE → D23 (T-259)", async () => {
  mockDaily();
  await login("tst_admin", "matkhau123", "DASHBOARD");
  const router = renderApp("/admin");

  const kpi = await screen.findByRole("link", { name: /^Phiên hoàn hủy \/ bỏ dở \(7 ngày\): 3\./ });
  expect(kpi).toHaveAttribute("href", droppedPath(vnDay()));

  const list = screen.getByRole("heading", { name: "Cần xử lý" }).closest("section")!;
  const row = (text: string) => within(list).getByText(text).closest("li")!;
  expect(
    within(row("2 yêu cầu Chỉ hoàn tiền chưa xử lý · hạn gần nhất 07/10 21:00")).getByRole("link", {
      name: "Xem",
    }),
  ).toHaveAttribute("href", "/admin/returns?tab=NO_PARCEL&pending_only=true");
  expect(within(row("1 hồ sơ quá hạn chưa gửi")).getByRole("link", { name: "Xem" })).toHaveAttribute(
    "href",
    "/admin/claims?status=NEW&due=overdue",
  );
  expect(
    within(row("3 phiên mở hoàn bị hủy / bỏ dở trong 7 ngày")).getByRole("link", { name: "Xem" }),
  ).toHaveAttribute("href", droppedPath(vnDay()));
  expect(within(row("Sao lưu cloud trễ 27 giờ")).getByRole("link", { name: "Xem" })).toHaveAttribute(
    "href",
    "/admin/settings/backup",
  );
  expect(
    within(row("Shop Áo Đẹp Outlet (TikTok) hết hạn ủy quyền")).getByRole("link", { name: "Xem" }),
  ).toHaveAttribute("href", "/admin/settings/platforms");

  await userEvent.click(kpi);
  expect(router.state.location.search).toContain("return_dropped=true");
  expect(await screen.findByText("Phiên hoàn hủy / bỏ dở (trừ quét nhầm)")).toBeInTheDocument();
});

test("D2 CANCEL_REVERT_PENDING (chỉ ADMIN): nhãn kiện hủy oan chờ aicam fix-cancel-requests, không có nút mở màn", async () => {
  expect(attentionText({ kind: "CANCEL_REVERT_PENDING", count: 3 })).toBe(
    "3 kiện bị hủy oan chờ khôi phục — chạy lệnh aicam fix-cancel-requests trên máy chủ",
  );
  mockReportsState.cancelRevertPending = 3;
  await login("tst_admin", "matkhau123", "DASHBOARD");
  renderApp("/admin");
  const list = (await screen.findByRole("heading", { name: "Cần xử lý" })).closest("section")!;
  const row = (
    await within(list).findByText(
      "3 kiện bị hủy oan chờ khôi phục — chạy lệnh aicam fix-cancel-requests trên máy chủ",
    )
  ).closest("li")!;
  expect(within(row).queryByRole("link")).toBeNull();
  cleanup();

  await login("tst_sup", "matkhau123", "DASHBOARD");
  renderApp("/admin");
  const list2 = (await screen.findByRole("heading", { name: "Cần xử lý" })).closest("section")!;
  expect(within(list2).queryByText(/hủy oan/)).toBeNull();
});
