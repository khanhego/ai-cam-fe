import { http, HttpResponse } from "msw";

import {
  NOTIFY_RULES,
  type ChannelInput,
  type NotifyChannel,
  type NotifyChannels,
  type NotifyEvent,
  type NotifyMessage,
  type QuietHours,
} from "@/lib/api/notify";

import { API, apiError, json } from "../http";
import { requireRole } from "./session";

/**
 * API-170..176 (02 §6.2, 02b-admin §12): Telegram đã cấu hình, `ZALO_OA` chưa; "Gửi thử" Telegram lỗi 502 khi `target` =
 * `-1000000000000`, 504 khi `target` = `-1009999999999`.
 */
const iso = (ms: number) => new Date(ms).toISOString();
export const FAIL_TARGET = "-1000000000000";
export const TIMEOUT_TARGET = "-1009999999999";

/** Danh mục N01..N10 (01 §7.5) — FE đọc nhãn từ đây, không chép cứng. */
export const NOTIFY_EVENTS: NotifyEvent[] = [
  { code: "N01", label: "Camera mất tín hiệu", severity: "HIGH", suggested_channel: "Kho" },
  { code: "N02", label: "Lệch trạng thái mức Cao", severity: "HIGH", suggested_channel: "Kho" },
  { code: "N03", label: "Phiên mở hoàn bị hủy / bỏ dở", severity: "MEDIUM", suggested_channel: "Kho" },
  { code: "N04", label: "Chỉ hoàn tiền mới / sắp hạn", severity: "HIGH", suggested_channel: "CSKH" },
  { code: "N05", label: "Hồ sơ khiếu nại sắp / quá hạn", severity: "HIGH", suggested_channel: "CSKH" },
  {
    code: "N06",
    label: "Shop hết hạn ủy quyền / đồng bộ lỗi",
    severity: "HIGH",
    suggested_channel: "Quản trị",
  },
  { code: "N07", label: "Ổ lưu video sắp đầy", severity: "MEDIUM", suggested_channel: "Quản trị" },
  { code: "N08", label: "Sao lưu cloud trễ / lỗi", severity: "HIGH", suggested_channel: "Quản trị" },
  { code: "N09", label: "Yêu cầu duyệt chờ lâu", severity: "MEDIUM", suggested_channel: "Kho" },
  { code: "N10", label: "Tóm tắt ngày", severity: "INFO", suggested_channel: "Chủ shop" },
];

export const mockNotify = {
  providers: { TELEGRAM: { configured: true }, ZALO_OA: { configured: false } },
  quiet: { enabled: true, start: "22:00", end: "07:00" } as QuietHours,
  channels: [] as NotifyChannel[],
  messages: [] as NotifyMessage[],
};
let seq = 0;

export function resetMockNotify() {
  seq = 0;
  const now = Date.now();
  mockNotify.providers = { TELEGRAM: { configured: true }, ZALO_OA: { configured: false } };
  mockNotify.quiet = { enabled: true, start: "22:00", end: "07:00" };
  mockNotify.channels = [
    {
      id: "ch-kho",
      name: "Kho",
      type: "TELEGRAM",
      target: "-1001234567890",
      events: ["N01", "N02", "N03", "N09"],
      enabled: true,
      last_status: "OK",
      last_sent_at: iso(now - 40 * 60_000),
      last_error: null,
      created_at: iso(now - 10 * 86_400_000),
    },
    {
      id: "ch-cskh",
      name: "CSKH",
      type: "TELEGRAM",
      target: FAIL_TARGET,
      events: ["N04", "N05"],
      enabled: true,
      last_status: "ERROR",
      last_sent_at: null,
      last_error: {
        code: "NOTIFY_SEND_FAILED",
        message: "Telegram không nhận Chat ID này. Kiểm tra bot đã vào nhóm.",
        at: iso(now - 26 * 3_600_000),
        provider_code: "400",
      },
      created_at: iso(now - 5 * 86_400_000),
    },
  ];
  mockNotify.channels.push({
    id: "ch-owner",
    name: "Chủ shop",
    type: "TELEGRAM",
    target: "123456789",
    events: ["N10"],
    enabled: false,
    last_status: "NEVER",
    last_sent_at: null,
    last_error: null,
    created_at: iso(now - 3 * 86_400_000),
  });
  const event = (c: string) => NOTIFY_EVENTS.find((e) => e.code === c)!;
  const PREFIX = { HIGH: "[CAO]", MEDIUM: "[TB]", INFO: "[TIN]" } as const;
  // Kênh của tin = kênh đăng ký sự kiện đó (N04 / N05 → CSKH, còn lại → Kho).
  const rows: [string, NotifyMessage["status"], number, number, string | null][] = [
    ["N02", "SENT", 2, 1, null],
    ["N01", "SENT", 1, 1, null],
    ["N05", "RETRYING", 1, 2, "Telegram không nhận Chat ID này. Kiểm tra bot đã vào nhóm."],
    ["N09", "HELD", 3, 0, null],
    ["N03", "SKIPPED", 1, 0, null],
    ["N04", "DROPPED", 1, 9, "Telegram không nhận Chat ID này. Kiểm tra bot đã vào nhóm."],
  ];
  mockNotify.messages = rows.map(([code, status, count, attempts, err], i) => {
    const ch = mockNotify.channels.find((c) => c.events.includes(code as NotifyMessage["event_code"]))!;
    const e = event(code);
    return {
      id: `msg-${i + 1}`,
      channel: { id: ch.id, name: ch.name },
      event_code: e.code,
      event_label: e.label,
      item_count: count,
      text: `${PREFIX[e.severity]} ${e.label} — ${count} mục\nXem: https://x.local/admin`,
      status,
      attempts,
      last_error: err,
      created_at: iso(now - (i + 1) * 3_600_000),
      sent_at: status === "SENT" ? iso(now - (i + 1) * 3_600_000 + 5000) : null,
      next_attempt_at: status === "RETRYING" ? iso(now + 5 * 60_000) : null,
    };
  });
}
resetMockNotify();

