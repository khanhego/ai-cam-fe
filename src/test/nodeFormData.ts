/**
 * FormData gốc của Node (undici) cho test upload: fetch của Node không tuần tự hoá được FormData của jsdom nên
 * multipart (API-50) hỏng. KHÔNG thay toàn cục trong setup — jsdom cần FormData của nó khi gửi `<form>`
 * (thay toàn cục làm `pnpm test` thoát mã 1 do lỗi chưa bắt ở test khác).
 */
export function withNodeFormData(): void {
  const original = globalThis.FormData;
  beforeAll(async () => {
    globalThis.FormData = (await new Response(new URLSearchParams("a=1")).formData())
      .constructor as typeof FormData;
  });
  afterAll(() => {
    globalThis.FormData = original;
  });
}
