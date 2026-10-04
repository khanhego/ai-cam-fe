import { api } from "./client";
import { useSession, type ClientKind, type SessionUser } from "./session";

/** API-01..04 (02 §6.2). Type viết tay theo contract cho tới khi có `pnpm gen:api` (DEC-41). */
export type LoginResponse = { access_token: string; expires_in: number; user: SessionUser };
export type Me = SessionUser & { permissions: string[] };

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
