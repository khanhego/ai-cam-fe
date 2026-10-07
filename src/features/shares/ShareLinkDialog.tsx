import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { claimsApi } from "@/lib/api/claims";
import { isApiError } from "@/lib/api/errors";
import {
  SHARE_EXPIRES_DAYS,
  sharesApi,
  type CreateShareBody,
  type ShareExpiresDays,
  type ShareOptions,
  type ShareOptionSession,
} from "@/lib/api/shares";
import { ShopChip } from "@/shared/filters/ShopChip";
import { fmtShort } from "@/shared/format";
import { SESSION_STATUS, SHARE_LAYOUT, type SessionStatus, type ShareLayout } from "@/shared/labels";
import { CONCLUSION_LABEL } from "@/shared/returns/labels";
import type { Conclusion } from "@/shared/returns/types";
import {
  Alert,
  Button,
  Dialog,
  Icon,
  LinearProgress,
  Skeleton,
  StatusChip,
  TextField,
  toast,
} from "@/shared/ui";

import { exclusionLabel } from "../claims/evidenceChips";
import { COPY } from "./copy";
import { copyLink } from "./copyLink";
import { sharePoll, useBackgroundShares } from "./shareProgress";

export type ShareSourceRef = { type: "CLAIM"; claimId: string } | { type: "SESSION"; sessionId: string };

const RECIPIENT_MIN = 3;
const RECIPIENT_MAX = 100;

/**
 * ShareLinkDialog (01 §10.5 "ShareLinkDialog", FR-07.05, UC-16; 02b-admin §3, §5, §6, §8; DEC-487): chọn phiên (API-164,
 * tối đa 4, tổng ≤ 30 phút, hàng xám + lý do), góc quay, kèm ảnh, gửi cho (3–100), hết hạn 1 / 3 / 7 → API-160 → tiến độ
 * (WS `share.updated` + poll API-162 2 giây) → "Link đã sẵn sàng" + Sao chép / lỗi + Thử lại. Đóng khi đang tạo → chạy nền,
 * Toast khi xong (`ShareCompletionWatcher`). v0.4 (DEC-531): Alert "Cần soát" + "Chưa chọn video mở hộp" (không chặn).
 */
export function ShareLinkDialog({ source, onClose }: { source: ShareSourceRef; onClose: () => void }) {
  const [shareId, setShareId] = useState<string | null>(null);
  const [body, setBody] = useState<CreateShareBody | null>(null);
  if (shareId && body)
    return <ShareProgress shareId={shareId} body={body} onRetried={setShareId} onClose={onClose} />;
  return (
    <ShareForm
      source={source}
      onCreated={(id, b) => {
        setBody(b);
        setShareId(id);
      }}
      onClose={onClose}
    />
  );
}

function sessionText(s: ShareOptionSession): string {
  const parts = [s.type === "PACK" ? COPY.pack : COPY.ret, fmtShort(s.started_at)];
  if (s.status !== "COMPLETED") parts.push(SESSION_STATUS[s.status as SessionStatus]?.[0] ?? s.status);
  if (s.prior_return) parts.push(COPY.prior);
  parts.push(s.station_name);
  if (s.operator_name) parts.push(s.operator_name);
  if (s.conclusion) parts.push(CONCLUSION_LABEL[s.conclusion as Conclusion] ?? s.conclusion);
  parts.push(COPY.duration(s.duration_s));
  return parts.join(" · ");
}

function unavailableText(s: ShareOptionSession): string | null {
  if (s.selectable || !s.unavailable_reason) return null;
  return COPY.unavailable[s.unavailable_reason](s.unavailable_at);
}

