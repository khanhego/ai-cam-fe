import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { isApiError } from "@/lib/api/errors";
import { shopsApi, type PlatformConfig, type Shop } from "@/lib/api/shops";
import { fmtDateTime } from "@/shared/format";
import { PLATFORM_LABEL, PLATFORMS, type Platform } from "@/shared/labels";
import { Alert, Button, Dialog, EmptyState, PageHeader, Skeleton, toast } from "@/shared/ui";

import { COPY, shopName } from "./copy";
import { ShopCard } from "./ShopCard";

/** Sau "Đồng bộ ngay": làm mới 5 giây × 6 lần (02b-admin §4 item 01). */
const SYNC_POLL_MS = 5000;
const SYNC_POLL_WINDOW_MS = 30_000;
/** Có shop `sync_in_progress`: poll 10 giây (02b-admin §4 item 03). */
const IN_PROGRESS_POLL_MS = 10_000;

const PLATFORM_PARAM: Record<string, Platform> = { shopee: "SHOPEE", tiktok: "TIKTOK" };

type ResultAlert = { platform: Platform; text: string };

/** `?platform=&result=&count=` của callback API-72 / API-155 → Toast (connected) hoặc Alert trong nhóm sàn; đọc xong xóa query. */
function useConnectResult(): [ResultAlert | null, (v: ResultAlert | null) => void] {
  const [params, setParams] = useSearchParams();
  const [alert, setAlert] = useState<ResultAlert | null>(null);
  const [seen, setSeen] = useState<string | null>(null);
  const toasted = useRef<string | null>(null);
  const result = params.get("result");
  const search = params.toString();
  // Link cũ của Shopee (`/admin/settings/shopee?result=`) không có `platform`.
  const platform = PLATFORM_PARAM[params.get("platform") ?? ""] ?? "SHOPEE";
  const text = result ? COPY.result(result, platform, Number(params.get("count")) || null) : null;
  // Điều chỉnh state theo URL ngay lúc render (không qua effect).
  if (result && seen !== search) {
    setSeen(search);
    setAlert(result === "connected" ? null : { platform, text: text! });
  }
  useEffect(() => {
    if (!result) return;
    if (result === "connected" && toasted.current !== search) {
      toasted.current = search;
      toast(text!);
    }
    setParams({}, { replace: true });
  }, [result, search, text, setParams]);
  return [alert, setAlert];
}

