import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { isApiError } from "@/lib/api/errors";
import { stationsApi, type Station } from "@/lib/api/stations";
import { Alert, Button, EmptyState, PageHeader, SelectField, Skeleton, TextField, toast } from "@/shared/ui";

import { CameraForm } from "./CameraForm";

function StationForm({ station }: { station?: Station }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accounts = useQuery({ queryKey: ["users", "STATION"], queryFn: stationsApi.stationAccounts });
  const [name, setName] = useState(station?.name ?? "");
  const [accountId, setAccountId] = useState(station?.account?.id ?? "");
  const [active, setActive] = useState(station?.is_active ?? true);
  const [errors, setErrors] = useState<{ name?: string; account_user_id?: string; form?: string }>({});

  const save = useMutation({
    mutationFn: () =>
      station
        ? stationsApi.patch(station.id, {
            name: name.trim(),
            is_active: active,
            account_user_id: accountId || null,
          })
        : stationsApi.create({ name: name.trim(), account_user_id: accountId || null }),
    onSuccess: (saved) => {
      toast("Đã lưu.");
      void queryClient.invalidateQueries({ queryKey: ["stations"] });
      queryClient.setQueryData(["station", saved.id], saved);
      if (!station) navigate(`/admin/settings/stations/${saved.id}`, { replace: true });
    },
    onError: (e) => {
      if (!isApiError(e)) return setErrors({ form: "Có lỗi hệ thống. Thử lại sau ít phút." });
      const fields = e.fieldErrors;
      if (e.code === "NAME_TAKEN") return setErrors({ name: "Tên station đã tồn tại." });
      if (e.code === "ACCOUNT_IN_USE")
        return setErrors({ account_user_id: "Tài khoản đã gắn station khác." });
      setErrors({
        name: fields.name,
        account_user_id: fields.account_user_id,
        form: Object.keys(fields).length ? undefined : e.message,
      });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 40) return setErrors({ name: "Tên station từ 1 đến 40 ký tự." });
    setErrors({});
    save.mutate();
  }

  // Tài khoản đang gắn station khác không được chọn (trừ tài khoản của chính station này).
  const free = (accounts.data?.items ?? []).filter((u) => !u.station || u.id === station?.account?.id);

  return (
    <form className="card p-6" onSubmit={onSubmit} noValidate>
      {errors.form && <Alert kind="error">{errors.form}</Alert>}
      <div className="grid gap-x-4 sm:grid-cols-2">
        <TextField
          label="Tên station"
          name="name"
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
        <SelectField
          label="Tài khoản station"
          name="account_user_id"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          error={errors.account_user_id}
          hint={accounts.isError ? "Không tải được danh sách tài khoản." : undefined}
        >
          <option value="">Không gắn tài khoản</option>
          {free.map((u) => (
            <option key={u.id} value={u.id}>
              {u.username}
            </option>
          ))}
        </SelectField>
      </div>
      {station && (
        <label className="mb-5 flex items-center gap-3 text-body-lg">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Station đang bật
        </label>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="text" onClick={() => navigate("/admin/settings/stations")}>
          Quay lại
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {station ? "Lưu" : "Tạo station"}
        </Button>
      </div>
    </form>
  );
}

/** D6 — thêm / sửa station và camera (01 §10.5, FR-01.01, UC-07). ROI Cam 2 ở T-62. */
export default function StationEditPage() {
  const { id } = useParams();
  const isNew = id === undefined;
  const station = useQuery({
    queryKey: ["station", id],
    queryFn: () => stationsApi.get(id!),
    enabled: !isNew,
  });

  if (isNew) {
    return (
      <>
        <PageHeader title="Thêm station" subtitle="Sau khi tạo, cấu hình Cam 1 và Cam 2." />
        <StationForm />
      </>
    );
  }
  if (station.isPending) return <Skeleton lines={6} className="h-8" />;
  if (station.isError) {
    if (isApiError(station.error) && station.error.status === 404)
      return <EmptyState icon="search_off" title="Không tìm thấy station." />;
    return <Alert kind="error">Không tải được station.</Alert>;
  }
  const cam = (role: "CAM1" | "CAM2") => station.data.cameras.find((c) => c.role === role);
  return (
    <>
      <PageHeader title={station.data.name} subtitle="Thông tin station và camera" />
      <div className="flex flex-col gap-6">
        <StationForm key={station.data.id} station={station.data} />
        <div className="grid gap-6 lg:grid-cols-2 *:min-w-0">
          <CameraForm stationId={station.data.id} role="CAM1" camera={cam("CAM1")} />
          <CameraForm stationId={station.data.id} role="CAM2" camera={cam("CAM2")} />
        </div>
      </div>
    </>
  );
}
