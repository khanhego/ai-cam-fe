import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { login } from "@/lib/api/auth";
import { Alert, AuthCard, Button, TextField } from "@/shared/ui";

import { loginErrorMessage } from "../auth/loginErrors";
import { useAuth } from "../auth/useAuth";

/** D1 — Đăng nhập dashboard (01 §10.5, API-01 client=DASHBOARD). */
export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const bootstrap = useAuth((s) => s.bootstrap);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = {
      username: username.trim() ? undefined : "Nhập tên đăng nhập.",
      password: password ? undefined : "Nhập mật khẩu.",
    };
    setFieldErrors(errs);
    if (errs.username || errs.password) return;
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password, "DASHBOARD");
      useAuth.setState({ status: "idle", me: null });
      await bootstrap("DASHBOARD");
      const next = params.get("next");
      navigate(next && next.startsWith("/admin") ? next : "/admin", { replace: true });
    } catch (err) {
      setError(loginErrorMessage(err, "dashboard"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Đăng nhập">
      {error && <Alert kind="error">{error}</Alert>}
      <form onSubmit={onSubmit} noValidate>
        <TextField
          label="Tên đăng nhập"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={fieldErrors.username}
          disabled={busy}
          autoFocus
        />
        <TextField
          label="Mật khẩu"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          disabled={busy}
        />
        <Button type="submit" fullWidth disabled={busy}>
          {busy ? "Đang đăng nhập…" : "Đăng nhập"}
        </Button>
      </form>
    </AuthCard>
  );
}
