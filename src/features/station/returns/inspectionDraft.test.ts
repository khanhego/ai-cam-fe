import type { StationState } from "@/lib/api/station";
import type { Inspection } from "@/shared/returns/types";

import { draftFromServer, editDraft, syncDraft, toInput } from "./inspectionDraft";

const insp = (over: Partial<Inspection> = {}): Inspection => ({
  conclusion: null,
  note: "",
  saved_at: null,
  lines_mode: "FULL",
  lines: [
    {
      order_item_id: "oi-1",
      product_name: "Áo thun basic",
      variation: "Đen / L",
      image_url: null,
      quantity_sent: 2,
      quantity_requested: 2,
      quantity_received: 2,
      condition: "OK",
      note: null,
    },
  ],
  ...over,
});

const stateWith = (id: string, inspection: Inspection | null, type: "PACK" | "RETURN" = "RETURN") =>
  ({ session: { id, type, inspection } }) as unknown as StationState;

test("draftFromServer: saved_at có → 'saved', không → 'idle'", () => {
  expect(draftFromServer("s1", insp()).saveStatus).toBe("idle");
  expect(draftFromServer("s1", insp({ saved_at: "2026-10-06T00:00:00Z" })).saveStatus).toBe("saved");
});

test("syncDraft: không phải phiên RETURN → null; phiên mới → lấy theo server", () => {
  expect(syncDraft(null, stateWith("s1", null, "PACK"))).toBeNull();
  const prev = draftFromServer("s0", insp({ conclusion: "DAMAGED" }));
  expect(syncDraft(prev, stateWith("s1", insp()))?.conclusion).toBeNull();
});

test("syncDraft: nháp đang sửa (dirty) giữ nguyên; không dirty → server ghi đè", () => {
  const d = editDraft(draftFromServer("s1", insp()), { note: "đang gõ" });
  expect(syncDraft(d, stateWith("s1", insp({ note: "cũ" })))?.note).toBe("đang gõ");
  const clean = { ...d, dirty: false };
  expect(syncDraft(clean, stateWith("s1", insp({ note: "server" })))?.note).toBe("server");
});

test("editDraft: đang chọn Nguyên vẹn mà dòng thành thiếu → bỏ chọn + okCleared (BR-22)", () => {
  const ok = editDraft(draftFromServer("s1", insp()), { conclusion: "OK" });
  expect(ok.conclusion).toBe("OK");
  const lines = ok.lines.map((l) => ({ ...l, quantity_received: 1 }));
  const next = editDraft(ok, { lines });
  expect(next.conclusion).toBeNull();
  expect(next.okCleared).toBe(true);
  expect(next.dirty).toBe(true);
  expect(next.rev).toBe(ok.rev + 1);
});

test("editDraft: REFERENCE không khóa Nguyên vẹn", () => {
  const d = draftFromServer("s1", insp({ lines_mode: "REFERENCE" }));
  const next = editDraft(d, {
    conclusion: "OK",
    lines: d.lines.map((l) => ({ ...l, quantity_received: 0 })),
  });
  expect(next.conclusion).toBe("OK");
});

test("toInput: FULL gửi dòng; REFERENCE không gửi dòng", () => {
  const d = editDraft(draftFromServer("s1", insp()), { conclusion: "DAMAGED", note: "x" });
  expect(toInput(d)).toEqual({
    conclusion: "DAMAGED",
    note: "x",
    lines: [{ order_item_id: "oi-1", quantity_received: 2, condition: "OK", note: null }],
  });
  expect(toInput({ ...d, linesMode: "REFERENCE" }).lines).toEqual([]);
});
