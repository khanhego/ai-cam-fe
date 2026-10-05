import type { UserListItem } from "@/lib/api/users";
import { ROLE_LABEL } from "@/shared/labels";
import { IconButton, StatusChip } from "@/shared/ui";

import { COPY } from "./copy";

export type UserAction = "edit" | "password" | "lock" | "unlock" | "revoke";

function Status({ u }: { u: UserListItem }) {
  return u.is_active ? (
    <StatusChip tone="success">{COPY.active}</StatusChip>
  ) : (
    <StatusChip tone="error" icon="lock">
      {COPY.locked}
    </StatusChip>
  );
}

const stationOf = (u: UserListItem) => (u.role === "STATION" ? (u.station?.name ?? COPY.noStation) : "—");

function Actions({ u, onAction }: { u: UserListItem; onAction: (a: UserAction, u: UserListItem) => void }) {
  const A = COPY.action;
  const n = u.username;
  return (
    <div className="flex shrink-0 justify-end">
      <IconButton icon="edit" label={A.edit(n)} onClick={() => onAction("edit", u)} />
      <IconButton icon="password" label={A.password(n)} onClick={() => onAction("password", u)} />
      {u.role === "STATION" && (
        <IconButton icon="phonelink_erase" label={A.revoke(n)} onClick={() => onAction("revoke", u)} />
      )}
      {u.is_active ? (
        <IconButton icon="lock" variant="danger" label={A.lock(n)} onClick={() => onAction("lock", u)} />
      ) : (
        <IconButton icon="lock_open" label={A.unlock(n)} onClick={() => onAction("unlock", u)} />
      )}
    </div>
  );
}

/** Bảng D9 (01 §10.5): bảng từ `md`, card dưới `md` (02b-admin §9). */
export function UserTable({
  items,
  onAction,
}: {
  items: UserListItem[];
  onAction: (a: UserAction, u: UserListItem) => void;
}) {
  const C = COPY.col;
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="md-table" aria-label={COPY.title}>
          <thead>
            <tr>
              <th className="pl-4">{C.name}</th>
              <th>{C.username}</th>
              <th>{C.role}</th>
              <th>{C.station}</th>
              <th>{C.status}</th>
              <th aria-label="Thao tác" />
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id}>
                <td className="pl-4 text-title-sm">{u.display_name}</td>
                <td className="font-mono">{u.username}</td>
                <td>{ROLE_LABEL[u.role]}</td>
                <td>{stationOf(u)}</td>
                <td>
                  <Status u={u} />
                </td>
                <td className="pr-2">
                  <Actions u={u} onAction={onAction} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-outline-variant md:hidden" aria-label={COPY.title}>
        {items.map((u) => (
          <li key={u.id} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-title-sm text-on-surface">{u.display_name}</p>
              <Status u={u} />
            </div>
            <p className="text-body-sm text-on-surface-variant">
              <span className="font-mono">{u.username}</span> · {ROLE_LABEL[u.role]}
              {u.role === "STATION" && ` · ${stationOf(u)}`}
            </p>
            <Actions u={u} onAction={onAction} />
          </li>
        ))}
      </ul>
    </>
  );
}
