import type { Role } from "@/lib/api/session";

import { COPY } from "./copy";

export const ROLES: Role[] = ["ADMIN", "SUPERVISOR", "CSKH", "STATION"];
const USERNAME = /^[a-z0-9._-]{3,32}$/;

export type UserFormValue = { username: string; display_name: string; role: Role; password: string };
type Errors = Partial<Record<keyof UserFormValue, string>>;

/** Kiểm form D9 (02b-admin §5): username `[a-z0-9._-]{3,32}`, password ≥ 8. `edit`: không có username / password. */
export function validateUser(v: UserFormValue, mode: "create" | "edit"): Errors {
  const e: Errors = {};
  if (mode === "create" && !USERNAME.test(v.username)) e.username = COPY.form.usernameInvalid;
  if (!v.display_name.trim() || v.display_name.trim().length > 80)
    e.display_name = COPY.form.displayNameRequired;
  if (mode === "create" && v.password.length < 8) e.password = COPY.form.passwordShort;
  return e;
}
