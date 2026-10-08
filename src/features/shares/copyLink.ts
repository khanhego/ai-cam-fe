import { toast } from "@/shared/ui";

import { LIST } from "./copy";

/**
 * Sao chép link (02b-admin §10): `navigator.clipboard.writeText`; không được (HTTP, quyền) → chép qua ô ẩn
 * `execCommand("copy")`; vẫn lỗi → Toast báo. Toast có `aria-live` (Toaster) — "Sao chép link" báo cho trình đọc màn hình.
 */
function legacyCopy(url: string): boolean {
  const el = document.createElement("textarea");
  el.value = url;
  el.setAttribute("readonly", "");
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    el.remove();
  }
}

export async function copyLink(url: string): Promise<boolean> {
  let ok: boolean;
  try {
    await navigator.clipboard.writeText(url);
    ok = true;
  } catch {
    ok = legacyCopy(url);
  }
  toast(ok ? LIST.copied : LIST.copyFailed);
  return ok;
}
