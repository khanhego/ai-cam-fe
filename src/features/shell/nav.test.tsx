/** Drawer item 02 (02b-admin §2, 01 §10.3, ma trận 01 §5.10) + NavBadge (DEC-243) — T-152. */
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";

import { createQueryClient } from "@/app/queryClient";
import { login } from "@/lib/api/auth";
import { mockClaims, mockReconAlerts } from "@/mocks/returnsDb";

import { navFor, type Item02Screen } from "./nav";
import { NavBadge } from "./NavBadge";

const ALL = new Set<Item02Screen>(["D14", "D15", "D16"]);
const labels = (role: Parameters<typeof navFor>[0], ready?: ReadonlySet<Item02Screen>) =>
  navFor(role, ready).map((i) => i.label);

test("DEC-342: đủ màn D14 (T-153), D15 (T-156), D16 (T-157) → 3 mục trong drawer cho ADMIN / SUPERVISOR / CSKH", () => {
  for (const role of ["ADMIN", "SUPERVISOR", "CSKH"] as const) {
    expect(labels(role)).toContain("Hàng hoàn");
    expect(labels(role)).toContain("Lệch trạng thái");
    expect(labels(role)).toContain("Hồ sơ khiếu nại");
  }
  expect(labels("STATION")).toEqual([]);
});

test("FR-10.02 / 01 §5.10: khi màn có — 3 mục sau 'Tra cứu đơn' cho ADMIN, SUPERVISOR, CSKH; STATION không có", () => {
  expect(labels("ADMIN", ALL).slice(0, 5)).toEqual([
    "Tổng quan",
    "Tra cứu đơn",
    "Hàng hoàn",
    "Lệch trạng thái",
    "Hồ sơ khiếu nại",
  ]);
  expect(labels("CSKH", ALL)).toEqual([
    "Tổng quan",
    "Tra cứu đơn",
    "Hàng hoàn",
    "Lệch trạng thái",
    "Hồ sơ khiếu nại",
  ]);
  expect(labels("SUPERVISOR", ALL)).toContain("Hồ sơ khiếu nại");
  expect(labels("STATION", ALL)).toEqual([]);
  const items = navFor("ADMIN", ALL);
  expect(items.find((i) => i.to === "/admin/recon")).toMatchObject({ badge: "recon", icon: "rule" });
  expect(items.find((i) => i.to === "/admin/claims")).toMatchObject({ badge: "claims", icon: "gavel" });
  expect(items.find((i) => i.to === "/admin/returns")).toMatchObject({ icon: "assignment_return" });
  // Chỉ mở một màn → chỉ mục đó hiện.
  expect(labels("CSKH", new Set<Item02Screen>(["D15"]))).toContain("Lệch trạng thái");
  expect(labels("CSKH", new Set<Item02Screen>(["D15"]))).not.toContain("Hàng hoàn");
});

function renderBadge(kind: "approvals" | "recon" | "claims") {
  const client = createQueryClient({ retryDelay: 0 });
  return render(
    <QueryClientProvider client={client}>
      <span>
        <NavBadge kind={kind} />
      </span>
    </QueryClientProvider>,
  );
}

test("TC-09.21 (badge): Lệch = số cảnh báo Cao đang mở, Hồ sơ = số sắp hết hạn (API-32); câu đầy đủ cho trình đọc màn hình", async () => {
  await login("tst_cskh", "matkhau123", "DASHBOARD");
  renderBadge("recon");
  expect(await screen.findByText(", 3 cảnh báo mức Cao đang mở")).toHaveClass("sr-only");
  expect(screen.getByText("3")).toHaveAttribute("aria-hidden", "true");
});

test("badge Hồ sơ: số sắp hết hạn; = 0 thì không hiện", async () => {
  await login("tst_cskh", "matkhau123", "DASHBOARD");
  const { unmount } = renderBadge("claims");
  expect(await screen.findByText(/hồ sơ sắp hết hạn/)).toBeInTheDocument();
  unmount();
  mockClaims.forEach((c) => (c.status = "CLOSED"));
  mockReconAlerts.forEach((a) => (a.status = "RESOLVED"));
  const { container } = renderBadge("claims");
  renderBadge("recon");
  await new Promise((r) => setTimeout(r, 300));
  expect(container.textContent).toBe("");
  expect(screen.queryByText(/sắp hết hạn|mức Cao/)).not.toBeInTheDocument();
});

test("badge Yêu cầu duyệt giữ như Phase 1 (API-20 PENDING)", async () => {
  await login("tst_sup", "matkhau123", "DASHBOARD");
  renderBadge("approvals");
  expect(await screen.findByText(", 1 yêu cầu đang chờ")).toBeInTheDocument();
});