function PlatformGroup({
  config,
  shops,
  resultAlert,
  connectPending,
  onConnect,
  syncBusy,
  onSync,
  onDisconnect,
  showGroupEmpty,
}: {
  config: PlatformConfig;
  shops: Shop[];
  resultAlert: string | null;
  connectPending: boolean;
  onConnect: () => void;
  syncBusy: (id: string) => boolean;
  onSync: (shop: Shop) => void;
  onDisconnect: (shop: Shop) => void;
  showGroupEmpty: boolean;
}) {
  const { platform } = config;
  const ready = config.enabled && config.configured;
  const active = shops.filter((s) => s.auth_status !== "DISCONNECTED");
  const gone = shops.filter((s) => s.auth_status === "DISCONNECTED");
  const headingId = `platform-${platform.toLowerCase()}`;
  return (
    <section aria-labelledby={headingId} className="mb-8">
      <h2 id={headingId} className="mb-3 text-title-md text-on-surface">
        {PLATFORM_LABEL[platform]}
      </h2>
      {!ready && (
        <Alert
          kind="info"
          action={
            platform === "SHOPEE" ? (
              <Link to="/admin/imports" className="md-link shrink-0">
                {COPY.openImports}
              </Link>
            ) : undefined
          }
        >
          {COPY.notConfigured[platform]}
        </Alert>
      )}
      {resultAlert && <Alert kind="error">{resultAlert}</Alert>}
      {active.length === 0 && showGroupEmpty && ready && (
        <p className="mb-4 text-body-md text-on-surface-variant">{COPY.groupEmpty(platform)}</p>
      )}
      <div className="flex flex-col gap-4">
        {active.map((s) => (
          <ShopCard
            key={s.id}
            shop={s}
            connectDisabled={!ready || connectPending}
            onConnect={onConnect}
            syncBusy={syncBusy(s.id)}
            onSync={() => onSync(s)}
            onDisconnect={() => onDisconnect(s)}
          />
        ))}
      </div>
      {gone.length > 0 && (
        <details className="mt-4 text-body-md text-on-surface-variant">
          <summary className="cursor-pointer">{COPY.disconnectedGroup(gone.length)}</summary>
          <ul className="mt-2 flex flex-col gap-2" aria-label={COPY.disconnectedGroup(gone.length)}>
            {gone.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3">
                <span className="min-w-0 truncate text-on-surface" title={shopName(s)}>
                  {shopName(s)}
                </span>
                <span className="tabular-nums">
                  · {COPY.disconnectedAt} {fmtDateTime(s.disconnected_at)}
                </span>
                <Button
                  variant="text"
                  size="sm"
                  icon="link"
                  disabled={!ready || connectPending}
                  onClick={onConnect}
                  aria-label={`${COPY.reconnect} ${shopName(s)}`}
                >
                  {COPY.reconnect}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/**
 * D7 — Kết nối sàn (`/admin/settings/platforms`, 01 §10.5 D7 item 03, 02b-admin T-253): nhóm theo sàn (`platforms[]`
 * API-70), thẻ mỗi shop, kết nối theo sàn (API-71 → trang ủy quyền; callback API-72 / API-155 về `?result=`), ngắt
 * kết nối (API-154), "Shop đã ngắt (n)", cảnh báo đồng bộ. WS `shop.updated` invalidate `["shops"]` (useDashboardSocket).
 */
export default function PlatformsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [resultAlert, setResultAlert] = useConnectResult();
  const [pollUntil, setPollUntil] = useState(0);
  /** id shop → mốc bấm "Đồng bộ ngay" bị 409 SYNC_IN_PROGRESS / đang gửi; hết khóa khi có dữ liệu mới hơn mốc. */
  const [busyAt, setBusyAt] = useState<Record<string, number>>({});
  const [confirm, setConfirm] = useState<Shop | null>(null);

  const shops = useQuery({
    queryKey: ["shops"],
    queryFn: shopsApi.list,
    refetchInterval: (q) =>
      Date.now() < pollUntil
        ? SYNC_POLL_MS
        : q.state.data?.items.some((s) => s.sync_in_progress)
          ? IN_PROGRESS_POLL_MS
          : false,
  });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["shops"] });

  const connect = useMutation({
    mutationFn: (platform: Platform) => shopsApi.authUrl(platform),
    onMutate: () => setResultAlert(null),
    onSuccess: ({ url }) => {
      // Đường dẫn cùng app (mock trả thẳng URL callback) → router; URL sàn → rời trang sang trang ủy quyền.
      if (url.startsWith("/")) {
        navigate(url, { replace: true });
        invalidate();
      } else window.location.assign(url);
    },
    onError: (e, platform) => {
      // 503 PLATFORM_NOT_CONFIGURED: cấu hình vừa đổi → tải lại để nhóm sàn hiện Alert + khóa nút.
      if (isApiError(e) && e.code === "PLATFORM_NOT_CONFIGURED") invalidate();
      setResultAlert({ platform, text: isApiError(e) ? e.message : COPY.result("error", platform, null) });
    },
  });

  const markBusy = (id: string, on: boolean) => setBusyAt((prev) => ({ ...prev, [id]: on ? Date.now() : 0 }));

  const sync = useMutation({
    mutationFn: (shop: Shop) => shopsApi.sync(shop.id),
    onMutate: (shop) => markBusy(shop.id, true),
    onSuccess: () => {
      toast(COPY.syncQueued);
      setPollUntil(Date.now() + SYNC_POLL_WINDOW_MS);
      invalidate();
    },
    onError: (e, shop) => {
      if (isApiError(e) && e.code === "SYNC_IN_PROGRESS") {
        // Giữ nút khóa + "Đang đồng bộ, thử lại sau." tới lần tải sau (02 §6.2: 409 SYNC_IN_PROGRESS).
        setPollUntil(Date.now() + SYNC_POLL_WINDOW_MS);
        return;
      }
      toast(isApiError(e) ? e.message : COPY.result("error", shop.platform, null));
      invalidate();
    },
    onSettled: (_d, e, shop) => {
      if (!(isApiError(e) && e.code === "SYNC_IN_PROGRESS")) markBusy(shop.id, false);
    },
  });

  const disconnect = useMutation({
    mutationFn: (shop: Shop) => shopsApi.disconnect(shop.id),
    onSuccess: (_d, shop) => {
      setConfirm(null);
      toast(COPY.disconnected(shopName(shop)));
      invalidate();
      void qc.invalidateQueries({ queryKey: ["shopsBrief"] });
    },
    onError: (e) => {
      setConfirm(null);
      toast(isApiError(e) ? e.message : COPY.loadError);
      invalidate();
    },
  });

  const items = shops.data?.items ?? [];
  const configs: PlatformConfig[] =
    shops.data?.platforms ??
    PLATFORMS.map((platform) => ({ platform, enabled: true, returns_enabled: false, configured: true }));
  const ready = (p: Platform) => {
    const c = configs.find((x) => x.platform === p);
    return !!c && c.enabled && c.configured;
  };
  const noActive = items.every((s) => s.auth_status === "DISCONNECTED");

  return (
    <>
      <PageHeader
        title={COPY.title}
        subtitle={COPY.subtitle}
        actions={configs.map((c) => (
          <Button
            key={c.platform}
            variant="outlined"
            icon="link"
            disabled={!shops.isSuccess || !ready(c.platform) || connect.isPending}
            onClick={() => connect.mutate(c.platform)}
          >
            {COPY.connect(c.platform)}
          </Button>
        ))}
      />
      {shops.isPending && (
        <div className="flex flex-col gap-6" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="card p-6">
              <Skeleton lines={3} className="h-6" />
            </div>
          ))}
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
      {shops.isSuccess && (
        <>
          {noActive && (
            <div className="mb-6">
              <EmptyState
                icon="storefront"
                title={COPY.empty}
                action={
                  <Link to="/admin/imports" className="md-link">
                    {COPY.openImports}
                  </Link>
                }
              >
                {COPY.emptyHint}
              </EmptyState>
            </div>
          )}
          {configs.map((c) => (
            <PlatformGroup
              key={c.platform}
              config={c}
              shops={items.filter((s) => s.platform === c.platform)}
              resultAlert={resultAlert?.platform === c.platform ? resultAlert.text : null}
              connectPending={connect.isPending}
              onConnect={() => connect.mutate(c.platform)}
              syncBusy={(id) => (busyAt[id] ?? 0) >= shops.dataUpdatedAt}
              onSync={(s) => sync.mutate(s)}
              onDisconnect={setConfirm}
              showGroupEmpty={!noActive}
            />
          ))}
        </>
      )}
      <Dialog
        open={!!confirm}
        title={confirm ? COPY.disconnectTitle(shopName(confirm)) : ""}
        onClose={() => setConfirm(null)}
        closeLabel={COPY.cancel}
        actions={
          <Button
            variant="danger"
            disabled={disconnect.isPending}
            onClick={() => confirm && disconnect.mutate(confirm)}
          >
            {COPY.disconnect}
          </Button>
        }
      >
        {COPY.disconnectBody}
      </Dialog>
    </>
  );
}
