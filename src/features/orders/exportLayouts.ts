import type { ExportLayout } from "@/lib/api/clips";
import type { PackageSession } from "@/lib/api/packages";

/** Chu kỳ poll API-44 (02b-admin §4: 2 giây). Đối tượng để test rút ngắn được. */
export const exportPoll = { ms: 2000 };

/** Layout xuất được theo clip READY của phiên (Ghép cần cả hai). */
export function exportLayouts(session: PackageSession): ExportLayout[] {
  const ready = (r: "CAM1" | "CAM2") =>
    session.clips.some((c) => c.camera_role === r && c.status === "READY");
  const out: ExportLayout[] = [];
  if (ready("CAM1")) out.push("CAM1");
  if (ready("CAM2")) out.push("CAM2");
  if (ready("CAM1") && ready("CAM2")) out.push("SIDE_BY_SIDE");
  return out;
}
