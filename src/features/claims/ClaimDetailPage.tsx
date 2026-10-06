import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { claimsApi, type ClaimDetail } from "@/lib/api/claims";
import { isApiError } from "@/lib/api/errors";
import { usersApi } from "@/lib/api/users";
import { CLAIM_STATUS, CLAIM_TYPE, COUNTERPARTY, fmtVnd, RETURN_KIND } from "@/shared/returns/labels";
import {
  Alert,
  Button,
  EmptyState,
  Skeleton,
  StatusChip,
  TextField,
  toast,
  TrackingNumber,
} from "@/shared/ui";

import { useAuth } from "../auth/useAuth";
import { ClaimNotes } from "./ClaimNotes";
import { ClaimStatusMenu, ClaimSteps } from "./ClaimStatusStepper";
import { COPY } from "./copy";
import { Deadline } from "./Deadline";
import { EvidenceList } from "./EvidenceList";
import { EvidencePackDialog } from "./EvidencePackDialog";
import { claimErrorText, ownClaimVersions, useClaimMutation } from "./useClaimMutation";

const D = COPY.detail;
const ACTIVE = new Set(["NEW", "SUBMITTED", "WAITING"]);
const OWNER_ROLES = new Set(["ADMIN", "SUPERVISOR", "CSKH"]);
const VN = "+07:00";

/** ISO → giá trị `datetime-local` theo giờ Việt Nam ("2026-10-08T17:00"). */
function toVnLocal(iso: string | null): string {
  if (!iso) return "";
  const vn = new Date(Date.parse(iso) + 7 * 3600_000).toISOString();
  return vn.slice(0, 16);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-body-md text-on-surface">
      <span className="text-on-surface-variant">{label}:</span>
      {children}
    </div>
  );
}

/** Phụ trách (02b §5 D17): CSKH / SUPERVISOR chỉ "Nhận phụ trách"; ADMIN chọn được người khác (API-90 chỉ ADMIN). */
function OwnerField({ claim, editable }: { claim: ClaimDetail; editable: boolean }) {
  const me = useAuth((s) => s.me)!;
  const isAdmin = me.role === "ADMIN";
  const users = useQuery({
    queryKey: ["users", "owners"],
    queryFn: usersApi.all,
    enabled: editable && isAdmin,
    staleTime: 5 * 60_000,
  });
  const [pick, setPick] = useState("");
  const save = useClaimMutation<string>(claim.id, (owner, c) =>
    claimsApi.patch(claim.id, { version: c.version, owner_user_id: owner }),
  );
  const fieldError =
    isApiError(save.error) && save.error.code === "VALIDATION_ERROR"
      ? save.error.fieldErrors.owner_user_id
      : null;
  const alert = claimErrorText(save.error);
  const owners = (users.data ?? []).filter((u) => u.is_active && OWNER_ROLES.has(u.role));
  return (
    <Row label={D.owner}>
      <span>{claim.owner?.display_name ?? COPY.noOwner}</span>
      {editable && claim.owner?.id !== me.id && (
        <Button
          variant="text"
          size="sm"
          icon="person_add"
          disabled={save.isPending}
          onClick={() => save.mutate(me.id)}
        >
          {D.take}
        </Button>
      )}
      {editable && isAdmin && owners.length > 0 && (
        <span className="inline-flex items-center gap-1">
          <select
            aria-label={D.pickOwner}
            className="md-input h-9 py-0"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
          >
            <option value="">—</option>
            {owners.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name}
              </option>
            ))}
          </select>
          <Button
            variant="text"
            size="sm"
            disabled={!pick || pick === claim.owner?.id || save.isPending}
            onClick={() => save.mutate(pick)}
          >
            {D.saveOwner}
          </Button>
        </span>
      )}
      {(fieldError || alert) && <span className="w-full text-body-sm text-error">{fieldError ?? alert}</span>}
    </Row>
  );
}

