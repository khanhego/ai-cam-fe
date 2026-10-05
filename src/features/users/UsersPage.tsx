import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { isApiError } from "@/lib/api/errors";
import type { Role } from "@/lib/api/session";
import { usersApi, type UserListItem } from "@/lib/api/users";
import { ROLE_LABEL } from "@/shared/labels";
import {
  Alert,
  Button,
  Dialog,
  EmptyState,
  PageHeader,
  Pagination,
  SelectField,
  Skeleton,
  toast,
} from "@/shared/ui";

import { COPY } from "./copy";
import { ROLES } from "./rules";
import { PasswordDialog, UserDialog } from "./UserDialog";
import { UserTable, type UserAction } from "./UserTable";

type Open = { kind: UserAction | "create"; user: UserListItem | null } | null;

/** D9 — Người dùng (01 §10.5, FR-10.01, FR-03.01; API-90, 91). Chỉ ADMIN. */
export default function UsersPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [role, setRole] = useState<Role | "">("");
  const [open, setOpen] = useState<Open>(null);
  const [alert, setAlert] = useState<string | null>(null);

  const users = useQuery({
    queryKey: ["users", page, role],
    queryFn: () => usersApi.list(page, role || undefined),
    placeholderData: (prev) => prev,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["users"] });
    void qc.invalidateQueries({ queryKey: ["stations"] });
  };

  const fail = (e: unknown) => {
    setOpen(null);
    setAlert(
      isApiError(e) && e.code === "LAST_ADMIN" ? COPY.lastAdmin : isApiError(e) ? e.message : COPY.generic,
    );
  };

  const setActive = useMutation({
    mutationFn: ({ u, active }: { u: UserListItem; active: boolean }) =>
      usersApi.patch(u.id, { is_active: active }),
    onSuccess: (_, { active }) => {
      setOpen(null);
      toast(active ? COPY.toast.unlocked : COPY.toast.locked);
      refresh();
    },
    onError: fail,
  });

  const revoke = useMutation({
    mutationFn: (u: UserListItem) => usersApi.revokeSessions(u.id),
    onSuccess: () => {
      setOpen(null);
      toast(COPY.toast.revoked);
    },
    onError: fail,
  });

  function onAction(kind: UserAction, user: UserListItem) {
    setAlert(null);
    if (kind === "unlock") setActive.mutate({ u: user, active: true });
    else setOpen({ kind, user });
  }

  const add = (
    <Button
      icon="person_add"
      onClick={() => {
        setAlert(null);
        setOpen({ kind: "create", user: null });
      }}
    >
      {COPY.add}
    </Button>
  );
  const u = open?.user;

  return (
    <>
      <PageHeader title={COPY.title} subtitle={COPY.subtitle} actions={add} />
      {alert && <Alert kind="error">{alert}</Alert>}
      <div className="max-w-xs">
        <SelectField
          name="role-filter"
          label={COPY.roleFilter}
          value={role}
          onChange={(e) => {
            setRole(e.target.value as Role | "");
            setPage(1);
          }}
        >
          <option value="">{COPY.allRoles}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </SelectField>
      </div>

      {users.isPending && (
        <div className="card p-4">
          <Skeleton lines={5} className="h-8" />
        </div>
      )}
      {users.isError && (
        <Alert
          kind="error"
          action={
            <Button variant="text" onClick={() => users.refetch()}>
              {COPY.retry}
            </Button>
          }
        >
          {COPY.loadError}
        </Alert>
      )}
      {users.data?.total === 0 && (
        <EmptyState
          icon="group"
          title={role ? COPY.emptyFiltered : COPY.empty}
          action={role ? undefined : add}
        />
      )}
      {users.data && users.data.total > 0 && (
        <div className="card overflow-hidden">
          <UserTable items={users.data.items} onAction={onAction} />
          <Pagination
            page={users.data.page}
            pageSize={users.data.page_size}
            total={users.data.total}
            onPage={setPage}
          />
        </div>
      )}

      {(open?.kind === "create" || open?.kind === "edit") && (
        <UserDialog
          user={open.user}
          onClose={() => setOpen(null)}
          onDone={(_, mode) => {
            setOpen(null);
            toast(mode === "create" ? COPY.toast.created : COPY.toast.saved);
            refresh();
          }}
        />
      )}
      {open?.kind === "password" && u && (
        <PasswordDialog
          user={u}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null);
            toast(COPY.toast.password);
          }}
        />
      )}
      {open?.kind === "lock" && u && (
        <Dialog
          open
          title={COPY.lockTitle}
          onClose={() => setOpen(null)}
          actions={
            <Button
              variant="danger"
              disabled={setActive.isPending}
              onClick={() => setActive.mutate({ u, active: false })}
            >
              {COPY.lockConfirm}
            </Button>
          }
        >
          {COPY.lockBody(u.display_name)}
        </Dialog>
      )}
      {open?.kind === "revoke" && u && (
        <Dialog
          open
          title={COPY.revokeTitle}
          onClose={() => setOpen(null)}
          actions={
            <Button disabled={revoke.isPending} onClick={() => revoke.mutate(u)}>
              {COPY.revokeConfirm}
            </Button>
          }
        >
          {COPY.revokeBody(u.display_name)}
        </Dialog>
      )}
    </>
  );
}
