/**
 * Item 03 T-261 — lọc sàn / shop + chip ở D3 / D14 / D15 / D16 (FR-07.01, DEC-488), D14 tab Chỉ hoàn tiền (FR-08.08,
 * BR-40), D4 người đóng gói + `AMBIGUOUS_SHOP` (FR-03.16, BR-32), D10 nhãn action mới (FR-10.03). MSW (02b-admin §12).
 */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { login } from "@/lib/api/auth";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

/** Bắt query của request API (kiểm URL → tham số API). */
function captureQuery(path: string) {
  const seen: URLSearchParams[] = [];
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    if (url.pathname === `/api/v1${path}`) seen.push(url.searchParams);
  });
  return seen;
}

afterEach(() => server.events.removeAllListeners());

const headers = (table: HTMLElement) =>
  within(table)
    .getAllByRole("columnheader")
    .map((th) => th.textContent);

describe("D3 Tra cứu đơn", () => {
  beforeEach(() => login("tst_cskh", "matkhau123", "DASHBOARD"));

  test("URL platform=TIKTOK → API platform, mọi dòng chip TikTok; chọn shop ghi `shop` vào URL", async () => {
    const seen = captureQuery("/packages");
    const user = userEvent.setup();
    const router = renderApp("/admin/packages?platform=TIKTOK");
    const table = await screen.findByRole("table");
    expect(headers(table)).toContain("Sàn · Shop");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows)
      expect(within(r).getByRole("img", { name: /^Sàn: TikTok Shop/ })).toBeInTheDocument();
    expect(seen.at(-1)?.get("platform")).toBe("TIKTOK");

    await waitFor(() =>
      expect(screen.getByLabelText("Shop").querySelectorAll("option").length).toBeGreaterThan(1),
    );
    const shopSelect = screen.getByLabelText("Shop");
    const tiktokA = within(shopSelect).getByRole("option", {
      name: "TST TikTok A (mock)",
    }) as HTMLOptionElement;
    await user.selectOptions(shopSelect, tiktokA.value);
    await waitFor(() => expect(router.state.location.search).toContain(`shop=${tiktokA.value}`));
    await waitFor(() => expect(seen.at(-1)?.get("shop_id")).toBe(tiktokA.value));
  });

  test("link D2 phiên hoàn hủy / bỏ dở: chip lọc + return_dropped=true gửi API; bỏ chip → bỏ lọc", async () => {
    const seen = captureQuery("/packages");
    const user = userEvent.setup();
    const router = renderApp("/admin/packages?session_type=RETURN&return_dropped=true");
    const chip = await screen.findByRole("button", { name: "Bỏ lọc Phiên hoàn hủy / bỏ dở (trừ quét nhầm)" });
    await waitFor(() => expect(seen.at(-1)?.get("return_dropped")).toBe("true"));
    await user.click(chip);
    await waitFor(() => expect(router.state.location.search).not.toContain("return_dropped"));
  });

  test("session_status nhiều giá trị → chip 'Đã hủy / Bỏ dở'", async () => {
    renderApp("/admin/packages?session_status=CANCELLED,ABANDONED");
    expect(await screen.findByRole("button", { name: "Bỏ lọc Đã hủy / Bỏ dở" })).toBeInTheDocument();
  });
});

