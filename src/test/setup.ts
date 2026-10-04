import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";

import { session } from "@/lib/api/session";
import { resetMockDb } from "@/mocks/db";

import { server } from "./server";

configure({ asyncUtilTimeout: 3000 });

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  session.clear();
  resetMockDb();
});
afterAll(() => server.close());
