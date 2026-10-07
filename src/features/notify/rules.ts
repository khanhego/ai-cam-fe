import {
  NOTIFY_RULES,
  type ChannelInput,
  type NotifyChannel,
  type NotifyMessageFilters,
} from "@/lib/api/notify";
import { NOTIFY_MESSAGE_STATUS, type NotifyMessageStatus } from "@/shared/labels";

import { DIALOG, QUIET } from "./copy";

/** Mọi query D22 (`["notify", "channels"]`, `["notify", "messages", …]`) — làm mới sau API-171..174, 176. */
export const NOTIFY_KEY = ["notify"] as const;
export const CHANNELS_KEY = ["notify", "channels"] as const;

export type ChannelErrors = Partial<Record<keyof ChannelInput, string>>;

/** Validate client (02b-admin §5 ChannelDialog) — server vẫn là nơi chặn (422). */
export function channelErrors(f: ChannelInput): ChannelErrors {
  const out: ChannelErrors = {};
  const name = f.name.trim();
  if (name.length < NOTIFY_RULES.nameMin || name.length > NOTIFY_RULES.nameMax) out.name = DIALOG.nameRule;
  const target = f.target.trim();
  const re = f.type === "TELEGRAM" ? NOTIFY_RULES.telegramTarget : NOTIFY_RULES.zaloTarget;
  if (!re.test(target)) out.target = DIALOG.targetRule[f.type];
  if (f.events.length === 0) out.events = DIALOG.eventsRule;
  return out;
}

/** PATCH chỉ trường đổi (API-172 "trường tùy chọn"); `events` so như tập. */
export function changedFields(before: NotifyChannel, after: ChannelInput): Partial<ChannelInput> {
  const out: Partial<ChannelInput> = {};
  if (after.name !== before.name) out.name = after.name;
  if (after.type !== before.type) out.type = after.type;
  if (after.target !== before.target || out.type) out.target = after.target;
  const same =
    after.events.length === before.events.length && after.events.every((e) => before.events.includes(e));
  if (!same) out.events = after.events;
  if (after.enabled !== before.enabled) out.enabled = after.enabled;
  return out;
}

export type QuietErrors = { start?: string; end?: string };

/** Giờ yên lặng (02b-admin §5): `HH:MM`, khác nhau. Khi tắt vẫn gửi 2 giờ (API-176 cần đủ). */
export function quietErrors(start: string, end: string): QuietErrors {
  const out: QuietErrors = {};
  if (!NOTIFY_RULES.time.test(start)) out.start = QUIET.timeRule;
  if (!NOTIFY_RULES.time.test(end)) out.end = QUIET.timeRule;
  if (!out.start && !out.end && start === end) out.end = QUIET.sameRule;
  return out;
}

/** Bộ lọc nhật ký gửi ↔ URL (02b-admin §1: `?channel=&status=&page=`). */
export type LogUrlFilters = { channel?: string; status?: NotifyMessageStatus; page?: number };
export const LOG_PAGE_SIZE = 20;

export function logFiltersFromParams(p: URLSearchParams): LogUrlFilters {
  const status = p.get("status") ?? "";
  const page = Number(p.get("page"));
  return {
    channel: p.get("channel") || undefined,
    status: status in NOTIFY_MESSAGE_STATUS ? (status as NotifyMessageStatus) : undefined,
    page: Number.isInteger(page) && page > 1 ? page : undefined,
  };
}

export function paramsFromLogFilters(f: LogUrlFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.channel) out.channel = f.channel;
  if (f.status) out.status = f.status;
  if (f.page && f.page > 1) out.page = String(f.page);
  return out;
}

export const toApiLogFilters = (f: LogUrlFilters): NotifyMessageFilters => ({
  channel_id: f.channel,
  status: f.status,
  page: f.page ?? 1,
  page_size: LOG_PAGE_SIZE,
});
