import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { isApiError } from "@/lib/api/errors";
import { importsApi, type ImportHistoryItem, type ImportPreview as Preview } from "@/lib/api/imports";
import { saveBlob } from "@/shared/download";
import { Alert, Button, EmptyState, PageHeader, Pagination, Skeleton, toast } from "@/shared/ui";

import { COPY } from "./copy";
import { ImportDropzone } from "./ImportDropzone";
import { ImportHistoryTable } from "./ImportHistoryTable";
import { ImportPreview } from "./ImportPreview";
import { checkFile } from "./rules";

type Flash = { kind: "error" | "success"; text: string } | null;

function uploadError(e: unknown): string {
  if (!isApiError(e)) return COPY.generic;
  const missing = e.details.missing_columns;
  if (e.code === "FILE_INVALID" && Array.isArray(missing) && missing.length > 0)
    return COPY.missingColumns(missing.map(String));
  return e.message;
}

/** D5 — Nhập đơn từ file (01 §10.5, FR-05.09, UC-09): chọn file → xem trước → xác nhận → lịch sử. */
export default function ImportsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [flash, setFlash] = useState<Flash>(null);

  const history = useQuery({
    queryKey: ["imports", page],
    queryFn: () => importsApi.history(page),
    placeholderData: (prev) => prev,
  });

  const upload = useMutation({
    mutationFn: importsApi.upload,
    onSuccess: (p) => setPreview(p),
    onError: (e) => setFlash({ kind: "error", text: uploadError(e) }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["imports"] }),
  });

  const commit = useMutation({
    mutationFn: (p: Preview) => importsApi.commit(p.id),
    onSuccess: (res) => {
      setPreview(null);
      setPage(1);
      setFlash({ kind: "success", text: COPY.done(res.counts.new + res.counts.updated) });
    },
    onError: (e) => {
      if (isApiError(e) && e.code === "IMPORT_HAS_ERRORS") {
        // Nút Nhập vốn đã khóa khi có lỗi; nếu server vẫn báo thì giữ bảng lỗi đang hiện.
        setFlash({ kind: "error", text: e.message });
        return;
      }
      setPreview(null);
      setFlash({
        kind: "error",
        text: isApiError(e) && e.code === "IMPORT_EXPIRED" ? COPY.expired : uploadError(e),
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["imports"] }),
  });

  function onFile(file: File) {
    const problem = checkFile(file);
    setPreview(null);
    if (problem) {
      setFlash({ kind: "error", text: problem });
      return;
    }
    setFlash(null);
    upload.mutate(file);
  }

  async function downloadTemplate() {
    try {
      saveBlob(await importsApi.template(), "mau-nhap-don.csv");
    } catch (e) {
      toast(isApiError(e) ? e.message : COPY.generic);
    }
  }

  async function downloadOriginal(item: ImportHistoryItem) {
    try {
      saveBlob(await importsApi.file(item.id), item.file_name);
    } catch (e) {
      toast(
        isApiError(e) && e.code === "FILE_EXPIRED"
          ? COPY.history.fileExpired
          : isApiError(e)
            ? e.message
            : COPY.generic,
      );
    }
  }

  const H = COPY.history;
  return (
    <>
      <PageHeader
        title={COPY.title}
        subtitle={COPY.subtitle}
        actions={
          <Button variant="text" icon="download" onClick={downloadTemplate}>
            {COPY.template}
          </Button>
        }
      />

      {flash && <Alert kind={flash.kind}>{flash.text}</Alert>}

      <div className="mb-8">
        {preview ? (
          <ImportPreview
            preview={preview}
            committing={commit.isPending}
            onCommit={() => {
              setFlash(null);
              commit.mutate(preview);
            }}
            onCancel={() => {
              setPreview(null);
              setFlash(null);
            }}
          />
        ) : (
          <ImportDropzone busy={upload.isPending} onFile={onFile} />
        )}
      </div>

      <h2 className="mb-3 text-title-lg text-on-surface">{H.title}</h2>
      {history.isPending && (
        <div className="card p-4">
          <Skeleton lines={4} className="h-8" />
        </div>
      )}
      {history.isError && (
        <Alert
          kind="error"
          action={
            <Button variant="text" onClick={() => history.refetch()}>
              {COPY.retry}
            </Button>
          }
        >
          {H.error}
        </Alert>
      )}
      {history.data?.total === 0 && <EmptyState icon="history" title={H.empty} />}
      {history.data && history.data.total > 0 && (
        <div className="card overflow-hidden">
          <ImportHistoryTable items={history.data.items} onDownload={downloadOriginal} />
          <Pagination
            page={history.data.page}
            pageSize={history.data.page_size}
            total={history.data.total}
            onPage={setPage}
          />
        </div>
      )}
    </>
  );
}
