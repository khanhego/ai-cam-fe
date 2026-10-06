import type { PackageSession, Protection } from "@/lib/api/packages";

/** Gộp `protection` của các clip còn (không `DELETED`) trong phiên — API-31 v0.2 (DEC-245). */
export function sessionProtection(session: PackageSession): Protection | null {
  const all = session.clips
    .filter((c) => c.status !== "DELETED")
    .map((c) => c.protection)
    .filter(Boolean);
  if (all.length === 0) return null;
  const uniq = <T>(xs: T[]) => [...new Set(xs)];
  const list = all as Protection[];
  // Có lý do vô hạn (`until = null`) ở bất kỳ clip nào → vô hạn; còn lại lấy hạn muộn nhất.
  const until = list.some((p) => p.until === null)
    ? null
    : list
        .map((p) => p.until!)
        .sort()
        .at(-1)!;
  return {
    reasons: uniq(list.flatMap((p) => p.reasons)),
    claims: uniq(list.flatMap((p) => p.claims)),
    return_cases: uniq(list.flatMap((p) => p.return_cases)),
    until,
  };
}
