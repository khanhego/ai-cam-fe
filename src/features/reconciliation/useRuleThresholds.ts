import { useQuery } from "@tanstack/react-query";

import { settingsApi } from "@/lib/api/settings";
import type { RuleThresholds } from "@/shared/returns/labels";

import { useAuth } from "../auth/useAuth";

/**
 * Ngưỡng chèn vào tên quy tắc ("quá {N} ngày", "{X} giờ") từ API-80 — chỉ ADMIN / SUPERVISOR đọc được cài đặt;
 * CSKH dùng mặc định 7 ngày / 24 giờ (02b-admin §9, DEC-343 d).
 */
export function useRuleThresholds(): RuleThresholds {
  const role = useAuth((s) => s.me?.role);
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.get,
    enabled: role === "ADMIN" || role === "SUPERVISOR",
  });
  return settings.data ?? {};
}