const ADMIN = ["ADMIN"] as const;

function validate(body: Partial<ChannelInput>, partial: boolean, selfId?: string): Response | null {
  const fields: Record<string, string> = {};
  const name = body.name?.trim();
  if (!partial || body.name !== undefined) {
    if (!name || name.length < NOTIFY_RULES.nameMin || name.length > NOTIFY_RULES.nameMax)
      fields.name = "Tên 2–40 ký tự.";
  }
  const type = body.type ?? mockNotify.channels.find((c) => c.id === selfId)?.type;
  if (!partial || body.type !== undefined) {
    if (type !== "TELEGRAM" && type !== "ZALO_OA") fields.type = "Không hợp lệ";
  }
  if (!partial || body.target !== undefined) {
    const t = body.target?.trim() ?? "";
    if (type === "TELEGRAM" && !NOTIFY_RULES.telegramTarget.test(t))
      fields.target = "Chat ID là một số (nhóm thường bắt đầu bằng -100).";
    if (type === "ZALO_OA" && !NOTIFY_RULES.zaloTarget.test(t)) fields.target = "Zalo user ID 1–64 chữ số.";
  }
  if (!partial || body.events !== undefined) {
    const codes = new Set(NOTIFY_EVENTS.map((e) => e.code));
    if (!body.events?.length || body.events.some((e) => !codes.has(e)))
      fields.events = "Chọn ít nhất 1 sự kiện.";
  }
  if (Object.keys(fields).length)
    return apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", { fields });
  if (name && mockNotify.channels.some((c) => c.id !== selfId && c.name.toLowerCase() === name.toLowerCase()))
    return apiError(409, "CHANNEL_NAME_EXISTS", "Đã có kênh tên này.", {
      fields: { name: "Đã có kênh tên này." },
    });
  if (type && body.type !== undefined && !mockNotify.providers[type].configured)
    return apiError(
      409,
      "PROVIDER_NOT_CONFIGURED",
      type === "ZALO_OA"
        ? "Chưa cấu hình Zalo OA trên máy chủ. Liên hệ IT."
        : "Chưa cấu hình bot Telegram trên máy chủ. Liên hệ IT.",
    );
  return null;
}

