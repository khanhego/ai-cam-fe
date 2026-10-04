import { useNavigate } from "react-router-dom";

import { Button, EmptyState } from "@/shared/ui";

function BackHome() {
  const navigate = useNavigate();
  return (
    <Button variant="tonal" onClick={() => navigate("/admin")}>
      Về trang chính
    </Button>
  );
}

/** D12 (01 §10.5). */
export function ForbiddenPage() {
  return (
    <EmptyState icon="block" title="Tài khoản của bạn không có quyền xem trang này." action={<BackHome />} />
  );
}

export function NotFoundPage() {
  return <EmptyState icon="search_off" title="Không tìm thấy trang." action={<BackHome />} />;
}