describe("D14 tab Chỉ hoàn tiền", () => {
  beforeEach(() => login("tst_cskh", "matkhau123", "DASHBOARD"));

  test("cột Hạn phản hồi + Hồ sơ khiếu nại, đếm ngược đỏ ≤ 48 giờ, chip Chỉ chưa xử lý ghi pending_only", async () => {
    const seen = captureQuery("/returns");
    const user = userEvent.setup();
    const router = renderApp("/admin/returns?tab=NO_PARCEL");
    const table = await screen.findByRole("table");
    expect(headers(table)).toEqual(expect.arrayContaining(["Sàn · Shop", "Hạn phản hồi", "Hồ sơ khiếu nại"]));
    expect(headers(table)).not.toContain("Thao tác");
    // HH-000061 (04 §1): TikTok, hạn sàn còn 30 giờ.
    const row61 = within(table)
      .getAllByRole("row")
      .find((r) => within(r).queryByRole("img", { name: /TikTok/ }))!;
    expect(
      within(row61).getByRole("img", { name: /^Sàn: TikTok Shop, shop TST TikTok A \(mock\)/ }),
    ).toBeInTheDocument();
    expect(within(row61).getByText(/^còn 1 ngày (5|6) giờ$/)).toBeInTheDocument();
    expect(within(row61).getByRole("button", { name: "Tạo hồ sơ khiếu nại" })).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Chỉ chưa xử lý" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);
    await waitFor(() => expect(router.state.location.search).toContain("pending_only=true"));
    await waitFor(() => expect(seen.at(-1)?.get("pending_only")).toBe("true"));
    expect(screen.getByRole("button", { name: "Chỉ chưa xử lý" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2));
  });

  test("link D2 REFUND_ONLY_PENDING mở thẳng tab + chip bật; tab khác không gửi pending_only", async () => {
    const seen = captureQuery("/returns");
    renderApp("/admin/returns?tab=NO_PARCEL&pending_only=true");
    expect(await screen.findByRole("button", { name: "Chỉ chưa xử lý" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await waitFor(() => expect(seen.at(-1)?.get("pending_only")).toBe("true"));
    seen.length = 0;
    await userEvent.click(screen.getByRole("tab", { name: /^Đang về/ }));
    await waitFor(() => expect(seen.at(-1)?.get("tab")).toBe("EXPECTED"));
    expect(seen.at(-1)?.get("pending_only")).toBeNull();
    expect(screen.queryByRole("button", { name: "Chỉ chưa xử lý" })).toBeNull();
  });
});

test("D15 / D16: lọc Sàn ghi URL + gửi API, cột chip sàn", async () => {
  await login("tst_sup", "matkhau123", "DASHBOARD");
  const user = userEvent.setup();
  const seenRecon = captureQuery("/recon-alerts");
  const recon = renderApp("/admin/recon");
  expect(headers(await screen.findByRole("table"))).toContain("Sàn · Shop");
  await user.selectOptions(screen.getByLabelText("Sàn"), "SHOPEE");
  await waitFor(() => expect(recon.state.location.search).toContain("platform=SHOPEE"));
  await waitFor(() => expect(seenRecon.some((q) => q.get("platform") === "SHOPEE")).toBe(true));
});

test("D16: lọc Sàn TikTok → URL + API", async () => {
  await login("tst_cskh", "matkhau123", "DASHBOARD");
  const user = userEvent.setup();
  const seen = captureQuery("/claims");
  const router = renderApp("/admin/claims?status=ALL");
  expect(headers(await screen.findByRole("table"))).toContain("Sàn · Shop");
  await user.selectOptions(screen.getByLabelText("Sàn"), "TIKTOK");
  await waitFor(() => expect(router.state.location.search).toContain("platform=TIKTOK"));
  await waitFor(() => expect(seen.some((q) => q.get("platform") === "TIKTOK")).toBe(true));
});

describe("D4 Chi tiết đơn", () => {
  beforeEach(() => login("tst_cskh", "matkhau123", "DASHBOARD"));

  test("chip sàn · shop ở tiêu đề + 'Người đóng gói: Minh' ở phiên đóng gói", async () => {
    renderApp("/admin/packages/pkg-SPXTSTB000000001");
    const h1 = await screen.findByRole("heading", { level: 1 });
    expect(within(h1).getByRole("img", { name: "Sàn: Shopee, shop TST B" })).toBeInTheDocument();
    expect(await screen.findByText(/Người đóng gói: Minh/)).toBeInTheDocument();
  });

  test("TC-05.93: kiện mã có ở 2 shop → 'Chưa rõ sàn' + dòng thời gian liệt kê shop", async () => {
    renderApp("/admin/packages/pkg-SPXTSTX0000001");
    const h1 = await screen.findByRole("heading", { level: 1 });
    expect(within(h1).getByText("Chưa rõ sàn")).toBeInTheDocument();
    expect(
      await screen.findByText(/^Mã có ở 2 shop: TST B \(Shopee\), TST TikTok B \(mock\) \(TikTok\)/),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Mã có ở nhiều shop").length).toBeGreaterThan(0);
  });
});

test("D10: bộ lọc hành động có nhãn item 03", async () => {
  await login("tst_admin", "matkhau123", "DASHBOARD");
  renderApp("/admin/settings/audit");
  const select = await screen.findByLabelText("Hành động");
  for (const label of [
    "Tạo link chia sẻ",
    "Thu hồi link",
    "Ngắt kết nối shop",
    "Bỏ bằng chứng",
    "Đánh dấu phiên quét nhầm",
  ])
    expect(within(select).getByRole("option", { name: label })).toBeInTheDocument();
});
