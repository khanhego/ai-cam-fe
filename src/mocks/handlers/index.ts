import { authHandlers } from "./auth";

/** Handler MSW theo contract 02 §6 — thêm theo từng task (DEC-19). */
export const handlers = [...authHandlers];
