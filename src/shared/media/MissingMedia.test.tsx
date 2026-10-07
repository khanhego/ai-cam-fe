/**
 * Item 03 T-265 — clip / ảnh "Thiếu tệp" (01 §10.5 "Clip / ảnh Thiếu tệp" v0.5, FR-02.15, 02.16, EX-K8 / K9; 02b-admin
 * §3 `MissingMediaBlock`, §8 409 `details.status = MISSING`): D4 player + chip + ảnh lúc đóng gói, không "Xuất" / "Cắt
 * lại"; D17 dòng bằng chứng + player; ShareLinkDialog hàng xám "Clip thiếu tệp"; API-40 409 MISSING giữa chừng.
 */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { login } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiError } from "@/mocks/http";
import { findClip } from "@/mocks/packagesDb";
import { MISSING_CLAIM_ID } from "@/mocks/returnsDb";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import { clipStateError } from "./copy";

const MISSING = "Thiếu tệp clip trên máy chủ — không phát được.";
const as = (u = "tst_admin") => login(u, "matkhau123", "DASHBOARD");

test("clipStateError: 409 CLIP_NOT_READY details.status = MISSING → missing", () => {
  expect(clipStateError(new ApiError(409, "CLIP_NOT_READY", MISSING, { status: "MISSING" }))).toEqual({
    kind: "missing",
  });
  expect(clipStateError(new ApiError(409, "CLIP_NOT_READY", "x", { status: "PENDING" }))).toEqual({
    kind: "pending",
  });
});

test("D4: phiên cả 2 clip Thiếu tệp → khối xám, chip, ảnh lúc đóng gói 'Thiếu tệp ảnh', không Xuất / Cắt lại", async () => {
  await as();
  const user = userEvent.setup();
  renderApp("/admin/packages/pkg-0000062");
  const clip = await screen.findByRole("region", { name: "Clip" });
  expect(await within(clip).findByText(MISSING)).toBeInTheDocument();
  expect(within(clip).queryByRole("button", { name: "Xuất clip" })).toBeNull();
  expect(within(clip).queryByRole("button", { name: /Cắt lại/ })).toBeNull();
  expect(within(clip).queryByLabelText("Cam 1")).toBeNull();
  expect(within(clip).getByRole("img", { name: "Ảnh 1: Thiếu tệp ảnh" })).toBeInTheDocument();
  await user.click(within(clip).getByRole("tab", { name: "Cam 2" }));
  expect(within(clip).getByText(MISSING)).toBeInTheDocument();
  expect(within(clip).queryByRole("tab", { name: "Ghép" })).toBeNull();

  const sessions = within(screen.getByRole("region", { name: "Phiên" })).getAllByRole("button");
  expect(within(sessions[0]!).getByText("Thiếu tệp")).toBeInTheDocument();
  // Phiên cũ: Cam 1 còn, Cam 2 thiếu tệp → phát Cam 1, Xuất chỉ còn Cam 1; tab Cam 2 khối xám.
  await user.click(sessions[1]!);
  expect(await within(clip).findByLabelText("Cam 1")).toBeInTheDocument();
  expect(within(clip).getByRole("button", { name: "Xuất clip" })).toBeInTheDocument();
  await user.click(within(clip).getByRole("tab", { name: "Cam 2" }));
  expect(within(clip).getByText(MISSING)).toBeInTheDocument();
});

test("API-40 409 MISSING (clip vừa thành Thiếu tệp sau khi tải trang) → khối xám, không Thử lại", async () => {
  server.use(
    http.get("/api/v1/clips/:id/play-url", () =>
      apiError(409, "CLIP_NOT_READY", MISSING, { status: "MISSING" }),
    ),
  );
  await as();
  renderApp("/admin/packages/pkg-0000001");
  const clip = await screen.findByRole("region", { name: "Clip" });
  expect(await within(clip).findByText(MISSING)).toBeInTheDocument();
  expect(within(clip).queryByRole("button", { name: "Thử lại" })).toBeNull();
});

test("D17: dòng bằng chứng chip 'Thiếu tệp', player khối xám; ShareLinkDialog hàng xám 'Clip thiếu tệp'", async () => {
  await as("tst_cskh");
  const user = userEvent.setup();
  renderApp(`/admin/claims/${MISSING_CLAIM_ID}`);
  const evidence = await screen.findByRole("region", { name: "Bằng chứng" });
  const rows = await within(evidence).findAllByRole("listitem");
  const missingRow = rows.find((r) => r.textContent?.includes("Thiếu tệp"))!;
  expect(within(missingRow).getByText("Thiếu tệp")).toBeInTheDocument();
  await user.click(within(missingRow).getByRole("button", { name: /^Xem / }));
  expect(await within(evidence).findByText(MISSING)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Tạo link chia sẻ" }));
  const dialog = await screen.findByRole("dialog", { name: "Tạo link chia sẻ bằng chứng" });
  const boxes = await within(dialog).findAllByRole("checkbox", { name: /^Đóng gói/ });
  expect(boxes).toHaveLength(2);
  const grey = boxes.find((b) => b.closest("label")!.textContent!.includes("Clip thiếu tệp"))!;
  expect(grey).toBeDisabled();
  expect(grey).not.toBeChecked();
  // G3-EV-4: phiên chính của KN-000142 là phiên thiếu tệp → Alert (API-164 `primary_unavailable`).
  expect(
    within(dialog).getByText("Phiên chính thiếu tệp Cam 1 — khôi phục từ sao lưu hoặc chọn phiên khác."),
  ).toBeInTheDocument();
  const ok = boxes.find((b) => b !== grey)!;
  expect(ok).toBeChecked();
});

test("mock: clip Thiếu tệp có SHA-256 (DB còn), không cắt lại (API-46 409 details.status = MISSING)", async () => {
  await as();
  const c = findClip("clip-0000062-2-1")!;
  expect(c.status).toBe("MISSING");
  expect(c.sha256).toMatch(/^[0-9a-f]{64}$/);
  const res = await fetch("/api/v1/sessions/ses-0000062-2/clips/rebuild", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${(await import("@/lib/api/session")).useSession.getState().accessToken}`,
    },
  });
  expect(res.status).toBe(409);
  expect((await res.json()).error).toMatchObject({ code: "CLIP_NOT_FAILED", details: { status: "MISSING" } });
});
