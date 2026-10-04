import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { login } from "@/lib/api/auth";
import { useScanListener } from "@/shared/scan/useScanListener";
import { Alert, AuthCard, Button, TextField } from "@/shared/ui";

import { loginErrorMessage } from "../auth/loginErrors";
import { useAuth } from "../auth/useAuth";
import { COPY } from "./copy";

/** S0 — Đăng nhập station (01 §10.4, FR-03.01). Làm một lần; phiên giữ 30 ngày (DEC-9). */
export default function StationLoginPage() {
  const navigate = useNavigate();
  const bootstrap = useAuth((s) => s.bootstrap);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // EX-P9 (TC-03.30): quét khi chưa đăng nhập → nhắc, không gọi API. Ô tài khoản được autofocus nên máy quét
  // gõ thẳng vào ô: nhận cả trong ô nhập, bỏ mã vừa bị gõ vào và chặn Enter (không submit).
  useScanListener(
    (code) => {
      const strip = (value: string) =>
        value.toUpperCase().endsWith(code.toUpperCase()) ? value.slice(0, -code.length) : value;
      setUsername(strip);
      setPassword(strip);
      setError(COPY.notLoggedIn);
    },
    { allowInInputs: true },
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = {
      username: username.trim() ? undefined : "Nhập tài khoản station.",
      password: password ? undefined : "Nhập mật khẩu.",
    };
    setFieldErrors(errs);
    if (errs.username || errs.password) return;
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password, "STATION");
      useAuth.setState({ status: "idle", me: null });
      await bootstrap("STATION");
      navigate("/station", { replace: true });
    } catch (err) {
      setError(loginErrorMessage(err, "station"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Đăng nhập station">
      {error && <Alert kind="error">{error}</Alert>}
      <form onSubmit={onSubmit} noValidate>
        <TextField
          label="Tài khoản station"
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
        <Button type="submit" fullWidth disabled={busy} icon={busy ? "progress_activity" : undefined}>
          {busy ? "Đang đăng nhập…" : "Đăng nhập"}
        </Button>
      </form>
    </AuthCard>
  );
}