export const notifyHandlers = [
  http.get(`${API}/notify/channels`, ({ request }) => {
    const [, denied] = requireRole(request, [...ADMIN]);
    if (denied) return denied;
    const body: NotifyChannels = {
      providers: mockNotify.providers,
      quiet_hours: mockNotify.quiet,
      events: NOTIFY_EVENTS,
      items: mockNotify.channels,
    };
    return json(body);
  }),

  http.post(`${API}/notify/channels`, async ({ request }) => {
    const [, denied] = requireRole(request, [...ADMIN]);
    if (denied) return denied;
    const body = (await request.json()) as Partial<ChannelInput>;
    const err = validate(body, false);
    if (err) return err;
    seq += 1;
    const channel: NotifyChannel = {
      id: `ch-new-${seq}`,
      name: body.name!.trim(),
      type: body.type!,
      target: body.target!.trim(),
      events: body.events!,
      enabled: body.enabled ?? true,
      last_status: "NEVER",
      last_sent_at: null,
      last_error: null,
      created_at: new Date().toISOString(),
    };
    mockNotify.channels.push(channel);
    return json(channel, { status: 201 });
  }),

  http.patch(`${API}/notify/channels/:id`, async ({ request, params }) => {
    const [, denied] = requireRole(request, [...ADMIN]);
    if (denied) return denied;
    const channel = mockNotify.channels.find((c) => c.id === params.id);
    if (!channel) return apiError(404, "NOT_FOUND", "Không tìm thấy kênh.");
    const body = (await request.json()) as Partial<ChannelInput>;
    const err = validate(body, true, channel.id);
    if (err) return err;
    Object.assign(channel, {
      ...body,
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.target !== undefined ? { target: body.target.trim() } : {}),
    });
    return json(channel);
  }),

  http.delete(`${API}/notify/channels/:id`, ({ request, params }) => {
    const [, denied] = requireRole(request, [...ADMIN]);
    if (denied) return denied;
    const i = mockNotify.channels.findIndex((c) => c.id === params.id);
    if (i < 0) return apiError(404, "NOT_FOUND", "Không tìm thấy kênh.");
    mockNotify.channels.splice(i, 1);
    for (const m of mockNotify.messages)
      if (m.channel.id === params.id && ["QUEUED", "HELD", "RETRYING"].includes(m.status))
        m.status = "DROPPED";
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${API}/notify/channels/:id/test`, ({ request, params }) => {
    const [, denied] = requireRole(request, [...ADMIN]);
    if (denied) return denied;
    const channel = mockNotify.channels.find((c) => c.id === params.id);
    if (!channel) return apiError(404, "NOT_FOUND", "Không tìm thấy kênh.");
    if (!mockNotify.providers[channel.type].configured)
      return apiError(409, "PROVIDER_NOT_CONFIGURED", "Chưa cấu hình bot Telegram trên máy chủ. Liên hệ IT.");
    const now = new Date().toISOString();
    if (channel.target === TIMEOUT_TARGET) {
      const message = "Không kết nối được Telegram từ máy chủ (mạng chặn?).";
      Object.assign(channel, {
        last_status: "ERROR",
        last_error: { code: "NOTIFY_TIMEOUT", message, at: now, provider_code: null },
      });
      return apiError(504, "NOTIFY_TIMEOUT", message);
    }
    if (channel.target === FAIL_TARGET) {
      const message =
        channel.type === "TELEGRAM"
          ? "Telegram không nhận Chat ID này. Kiểm tra bot đã vào nhóm."
          : "Người nhận chưa quan tâm OA của shop.";
      Object.assign(channel, {
        last_status: "ERROR",
        last_error: { code: "NOTIFY_SEND_FAILED", message, at: now, provider_code: "400" },
      });
      return apiError(502, "NOTIFY_SEND_FAILED", message, { provider_code: "400" });
    }
    Object.assign(channel, { last_status: "OK", last_sent_at: now, last_error: null });
    return json({ ok: true, sent_at: now });
  }),

  http.get(`${API}/notify/messages`, ({ request }) => {
    const [, denied] = requireRole(request, [...ADMIN]);
    if (denied) return denied;
    const p = new URL(request.url).searchParams;
    const all = mockNotify.messages.filter(
      (m) =>
        (!p.get("channel_id") || m.channel.id === p.get("channel_id")) &&
        (!p.get("status") || m.status === p.get("status")),
    );
    const page = Math.max(1, Number(p.get("page") ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(p.get("page_size") ?? 20) || 20));
    return json({
      items: all.slice((page - 1) * pageSize, page * pageSize),
      page,
      page_size: pageSize,
      total: all.length,
    });
  }),

  http.put(`${API}/notify/quiet-hours`, async ({ request }) => {
    const [, denied] = requireRole(request, [...ADMIN]);
    if (denied) return denied;
    const body = (await request.json()) as Partial<QuietHours>;
    const fields: Record<string, string> = {};
    if (!NOTIFY_RULES.time.test(body.start ?? "")) fields.start = "Giờ dạng HH:MM.";
    if (!NOTIFY_RULES.time.test(body.end ?? "")) fields.end = "Giờ dạng HH:MM.";
    if (!fields.start && !fields.end && body.start === body.end)
      fields.end = "Giờ kết thúc phải khác giờ bắt đầu.";
    if (Object.keys(fields).length)
      return apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", { fields });
    mockNotify.quiet = { enabled: body.enabled ?? true, start: body.start!, end: body.end! };
    return json(mockNotify.quiet);
  }),
];
