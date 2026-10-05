import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { isApiError } from "@/lib/api/errors";
import { shopsApi, type Shop } from "@/lib/api/shops";
import { fmtDateTime, fmtNumber } from "@/shared/format";
import { Alert, Button, EmptyState, PageHeader, Skeleton, StatusChip, toast } from "@/shared/ui";

import { COPY } from "./copy";

/** Sau "Đồng bộ ngay": làm mới 5 giây × 6 lần (02b-admin §4). */
const SYNC_POLL_MS = 5000;
const SYNC_POLL_WINDOW_MS = 30_000;

const errorText = (shop: Shop) => {
  const e = shop.last_error;
  if (!e) return null;
  return COPY.syncError(e.at ? fmtDateTime(e.at) : null, e.message ?? e.code ?? null);
};

function ShopCard({
  shop,
  onConnect,
  connecting,
  onSync,
  syncing,
}: {
  shop: Shop;
  onConnect: () => void;
  connecting: boolean;
  onSync: () => void;
  syncing: boolean;
}) {
  const [label, tone] = COPY.status[shop.auth_status] ?? [shop.auth_status, "neutral"];
  const connected = shop.auth_status === "CONNECTED";
  const name = shop.name ?? COPY.unnamed;
  const error = errorText(shop);
  return (
    <section aria-label={name} className="card p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-title-lg text-on-surface">{name}</h2>
        <StatusChip tone={tone}>{label}</StatusChip>
      </div>
      {shop.auth_status === "EXPIRED" && <Alert kind="warning">{COPY.expiredHint}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
      <dl className="mb-6 grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-body-sm text-on-surface-variant">{COPY.field.expires}</dt>
          <dd className="text-body-lg text-on-surface tabular-nums">{fmtDateTime(shop.auth_expires_at)}</dd>
        </div>
        <div>
          <dt className="text-body-sm text-on-surface-variant">{COPY.field.lastSync}</dt>
          <dd className="text-body-lg text-on-surface tabular-nums">{fmtDateTime(shop.last_synced_at)}</dd>
        </div>
        <div>
          <dt className="text-body-sm text-on-surface-variant">{COPY.field.today}</dt>
          <dd className="text-body-lg text-on-surface tabular-nums">{fmtNumber(shop.today_synced_orders)}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant={connected ? "outlined" : "filled"}
          icon="link"
          disabled={connecting}
          onClick={onConnect}
        >
          {shop.auth_status === "DISCONNECTED" ? COPY.connect : COPY.reconnect}
        </Button>
        {connected && (
          <Button icon="sync" disabled={syncing} onClick={onSync}>
            {COPY.sync}
          </Button>
        )}
      </div>
    </section>
  );
}

/** D7 — Kết nối Shopee (01 §10.5, FR-05.01, UC-10). Kết quả callback API-72 đọc từ `?result=`. */
export default function ShopeePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const result = params.get("result");
  const [problem, setProblem] = useState<{ text: string; toImports?: boolean } | null>(null);
  const [pollUntil, setPollUntil] = useState(0);

  const shops = useQuery({
    queryKey: ["shops"],
    queryFn: shopsApi.list,
    refetchInterval: () => (Date.now() < pollUntil ? SYNC_POLL_MS : false),
  });

  const connect = useMutation({
    mutationFn: shopsApi.authUrl,
    onMutate: () => {
      setProblem(null);
      if (result) setParams({}, { replace: true });
    },
    onSuccess: ({ url }) => {
      // Đường dẫn cùng app (mock) → router; URL Shopee → rời trang sang trang ủy quyền.
      if (url.startsWith("/")) {
        navigate(url, { replace: true });
        void qc.invalidateQueries({ queryKey: ["shops"] });
      } else window.location.assign(url);
    },
    onError: (e) =>
      setProblem(
        isApiError(e) && e.code === "PLATFORM_NOT_CONFIGURED"
          ? { text: COPY.notConfigured, toImports: true }
          : { text: isApiError(e) ? e.message : COPY.result.error! },
      ),
  });

  const sync = useMutation({
    mutationFn: (shop: Shop) => shopsApi.sync(shop.id),
    onMutate: () => setProblem(null),
    onSuccess: () => {
      toast(COPY.syncQueued);
      setPollUntil(Date.now() + SYNC_POLL_WINDOW_MS);
      void qc.invalidateQueries({ queryKey: ["shops"] });
    },
    onError: (e) =>
      setProblem(
        isApiError(e) && e.code === "SYNC_IN_PROGRESS"
          ? { text: COPY.syncInProgress }
          : isApiError(e) && e.code === "PLATFORM_NOT_CONFIGURED"
            ? { text: COPY.notConfigured, toImports: true }
            : { text: isApiError(e) ? e.message : COPY.result.error! },
      ),
  });

  const resultText = result ? COPY.result[result] : undefined;
  const items = shops.data?.items ?? [];
  const connectButton = (
    <Button icon="link" disabled={connect.isPending} onClick={() => connect.mutate()}>
      {COPY.connect}
    </Button>
  );

  return (
    <>
      <PageHeader title={COPY.title} subtitle={COPY.subtitle} />
      {resultText && <Alert kind={result === "connected" ? "success" : "error"}>{resultText}</Alert>}
      {problem && (
        <Alert
          kind={problem.toImports ? "warning" : "error"}
          action={
            problem.toImports ? (
              <Link to="/admin/imports" className="md-link shrink-0">
                {COPY.openImports}
              </Link>
            ) : undefined
          }
        >
          {problem.text}
        </Alert>
      )}
      {shops.isPending && (
        <div className="card p-6">
          <Skeleton lines={3} className="h-6" />
        </div>
      )}
      {shops.isError && (
        <Alert
          kind="error"
          action={
            <Button variant="text" onClick={() => shops.refetch()}>
              {COPY.retry}
            </Button>
          }
        >
          {COPY.loadError}
        </Alert>
      )}
      {shops.isSuccess && items.length === 0 && (
        <EmptyState icon="storefront" title={COPY.empty} action={connectButton}>
          {COPY.emptyHint}
        </EmptyState>
      )}
      <div className="flex flex-col gap-4">
        {items.map((shop) => (
          <ShopCard
            key={shop.id}
            shop={shop}
            connecting={connect.isPending}
            onConnect={() => connect.mutate()}
            syncing={sync.isPending}
            onSync={() => sync.mutate(shop)}
          />
        ))}
      </div>
    </>
  );
}
