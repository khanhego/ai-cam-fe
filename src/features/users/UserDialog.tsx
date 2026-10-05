import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { isApiError } from "@/lib/api/errors";
import type { Role } from "@/lib/api/session";
import { usersApi, type UserListItem } from "@/lib/api/users";
import { ROLE_LABEL } from "@/shared/labels";
import { Alert, Button, Dialog, SelectField, TextField } from "@/shared/ui";

import { COPY } from "./copy";
import { ROLES, validateUser, type UserFormValue } from "./rules";

const F = COPY.form;
type Errors = Partial<Record<keyof UserFormValue, string>>;

/** Dialog "Thêm người dùng" (API-90 POST) và "Sửa" tên / vai trò (API-90 PATCH). */
export function UserDialog({
  user,
  onClose,
  onDone,
}: {
  /** null = tạo mới. */
  user: UserListItem | null;
  onClose: () => void;
  onDone: (u: UserListItem, mode: "create" | "edit") => void;
}) {
  const mode = user ? "edit" : "create";
  const [v, setV] = useState<UserFormValue>({
    username: user?.username ?? "",
    display_name: user?.display_name ?? "",
    role: user?.role ?? "CSKH",
    password: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [alert, setAlert] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      user
        ? usersApi.patch(user.id, {
            display_name: v.display_name.trim(),
            ...(v.role !== user.role ? { role: v.role } : {}),
          })
        : usersApi.create({ ...v, display_name: v.display_name.trim() }),
    onSuccess: (u) => onDone(u, mode),
    onError: (e) => {
      if (!isApiError(e)) return setAlert(COPY.generic);
      if (e.code === "USERNAME_TAKEN") return setErrors({ username: F.usernameTaken });
      if (e.code === "LAST_ADMIN") return setAlert(COPY.lastAdmin);
      const fields = e.fieldErrors;
      if (Object.keys(fields).length > 0) return setErrors(fields as Errors);
      setAlert(e.message);
    },
  });

  function submit(ev: FormEvent) {
    ev.preventDefault();
    setAlert(null);
    const errs = validateUser(v, mode);
    setErrors(errs);
    if (Object.keys(errs).length === 0) save.mutate();
  }

  const set = (k: keyof UserFormValue) => (value: string) => {
    setV({ ...v, [k]: value });
    if (errors[k]) setErrors({ ...errors, [k]: undefined });
  };

  return (
    <Dialog
      open
      title={user ? F.editTitle : F.createTitle}
      onClose={onClose}
      actions={
        <Button type="submit" form="user-form" disabled={save.isPending}>
          {user ? F.save : F.create}
        </Button>
      }
    >
      <form id="user-form" noValidate onSubmit={submit} className="pt-2">
        {alert && <Alert kind="error">{alert}</Alert>}
        {user ? (
          <p className="mb-5 font-mono text-body-md text-on-surface">{user.username}</p>
        ) : (
          <TextField
            name="username"
            label={F.username}
            hint={F.usernameHint}
            error={errors.username}
            autoComplete="off"
            autoCapitalize="none"
            value={v.username}
            onChange={(e) => set("username")(e.target.value.trim())}
          />
        )}
        <TextField
          name="display_name"
          label={F.displayName}
          error={errors.display_name}
          maxLength={80}
          value={v.display_name}
          onChange={(e) => set("display_name")(e.target.value)}
        />
        <SelectField
          name="role"
          label={F.role}
          hint={
            v.role === "STATION" ? F.stationHint : user && v.role !== user.role ? F.roleChangeHint : undefined
          }
          value={v.role}
          onChange={(e) => set("role")(e.target.value as Role)}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </SelectField>
        {!user && (
          <TextField
            name="password"
            type="password"
            label={F.password}
            hint={F.passwordHint}
            error={errors.password}
            autoComplete="new-password"
            value={v.password}
            onChange={(e) => set("password")(e.target.value)}
          />
        )}
      </form>
    </Dialog>
  );
}

/** Dialog "Đặt lại mật khẩu" (API-90 PATCH `password`). */
export function PasswordDialog({
  user,
  onClose,
  onDone,
}: {
  user: UserListItem;
  onClose: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const save = useMutation({
    mutationFn: () => usersApi.patch(user.id, { password }),
    onSuccess: onDone,
    onError: (e) => setError(isApiError(e) ? (e.fieldErrors.password ?? e.message) : COPY.generic),
  });
  function submit(ev: FormEvent) {
    ev.preventDefault();
    if (password.length < 8) return setError(F.passwordShort);
    save.mutate();
  }
  return (
    <Dialog
      open
      title={COPY.passwordTitle}
      onClose={onClose}
      actions={
        <Button type="submit" form="password-form" disabled={save.isPending}>
          {COPY.passwordConfirm}
        </Button>
      }
    >
      <form id="password-form" noValidate onSubmit={submit}>
        <p className="mb-5">{COPY.passwordBody(user.display_name)}</p>
        <TextField
          name="new-password"
          type="password"
          label={F.newPassword}
          hint={F.passwordHint}
          error={error}
          autoComplete="new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(undefined);
          }}
        />
      </form>
    </Dialog>
  );
}
