/** Lưu một `Blob` thành file (file cần Bearer nên không dùng thẳng `<a href>` tới API). */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Trình duyệt cần URL còn sống tới khi bắt đầu tải.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Tải file qua URL ký (không cần Bearer — vd. gói bằng chứng API-138, có thể > 100 MB nên không qua `blob`; 02b-admin
 * §10). Trình duyệt tải thẳng bằng `<a download>`.
 */
export function downloadUrl(url: string, fileName: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
