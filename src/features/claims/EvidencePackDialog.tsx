import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { claimsApi, type ClaimDetail, type EvidencePack } from "@/lib/api/claims";
import { isApiError } from "@/lib/api/errors";
import { downloadUrl } from "@/shared/download";
import { fmtDateTime, fmtNumber, fmtShort, shortHash } from "@/shared/format";
import { CAMERA_ROLE } from "@/shared/labels";
import { Alert, Button, Dialog, LinearProgress, toast } from "@/shared/ui";

import { COPY } from "./copy";
import { packPoll } from "./packPoll";

const P = COPY.pack;
const RUNNING = new Set(["QUEUED", "RUNNING"]);

const fmtSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${fmtNumber(Math.round((bytes / 1024 / 1024) * 10) / 10)} MB`
    : `${fmtNumber(Math.ceil(bytes / 1024))} KB`;

/**
 * Dialog "Xuất gói bằng chứng" (01 §10.5 D17, FR-08.05, UC-12, API-136..138): "Gói gồm: …" → "Tạo gói" → tiến độ %
 * (poll 2 giây + WS) → "Tải gói bằng chứng (.zip)" (lấy lại API-137 để có link ký mới — hạn 10 phút, RF-22; tải bằng
 * `<a download>`), dung lượng, SHA-256, hạn giữ 24 giờ, phần thiếu. `FAILED` → "Thử lại"; `PACK_IN_PROGRESS` → theo
 * dõi gói đang chạy; `NO_EVIDENCE`; API-137 `404` (quá 24 giờ / người khác tạo) → cho tạo lại.
 * `packId` do D17 giữ để đóng / mở lại Dialog vẫn thấy gói đang tạo.
 */
export function EvidencePackDialog({
  claim,
  packId,
  onPackId,
  onClose,
}: {
  claim: ClaimDetail;
  packId: string | null;
  onPackId: (id: string | null) => void;
  onClose: () => void;
}) {
  const [gone, setGone] = useState(false);
  const create = useMutation({
    mutationFn: () => claimsApi.createPack(claim.id),
    onSuccess: (p) => onPackId(p.id),
    onError: (err) => {
      if (isApiError(err) && err.code === "PACK_IN_PROGRESS" && typeof err.details.pack_id === "string")
        onPackId(err.details.pack_id);
    },
  });
  const pack = useQuery({
    queryKey: ["evidence-pack", packId],
    enabled: Boolean(packId),
    queryFn: (): Promise<EvidencePack> => claimsApi.getPack(packId!),
    refetchInterval: (q) =>
      q.state.status === "error" || !RUNNING.has(q.state.data?.status ?? "QUEUED") ? false : packPoll.ms,
  });

  // API-137 404 (quá 24 giờ / người khác tạo) → "Gói không còn", cho tạo lại. Xử lý ở effect, không trong queryFn
  // (queryFn thuần — G3-F21, DEC-355).
  const packGone = isApiError(pack.error) && pack.error.status === 404;
  if (packGone && !gone) setGone(true); // chỉnh state lúc render (không cascade như setState trong effect)
  useEffect(() => {
    if (packGone) onPackId(null);
  }, [packGone, onPackId]);

  const data = packId ? pack.data : undefined;
  const status = data?.status;
  const running = create.isPending || (Boolean(packId) && (!data || RUNNING.has(status!)) && !pack.isError);
  const start = () => {
    setGone(false);
    onPackId(null);
    create.mutate();
  };
  const download = async () => {
    // Link ký hết hạn sau 10 phút → lấy lại API-137 ngay trước khi tải (RF-22).
    const fresh = await pack.refetch();
    if (fresh.error) {
      // 404 → effect hiện "Gói không còn"; lỗi khác → toast (G3-F21).
      if (!(isApiError(fresh.error) && fresh.error.status === 404))
        toast(isApiError(fresh.error) ? fresh.error.message : COPY.generic);
      return;
    }
    const url = fresh.data?.files?.zip;
    if (url) downloadUrl(url, `${claim.code}.zip`);
  };
  const sessions = claim.evidence.filter((e) => e.kind === "SESSION").length;
  const photos = claim.evidence.filter((e) => e.kind === "SNAPSHOT").length;
  const createError = create.error;
  const createText = !createError
    ? null
    : isApiError(createError) && createError.code === "NO_EVIDENCE"
      ? P.noEvidence
      : isApiError(createError) && createError.code === "PACK_IN_PROGRESS"
        ? typeof createError.details.pack_id === "string"
          ? null
          : P.inProgressOther
        : isApiError(createError)
          ? createError.message
          : COPY.generic;
  const sessionAt = (id: string) => {
    const ev = claim.evidence.find((e) => e.kind === "SESSION" && e.session.id === id);
    return ev?.kind === "SESSION" ? fmtShort(ev.session.started_at) : "—";
  };

  return (
    <Dialog
      open
      title={P.title}
      onClose={onClose}
      actions={
        !packId &&
        !create.isPending && (
          <Button icon="folder_zip" onClick={start} disabled={claim.evidence.length === 0}>
            {P.create}
          </Button>
        )
      }
    >
      <p className="mb-3">{P.contents(sessions, photos)}</p>
      {claim.evidence.length === 0 && <Alert kind="warning">{P.noEvidence}</Alert>}
      {gone && !packId && <Alert kind="warning">{P.gone}</Alert>}
      {createText && <Alert kind="error">{createText}</Alert>}
      {running && (
        <div className="flex flex-col gap-2">
          <p className="text-on-surface">
            {P.progress}
            {data ? ` · ${data.progress}%` : ""}
          </p>
          <LinearProgress value={data?.progress ?? 0} label={P.progress} />
        </div>
      )}
      {packId && pack.isError && !gone && (
        <Alert
          kind="error"
          action={
            <Button variant="elevated" size="sm" onClick={() => pack.refetch()}>
              {P.retry}
            </Button>
          }
        >
          {isApiError(pack.error) ? pack.error.message : COPY.generic}
        </Alert>
      )}
      {status === "FAILED" && (
        <Alert
          kind="error"
          action={
            <Button variant="elevated" size="sm" onClick={start}>
              {P.retry}
            </Button>
          }
        >
          {P.failed}
        </Alert>
      )}
      {status === "READY" && data && (
        <div className="flex flex-col gap-2">
          <Alert kind="success">{P.ready}</Alert>
          {data.size_bytes != null && (
            <p>
              {P.size}: <span className="tabular-nums">{fmtSize(data.size_bytes)}</span>
            </p>
          )}
          {data.sha256 && (
            <p>
              SHA-256{" "}
              <span className="font-mono text-on-surface" title={data.sha256}>
                {shortHash(data.sha256)}
              </span>
            </p>
          )}
          {data.expires_at && (
            <p className="text-body-sm">
              {P.keepUntil} {fmtDateTime(data.expires_at)}
            </p>
          )}
          {(data.missing?.length ?? 0) > 0 && (
            <div>
              <p className="text-on-surface">{P.missing}</p>
              <ul className="list-disc pl-5 text-body-sm">
                {data.missing!.map((m, i) => (
                  <li key={i}>
                    {P.camera(CAMERA_ROLE[m.camera_role] ?? m.camera_role, sessionAt(m.session_id))}:{" "}
                    {P.missingReason[m.reason] ?? m.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <Button icon="download" onClick={download} disabled={pack.isFetching}>
              {P.download}
            </Button>
            <p className="mt-1 text-body-sm">{P.linkNote}</p>
          </div>
        </div>
      )}
    </Dialog>
  );
}