function ShareForm({
  source,
  onCreated,
  onClose,
}: {
  source: ShareSourceRef;
  onCreated: (id: string, body: CreateShareBody) => void;
  onClose: () => void;
}) {
  const query = source.type === "CLAIM" ? { claim_id: source.claimId } : { session_id: source.sessionId };
  const options = useQuery({
    queryKey: ["shareOptions", query],
    queryFn: () => sharesApi.options(query),
    retry: false,
  });
  const notFound = isApiError(options.error) && options.error.status === 404 ? options.error.message : null;
  // API-164 404: nguồn không còn → Toast + đóng (02 §6.2 API-164).
  useEffect(() => {
    if (!notFound) return;
    toast(notFound);
    onClose();
  }, [notFound, onClose]);
  if (notFound) return null;
  return (
    <>
      {options.data ? (
        <ShareFormBody
          options={options.data}
          source={source}
          refetch={() => void options.refetch()}
          onCreated={onCreated}
          onClose={onClose}
        />
      ) : (
        <Dialog open title={COPY.title} onClose={onClose} closeLabel={COPY.cancel} wide>
          {options.isError ? (
            <Alert
              kind="error"
              action={
                <Button variant="text" onClick={() => void options.refetch()}>
                  {COPY.retry}
                </Button>
              }
            >
              {COPY.loadError}
            </Alert>
          ) : (
            <div aria-busy="true" aria-label="Đang tải">
              <Skeleton lines={5} className="h-8" />
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}

function ShareFormBody({
  options,
  source,
  refetch,
  onCreated,
  onClose,
}: {
  options: ShareOptions;
  source: ShareSourceRef;
  refetch: () => void;
  onCreated: (id: string, body: CreateShareBody) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(options.sessions.filter((s) => s.default_selected && s.selectable).map((s) => s.id)),
  );
  const [layout, setLayout] = useState<ShareLayout>("SIDE_BY_SIDE");
  const [withPhotos, setWithPhotos] = useState(true);
  const [recipient, setRecipient] = useState("");
  const [recipientTouched, setRecipientTouched] = useState(false);
  const [expires, setExpires] = useState<ShareExpiresDays>(options.default_expires_days);
  const [cloudMissing, setCloudMissing] = useState(!options.storage_configured);
  const { limits } = options;

  // Phiên vừa mất clip (refetch sau 409) → bỏ khỏi lựa chọn.
  const selected = options.sessions.filter((s) => s.selectable && picked.has(s.id));
  const total = selected.reduce((n, s) => n + s.duration_s, 0);
  const sessionError =
    selected.length === 0
      ? COPY.minSessions
      : selected.length > limits.max_sessions
        ? COPY.maxSessions
        : total > limits.max_total_seconds
          ? COPY.maxDuration
          : undefined;
  // M16 (02 §6.2 API-164 — BE DEC-667): link chỉ kèm ảnh của phiên được chọn → số ảnh theo lựa chọn (DEC-801).
  const photoCount = Math.min(
    limits.max_snapshots,
    selected.reduce((n, s) => n + s.snapshot_count, 0),
  );
  const r = recipient.trim();
  const recipientError =
    r.length < RECIPIENT_MIN || r.length > RECIPIENT_MAX ? COPY.recipientRule : undefined;
  const selectableReturns = options.sessions.some((s) => s.type === "RETURN" && s.selectable);
  const noOpeningVideo =
    source.type === "CLAIM" && selectableReturns && !selected.some((s) => s.type === "RETURN");

  const create = useMutation({
    mutationFn: (b: CreateShareBody) => sharesApi.create(b),
    onSuccess: (res, b) => onCreated(res.id, b),
    onError: (e) => {
      if (!isApiError(e)) return toast(COPY.loadError);
      if (e.code === "VALIDATION_ERROR") return;
      if (e.code === "SESSION_CLIP_UNAVAILABLE") {
        toast(e.message);
        return refetch();
      }
      if (e.code === "CLOUD_NOT_CONFIGURED") return setCloudMissing(true);
      toast(e.message);
      if (e.code === "NOT_FOUND") onClose();
    },
  });
  const fields =
    isApiError(create.error) && create.error.code === "VALIDATION_ERROR" ? create.error.fieldErrors : {};
  const valid = !sessionError && !recipientError && !cloudMissing;

  const submit = () => {
    setRecipientTouched(true);
    if (!valid) return;
    create.mutate({
      source_type: source.type,
      claim_id: source.type === "CLAIM" ? source.claimId : null,
      session_id: source.type === "SESSION" ? source.sessionId : null,
      session_ids: selected.map((s) => s.id),
      layout,
      include_snapshots: photoCount > 0 && withPhotos,
      recipient: r,
      expires_days: expires,
    });
  };
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const src = options.source;
  // G3-FE-5 (BR-39): phiên bị loại nhưng thêm tay vào bằng chứng → chip "Bị loại…" kèm lý do của D17 (API-132 trong cache).
  const claimId = source.type === "CLAIM" ? source.claimId : null;
  const claim = useQuery({
    queryKey: ["claim", claimId],
    queryFn: () => claimsApi.get(claimId!),
    enabled: Boolean(claimId) && options.sessions.some((s) => s.excluded),
  });
  const excludedText = (id: string) => {
    const ev = claim.data?.evidence.find((e) => e.kind === "SESSION" && e.session.id === id);
    return COPY.excluded(ev?.kind === "SESSION" ? exclusionLabel(ev.session) : null);
  };

  return (
    <Dialog
      open
      wide
      title={COPY.title}
      onClose={onClose}
      closeLabel={COPY.cancel}
      actions={
        <Button
          disabled={!valid || create.isPending}
          title={cloudMissing ? COPY.cloudMissing : undefined}
          onClick={submit}
        >
          {COPY.create}
        </Button>
      }
    >
      <p className="mb-3 flex flex-wrap items-center gap-2 text-on-surface">
        <span>
          {src.type === "CLAIM" && src.claim_code
            ? COPY.headerClaim(src.claim_code, src.tracking_number)
            : COPY.headerSession(src.tracking_number)}
        </span>
        <ShopChip platform={src.platform} shop={src.shop_name ? { name: src.shop_name } : null} />
      </p>
      {cloudMissing && <Alert kind="warning">{COPY.cloudMissing}</Alert>}
      {options.review_pending_count > 0 && (
        <Alert kind="warning">{COPY.reviewPending(options.review_pending_count)}</Alert>
      )}
      {noOpeningVideo && <Alert kind="warning">{COPY.noOpeningVideo}</Alert>}

      <fieldset className="mb-4">
        <legend className="mb-2 text-label-lg text-on-surface">{COPY.sessions(limits.max_sessions)}</legend>
        {options.sessions.length === 0 || !options.sessions.some((s) => s.selectable) ? (
          <p>{COPY.noSessions}</p>
        ) : null}
        <ul className="flex flex-col gap-1">
          {options.sessions.map((s) => {
            const reason = unavailableText(s);
            const text = sessionText(s);
            return (
              <li
                key={s.id}
                className={s.selectable ? "text-on-surface" : "text-on-surface-variant opacity-70"}
              >
                <label className="flex flex-wrap items-center gap-2 text-body-md">
                  <input
                    type="checkbox"
                    checked={s.selectable && picked.has(s.id)}
                    disabled={!s.selectable}
                    aria-describedby={reason ? `share-unavail-${s.id}` : undefined}
                    onChange={() => toggle(s.id)}
                  />
                  <span>{text}</span>
                  {s.primary && <StatusChip tone="primary">{COPY.primary}</StatusChip>}
                  {s.review_needed && <StatusChip tone="warning">{COPY.review}</StatusChip>}
                  {s.excluded && <StatusChip tone="warning">{excludedText(s.id)}</StatusChip>}
                  {reason && (
                    <span id={`share-unavail-${s.id}`} className="text-body-sm">
                      — {reason}
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
        {(sessionError || fields.session_ids) && (
          <p role="alert" className="mt-1 text-body-sm text-error">
            {fields.session_ids ?? sessionError}
          </p>
        )}
      </fieldset>

      <fieldset className="mb-4">
        <legend className="mb-2 text-label-lg text-on-surface">{COPY.layout}</legend>
        <div className="flex flex-wrap gap-4">
          {(Object.keys(SHARE_LAYOUT) as ShareLayout[]).map((l) => (
            <label key={l} className="flex items-center gap-2 text-body-md text-on-surface">
              <input type="radio" name="share-layout" checked={layout === l} onChange={() => setLayout(l)} />
              {SHARE_LAYOUT[l]}
            </label>
          ))}
        </div>
        {fields.layout && <p className="mt-1 text-body-sm text-error">{fields.layout}</p>}
      </fieldset>

      {options.snapshot_count > 0 && (
        <label className="mb-4 flex items-center gap-2 text-body-md text-on-surface">
          <input
            type="checkbox"
            checked={photoCount > 0 && withPhotos}
            disabled={photoCount === 0}
            onChange={(e) => setWithPhotos(e.target.checked)}
          />
          {COPY.snapshots(photoCount)}
        </label>
      )}

      <TextField
        name="share-recipient"
        label={COPY.recipient}
        hint={COPY.recipientHint}
        maxLength={RECIPIENT_MAX + 20}
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        onBlur={() => setRecipientTouched(true)}
        error={(recipientTouched ? recipientError : undefined) ?? fields.recipient}
      />

      <fieldset className="mb-4">
        <legend className="mb-2 text-label-lg text-on-surface">{COPY.expires}</legend>
        <div className="flex flex-wrap gap-4">
          {SHARE_EXPIRES_DAYS.map((d) => (
            <label key={d} className="flex items-center gap-2 text-body-md text-on-surface">
              <input
                type="radio"
                name="share-expires"
                checked={expires === d}
                onChange={() => setExpires(d)}
              />
              {COPY.days(d)}
            </label>
          ))}
        </div>
        {fields.expires_days && <p className="mt-1 text-body-sm text-error">{fields.expires_days}</p>}
      </fieldset>

      <p className="flex items-start gap-2 text-body-sm">
        <Icon name="info" size={18} />
        <span>{COPY.privacy}</span>
      </p>
    </Dialog>
  );
}

function ShareProgress({
  shareId,
  body,
  onRetried,
  onClose,
}: {
  shareId: string;
  body: CreateShareBody;
  onRetried: (id: string) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const addBackground = useBackgroundShares((s) => s.add);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const share = useQuery({
    queryKey: ["share", shareId],
    queryFn: () => sharesApi.get(shareId),
    refetchInterval: (q) => (!q.state.data || q.state.data.status === "CREATING" ? sharePoll.ms : false),
  });
  const retry = useMutation({
    mutationFn: () => sharesApi.create(body),
    onSuccess: (res) => onRetried(res.id),
    onError: (e) => toast(isApiError(e) ? e.message : COPY.loadError),
  });
  const s = share.data;
  // G3-FE-4: lỗi API-162 khi chưa có dữ liệu → chỉ Alert tải lỗi (không hiện khối "Đang tạo").
  const status = s?.status ?? (share.isError ? null : "CREATING");
  // Xong / lỗi → làm mới khối Link chia sẻ ở D4 / D17 và D21.
  const settled = s && status !== "CREATING" ? shareId : null;
  useEffect(() => {
    if (settled)
      for (const k of [["shares"], ["claim"], ["package"]]) void qc.invalidateQueries({ queryKey: k });
  }, [settled, qc]);
  const close = () => {
    // Link đã tạo (202) — chưa đọc được trạng thái cũng theo dõi nền (Watcher bỏ khi API-162 trả 4xx — G3-FE-2).
    if (!s || status === "CREATING") addBackground(shareId, body.recipient);
    onClose();
  };
  // G3-FE-3: một đường sao chép với D21 / D4 / D17 (`copyLink`: clipboard → execCommand → Toast lỗi); lỗi → chọn sẵn ô link.
  const copy = async () => {
    if (!s?.url) return;
    const ok = await copyLink(s.url);
    if (!ok) inputRef.current?.select();
    setCopied(ok);
  };
  const stepText =
    s?.step === "RENDERING" && s.step_index && s.step_total
      ? COPY.rendering(s.step_index, s.step_total)
      : s?.step
        ? COPY.uploading
        : COPY.rendering(1, body.session_ids.length);

  return (
    <Dialog open wide title={COPY.title} onClose={close} closeLabel={COPY.close}>
      {status === "CREATING" && (
        <div className="flex flex-col gap-2">
          <LinearProgress value={s?.progress ?? 0} label={COPY.progress} />
          <p aria-live="polite" className="text-on-surface">
            {stepText} {s ? `${Math.round(s.progress)}%` : ""}
          </p>
          <p className="text-body-sm">{COPY.background}</p>
        </div>
      )}
      {status === "ACTIVE" && s && (
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-title-md text-on-surface">
            <Icon name="check_circle" className="text-success" />
            {COPY.ready}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-label-lg text-on-surface-variant">
              {COPY.linkLabel}
              <input
                ref={inputRef}
                readOnly
                value={s.url ?? ""}
                className="md-input w-full font-mono text-body-sm"
              />
            </label>
            <Button icon="content_copy" onClick={() => void copy()}>
              {COPY.copy}
            </Button>
          </div>
          <p aria-live="polite" className="sr-only">
            {copied ? COPY.copied : ""}
          </p>
          <p>{COPY.expiresAt(s.expires_at)}</p>
          <p>{COPY.sentTo(s.recipient)}</p>
        </div>
      )}
      {status === "FAILED" && (
        <Alert
          kind="error"
          action={
            <Button variant="text" disabled={retry.isPending} onClick={() => retry.mutate()}>
              {COPY.retry}
            </Button>
          }
        >
          {s?.error?.code === "UPLOAD_FAILED" ? COPY.uploadFailed : COPY.renderFailed}
        </Alert>
      )}
      {/* G3-FE-1: link bị thu hồi / hết hạn (vd. thu hồi ở D21 khi dialog còn mở) — không phải lỗi dựng, không "Thử lại". */}
      {(status === "REVOKED" || status === "EXPIRED") && (
        <Alert kind="warning">{status === "REVOKED" ? COPY.revoked : COPY.expired}</Alert>
      )}
      {share.isError && !s && (
        <Alert
          kind="error"
          action={
            <Button variant="text" onClick={() => void share.refetch()}>
              {COPY.retry}
            </Button>
          }
        >
          {COPY.loadError}
        </Alert>
      )}
    </Dialog>
  );
}