/** Hạn: hiện "(còn 2 ngày)" + "Đổi hạn" (giờ Việt Nam → `Z`; đổi → `deadline_source = MANUAL`). */
function DeadlineField({ claim, editable }: { claim: ClaimDetail; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(toVnLocal(claim.deadline_at));
  const save = useClaimMutation<string>(
    claim.id,
    (v, c) =>
      claimsApi.patch(claim.id, { version: c.version, deadline_at: new Date(`${v}:00${VN}`).toISOString() }),
    () => setEditing(false),
  );
  const alert = claimErrorText(save.error);
  return (
    <Row label={D.deadline}>
      <Deadline
        at={claim.deadline_at}
        active={ACTIVE.has(claim.status)}
        full
        source={claim.deadline_source}
      />
      {editable && !editing && (
        <Button
          variant="text"
          size="sm"
          icon="event"
          onClick={() => {
            setValue(toVnLocal(claim.deadline_at));
            setEditing(true);
          }}
        >
          {D.editDeadline}
        </Button>
      )}
      {editing && (
        <span className="inline-flex flex-wrap items-center gap-1">
          <input
            type="datetime-local"
            aria-label={D.newDeadline}
            className="md-input h-9 py-0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <Button
            variant="text"
            size="sm"
            disabled={!value || save.isPending}
            onClick={() => save.mutate(value)}
          >
            {D.saveDeadline}
          </Button>
          <Button variant="text" size="sm" onClick={() => setEditing(false)}>
            {D.cancel}
          </Button>
        </span>
      )}
      {alert && <span className="w-full text-body-sm text-error">{alert}</span>}
    </Row>
  );
}

/** Mã tham chiếu sàn (1–64) — sửa độc lập với đổi trạng thái. */
function RefField({ claim, editable }: { claim: ClaimDetail; editable: boolean }) {
  const [ref, setRef] = useState(claim.platform_claim_ref ?? "");
  const [syncedFor, setSyncedFor] = useState(claim.platform_claim_ref);
  if (syncedFor !== claim.platform_claim_ref) {
    setSyncedFor(claim.platform_claim_ref);
    setRef(claim.platform_claim_ref ?? "");
  }
  const save = useClaimMutation<string>(claim.id, (v, c) =>
    claimsApi.patch(claim.id, { version: c.version, platform_claim_ref: v }),
  );
  const v = ref.trim();
  const tooLong = v.length > 64;
  const fieldError =
    isApiError(save.error) && save.error.code === "VALIDATION_ERROR"
      ? save.error.fieldErrors.platform_claim_ref
      : undefined;
  if (!editable)
    return (
      <Row label={D.ref}>
        <span className="font-mono">{claim.platform_claim_ref ?? "—"}</span>
      </Row>
    );
  return (
    <div className="flex flex-wrap items-start gap-2">
      <TextField
        name="claim-ref"
        label={D.ref}
        value={ref}
        className="mb-0 min-w-56 flex-1 sm:max-w-sm"
        error={tooLong ? D.refMax : (fieldError ?? claimErrorText(save.error) ?? undefined)}
        onChange={(e) => setRef(e.target.value)}
      />
      <Button
        variant="tonal"
        className="mt-1"
        disabled={!v || tooLong || v === claim.platform_claim_ref || save.isPending}
        onClick={() => save.mutate(v)}
      >
        {D.saveRef}
      </Button>
    </div>
  );
}

/**
 * D17 — Chi tiết hồ sơ khiếu nại (01 §10.5, FR-08.02, 08.03, 08.06, UC-04): header + tiến trình + "Đổi trạng thái",
 * đơn / kiện / hàng hoàn, phụ trách, hạn, mã tham chiếu sàn, bằng chứng (`EvidenceList` + `ClipPlayer`), ghi chú.
 * Sửa chờ server + `version` (DEC-241); WS `claim.updated` của người khác → tải lại + toast "Hồ sơ vừa được cập nhật."
 * Hồ sơ Đóng → chỉ xem (trừ ghi chú, xuất gói).
 */
export default function ClaimDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ["claim", id], queryFn: () => claimsApi.get(id) });
  const claim = query.data;
  const [packOpen, setPackOpen] = useState(false);
  // Gói đang tạo của hồ sơ này — giữ khi đóng / mở lại Dialog (theo dõi tiến độ tiếp).
  const [pack, setPack] = useState<{ claimId: string; packId: string } | null>(null);

  // Bản mới do người khác (WS `claim.updated` → invalidate) → báo một lần.
  const seen = useRef<{ id: string; version: number } | null>(null);
  useEffect(() => {
    if (!claim) return;
    const prev = seen.current;
    seen.current = { id: claim.id, version: claim.version };
    if (
      prev?.id === claim.id &&
      claim.version !== prev.version &&
      ownClaimVersions.get(claim.id) !== claim.version
    )
      toast(D.changedElsewhere);
  }, [claim]);

  if (query.isPending)
    return (
      <div aria-busy="true" aria-label={D.loading}>
        <Skeleton className="mb-2 h-8 w-80" />
        <Skeleton className="mb-6 h-4 w-96" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="card mb-4 p-4">
            <Skeleton lines={3} className="h-5" />
          </div>
        ))}
      </div>
    );
  if (query.isError) {
    if (isApiError(query.error) && query.error.status === 404)
      return (
        <EmptyState
          icon="search_off"
          title={D.notFound}
          action={
            <Button variant="tonal" onClick={() => navigate("/admin/claims")}>
              {D.back}
            </Button>
          }
        />
      );
    return (
      <Alert
        kind="error"
        action={
          <Button variant="text" onClick={() => query.refetch()}>
            {D.retry}
          </Button>
        }
      >
        {D.error}
      </Alert>
    );
  }

  const c = query.data;
  const editable = c.status !== "CLOSED";
  const [statusLabel, statusTone] = CLAIM_STATUS[c.status];
  const rc = c.return_case;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-headline-sm text-on-surface">
            <span className="font-mono">{c.code}</span>{" "}
            <span>
              · {CLAIM_TYPE[c.type]} · {D.to(COUNTERPARTY[c.counterparty])}
            </span>{" "}
            <StatusChip tone={statusTone}>{statusLabel}</StatusChip>
          </h1>
          <div className="mt-2">
            <ClaimSteps status={c.status} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ClaimStatusMenu claim={c} />
          {/* Hồ sơ đã Đóng vẫn xuất được (01 §10.5 D17). */}
          <Button icon="folder_zip" onClick={() => setPackOpen(true)}>
            {COPY.pack.open}
          </Button>
        </div>
      </div>

      {!editable && <Alert kind="info">{D.closedNotice}</Alert>}

      <section className="card mb-4 flex flex-col gap-2 p-4" aria-label={c.code}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-md text-on-surface">
          {c.order && <span>{D.order(c.order.platform_order_sn)} ·</span>}
          <span className="inline-flex items-center gap-1">
            {D.package}{" "}
            <TrackingNumber value={c.package.tracking_number} to={`/admin/packages/${c.package.id}`} />
          </span>
          {rc && (
            <span>
              · {D.returnCase}: {RETURN_KIND[rc.kind]?.[0] ?? rc.kind} ({rc.return_tracking_number ?? rc.code}
              )
            </span>
          )}
        </div>
        <OwnerField claim={c} editable={editable} />
        <DeadlineField claim={c} editable={editable} />
        <RefField claim={c} editable={editable} />
        {c.recovered_amount != null && (
          <Row label={D.recovered}>
            <span className="tabular-nums">{fmtVnd(c.recovered_amount)}</span>
          </Row>
        )}
        {c.close_reason && (
          <Row label={D.closeReason}>
            <span>{c.close_reason}</span>
          </Row>
        )}
      </section>

      <div className="grid gap-4 *:min-w-0 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="card p-4" aria-labelledby="d17-evidence">
          <h2 id="d17-evidence" className="mb-3 text-title-md text-on-surface">
            {COPY.evidence.title}
          </h2>
          <EvidenceList claim={c} editable={editable} />
        </section>
        <section className="card p-4" aria-labelledby="d17-notes">
          <h2 id="d17-notes" className="mb-3 text-title-md text-on-surface">
            {COPY.notes.title}
          </h2>
          <ClaimNotes claim={c} />
        </section>
      </div>
      {packOpen && (
        <EvidencePackDialog
          claim={c}
          packId={pack?.claimId === c.id ? pack.packId : null}
          onPackId={(packId) => setPack(packId ? { claimId: c.id, packId } : null)}
          onClose={() => setPackOpen(false)}
        />
      )}
      <p className="mt-4">
        <Link to="/admin/claims" className="text-label-lg text-primary hover:underline">
          {D.back}
        </Link>
      </p>
    </>
  );
}
