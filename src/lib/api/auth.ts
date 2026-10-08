import { api } from "./client";
import { useSession, type ClientKind, type SessionUser } from "./session";

/** API-01..04 (02 §6.2). Type viết tay theo contract cho tới khi có `pnpm gen:api` (DEC-41). */
export type LoginResponse = { access_token: string; expires_in: number; user: SessionUser };
export type Me = SessionUser & { permissions: string[] };

/** Quyền mới của item 02 (02 §6.1 API-04). ADMIN có `*`. */
export type Permission =
  | "returns.read"
  | "returns.link"
  | "inspection.correct"
  | "recon.read"
  | "recon.resolve"
  | "warehouse_status.adjust"
  | "claims.manage"
  // item 03 (02 §6.1 API-04, §8 AuthZ)
  | "reports.returns"
  | "reports.claims"
  | "reports.productivity"
  | "shares.create"
  | "shares.read"
  | "shares.revoke_any"
  | "notify.manage"
  | "backup.manage"
  | "backup.read";

export const hasPermission = (me: Pick<Me, "permissions"> | null | undefined, p: Permission | string) =>
  Boolean(me && (me.permissions.includes("*") || me.permissions.includes(p)));

export async function login(username: string, password: string, client: ClientKind): Promise<SessionUser> {
  const data = await api.post<LoginResponse>("/auth/login", { username, password, client }, { auth: false });
  useSession.getState().setClient(client);
  useSession.getState().setSession(data.access_token, data.user);
  return data.user;
}

export async function logout(): Promise<void> {
  try {
    await api.post<void>("/auth/logout");
  } finally {
    useSession.getState().clear();
  }
}

export const fetchMe = () => api.get<Me>("/me");
