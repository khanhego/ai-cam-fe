import type { StationState, StationStateName, WorkMode } from "@/lib/api/station";

import { canSwitchMode, needsOperator, selectPanel } from "./selectPanel";

const st = (
  state: StationStateName,
  work_mode: WorkMode,
  extra: Partial<StationState["station"]> = {},
): Pick<StationState, "state" | "station" | "approval_request"> => ({
  state,
  station: { id: "st-1", name: "S", kind: "BOTH", work_mode, operator_name: "Lan", ...extra },
  approval_request: null,
});

test.each<[StationStateName, WorkMode, string]>([
  ["READY", "PACK", "S1"],
  ["READY", "RETURN", "R1"],
  ["PACKING", "PACK", "S2"],
  ["PACKING", "RETURN", "S2"],
  ["MISMATCH", "PACK", "S3"],
  ["MISMATCH", "RETURN", "S3"],
  ["WAITING_APPROVAL", "PACK", "S5"],
  ["WAITING_APPROVAL", "RETURN", "S5"],
  ["INSPECTING", "RETURN", "R2"],
  ["INSPECTING", "PACK", "R2"],
])("selectPanel(%s, %s) → %s", (state, mode, panel) => {
  expect(selectPanel(st(state, mode))).toBe(panel);
});

test("needsOperator: chỉ chế độ RETURN và chưa có tên (BR-28)", () => {
  expect(needsOperator(st("READY", "RETURN", { operator_name: null }))).toBe(true);
  expect(needsOperator(st("READY", "RETURN"))).toBe(false);
  expect(needsOperator(st("READY", "PACK", { operator_name: null }))).toBe(false);
  expect(needsOperator(null)).toBe(false);
});

test("canSwitchMode: station Cả hai, rảnh, không có yêu cầu chờ", () => {
  expect(canSwitchMode(st("READY", "PACK"))).toBe(true);
  expect(canSwitchMode(st("READY", "RETURN", { kind: "RETURN" }))).toBe(false);
  expect(canSwitchMode(st("PACKING", "PACK"))).toBe(false);
  expect(
    canSwitchMode({
      ...st("READY", "PACK"),
      approval_request: { id: "a", type: "REPACK", tracking_number: "X", created_at: "" },
    }),
  ).toBe(false);
});
