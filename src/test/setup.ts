import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";

import { useAuth } from "@/features/auth/useAuth";
import { session } from "@/lib/api/session";
import { resetMockDb } from "@/mocks/db";
import { useToastStore } from "@/shared/ui";

import { server } from "./server";

configure({ asyncUtilTimeout: 3000 });

// jsdom thay FormData toàn cục bằng bản của nó; fetch (undici) không tuần tự hoá được → multipart (API-50) hỏng.
// Dùng FormData gốc của Node; test tạo file bằng `File` của `node:buffer`.
globalThis.FormData = (await new Response(new URLSearchParams("a=1")).formData())
  .constructor as typeof FormData;

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  session.clear();
  useAuth.setState({ status: "idle", me: null });
  resetMockDb();
  useToastStore.setState({ items: [] });
});
afterAll(() => server.close());
