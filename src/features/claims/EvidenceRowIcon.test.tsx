/**
 * G3-FE-7 — dòng phiên bằng chứng D17 (01 §10.5 D17 "✔ Phiên …"): ✔ xanh chỉ cho bằng chứng dùng được; phiên bị loại
 * (BR-39, thêm tay) hoặc chỉ còn clip "Thiếu tệp" → icon trung tính.
 */
import { screen, within } from "@testing-library/react";

import { login } from "@/lib/api/auth";
import { findSessionAnywhere, mockClaims, P3_CLAIM_ID } from "@/mocks/returnsDb";
import { renderApp } from "@/test/render";

beforeEach(() => login("tst_cskh", "matkhau123", "DASHBOARD"));

const rowIcon = (row: HTMLElement) => row.querySelector<HTMLElement>(":scope > .icon")!;

test("phiên bị loại / chỉ clip MISSING → icon trung tính; phiên dùng được → ✔ xanh", async () => {
  const claim = mockClaims.find((c) => c.id === P3_CLAIM_ID)!;
  claim.evidence.push({
    id: "ev-t-m",
    kind: "SESSION",
    ref_id: "ses-p3-m",
    auto: false,
    added_at: claim.created_at,
  });
  for (const cl of findSessionAnywhere("ses-p3-r")!.session.clips) cl.status = "MISSING";
  renderApp(`/admin/claims/${P3_CLAIM_ID}`);
  const section = (await screen.findByRole("heading", { name: "Bằng chứng" })).closest("section")!;
  const rows = await within(section).findAllByRole("listitem");
  const sessionRows = rows.filter((li) => rowIcon(li));
  const byText = (text: string) => sessionRows.find((li) => li.textContent!.includes(text))!;

  const excluded = byText("Đã đánh dấu quét nhầm");
  expect(rowIcon(excluded)).toHaveTextContent("do_not_disturb_on");
  expect(rowIcon(excluded)).not.toHaveClass("text-success");

  const missing = sessionRows.find((li) => li.textContent!.includes("Thiếu tệp"))!;
  expect(rowIcon(missing)).toHaveTextContent("videocam_off");
  expect(rowIcon(missing)).not.toHaveClass("text-success");

  const ok = byText("Phiên đóng gói");
  expect(rowIcon(ok)).toHaveTextContent("check_circle");
  expect(rowIcon(ok)).toHaveClass("text-success");
});
