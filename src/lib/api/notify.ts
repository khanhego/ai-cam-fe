import type { NotifyChannelType, NotifyMessageStatus } from "@/shared/labels";

import { api } from "./client";
import type { Page } from "./stations";

/** API-170..176 (02 §6.2) — kênh thông báo Telegram / Zalo OA (D22). Chỉ ADMIN. */
export type NotifyEventCode = `N${"01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10"}`;
export type NotifySeverity = "HIGH" | "MEDIUM" | "INFO";

/** Danh mục sự kiện: nhãn + mức do server trả (FE không chép cứng — 02b-admin §9). */
export type NotifyEvent = {
  code: NotifyEventCode;
  label: string;
  severity: NotifySeverity;
  suggested_channel: string | null;
};

export type QuietHours = { enabled: boolean; start: string; end: string };

/**
 * `items[].last_error` (02 §6.2 v0.5 — FE DEC-763 / BE DEC-730): `null` hoặc object, không bao giờ là chuỗi.
 * `message` tiếng Việt như 502 / 504 của API-174; `provider_code` = mã của nhà cung cấp (có thể null).
 */
export type NotifyChannelError = {
  code: "NOTIFY_SEND_FAILED" | "NOTIFY_TIMEOUT" | (string & {});
  message: string;
  /** BE (`ChannelError.at`) cho phép null. */
  at: string | null;
  provider_code: string | null;
};

export type NotifyChannel = {
  id: string;
  name: string;
  type: NotifyChannelType;
  /** Chat ID Telegram / Zalo user ID. */
  target: string;
  events: NotifyEventCode[];
  enabled: boolean;
  last_status: "OK" | "ERROR" | "NEVER";
  last_sent_at: string | null;
  last_error: NotifyChannelError | null;
  created_at: string;
};

export type NotifyChannels = {
  providers: Record<NotifyChannelType, { configured: boolean }>;
  quiet_hours: QuietHours;
  events: NotifyEvent[];
  items: NotifyChannel[];
};

export type ChannelInput = {
  name: string;
  type: NotifyChannelType;
  target: string;
  events: NotifyEventCode[];
  enabled: boolean;
};

export type NotifyMessage = {
  id: string;
  channel: { id: string; name: string };
  event_code: NotifyEventCode;
  event_label: string;
  item_count: number;
  /** BE `MessageOut.text` cho phép null (tin tóm tắt chưa dựng) — DEC-802. */
  text: string | null;
  status: NotifyMessageStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
  next_attempt_at: string | null;
};

export type NotifyMessageFilters = {
  channel_id?: string;
  status?: NotifyMessageStatus;
  page?: number;
  page_size?: number;
};

/** Ràng buộc client (02b-admin §5) — server là nơi chặn (422). */
export const NOTIFY_RULES = {
  nameMin: 2,
  nameMax: 40,
  telegramTarget: /^-?\d{1,20}$/,
  zaloTarget: /^\d{1,64}$/,
  time: /^([01]\d|2[0-3]):[0-5]\d$/,
} as const;

export const notifyApi = {
  channels: () => api.get<NotifyChannels>("/notify/channels"),
  /** API-171 → 201. 422 `fields.*`; 409 CHANNEL_NAME_EXISTS / PROVIDER_NOT_CONFIGURED. */
  create: (body: ChannelInput) => api.post<NotifyChannel>("/notify/channels", body),
  update: (id: string, body: Partial<ChannelInput>) =>
    api.patch<NotifyChannel>(`/notify/channels/${id}`, body),
  /** API-173 → 204 (tin chờ của kênh → `DROPPED`). */
  remove: (id: string) => api.delete<void>(`/notify/channels/${id}`),
  /** API-174 (≤ 10 giây): 502 NOTIFY_SEND_FAILED (`details.provider_code`), 504 NOTIFY_TIMEOUT. */
  test: (id: string) => api.post<{ ok: true; sent_at: string }>(`/notify/channels/${id}/test`),
  messages: (filters: NotifyMessageFilters) =>
    api.get<Page<NotifyMessage>>("/notify/messages", { query: filters }),
  /** API-176: 422 `fields.start` / `fields.end`. */
  quietHours: (body: QuietHours) => api.put<QuietHours>("/notify/quiet-hours", body),
};
