"use client";

// =====================================================================
// AdminUserTable
// Zeigt alle Nutzer mit Freigabe-Status, Rolle, und Aktionen. Jede
// Aktion ruft eine Server Action auf und gibt Toast-Feedback.
// =====================================================================

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Lock, Trash2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  adminApproveUser,
  adminLockUser,
  adminSetRole,
  adminDeleteUser,
} from "@/lib/actions";
import type { UserRole } from "@/types";

interface AdminUser {
  id: string;
  email: string | null;
  display_name: string;
  role: UserRole;
  is_approved: boolean;
  created_at: string;
  avatar_color: string;
  avatar_url: string | null;
}

export function AdminUserTable({ initialUsers }: { initialUsers: AdminUser[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  function runAction(userId: string, label: string, action: () => Promise<void>) {
    setPendingId(userId);
    startTransition(async () => {
      try {
        await action();
        toast.success(label);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Aktion fehlgeschlagen.");
      } finally {
        setPendingId(null);
      }
    });
  }

  function handleApprove(user: AdminUser) {
    runAction(user.id, `${user.display_name} freigegeben.`, async () => {
      await adminApproveUser(user.id);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_approved: true } : u))
      );
    });
  }

  function handleLock(user: AdminUser) {
    runAction(user.id, `${user.display_name} gesperrt.`, async () => {
      await adminLockUser(user.id);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_approved: false } : u))
      );
    });
  }

  function handleRoleChange(user: AdminUser, role: UserRole) {
    runAction(user.id, `Rolle von ${user.display_name} geändert zu ${role}.`, async () => {
      await adminSetRole(user.id, role);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role } : u)));
    });
  }

  function handleDelete(user: AdminUser) {
    if (!confirm(`${user.display_name} wirklich endgültig löschen? Das kann nicht rückgängig gemacht werden.`)) {
      return;
    }
    runAction(user.id, `${user.display_name} gelöscht.`, async () => {
      await adminDeleteUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    });
  }

  const pendingUsers = users.filter((u) => !u.is_approved);
  const approvedUsers = users.filter((u) => u.is_approved);

  return (
    <div className="space-y-8">
      {pendingUsers.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-700">
            <ShieldAlert className="h-4 w-4" />
            Warten auf Freigabe ({pendingUsers.length})
          </h2>
          <div className="overflow-hidden rounded-xl border border-amber-200">
            {pendingUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between border-b border-amber-100 bg-amber-50 px-4 py-3 last:border-b-0"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{user.display_name}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
                <button
                  onClick={() => handleApprove(user)}
                  disabled={isPending && pendingId === user.id}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  Freigeben
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          Alle Nutzer ({approvedUsers.length})
        </h2>
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-400">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">E-Mail</th>
                <th className="px-4 py-2">Rolle</th>
                <th className="px-4 py-2 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {approvedUsers.map((user) => (
                <tr key={user.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: user.avatar_color }}
                      />
                      {user.display_name}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{user.email}</td>
                  <td className="px-4 py-2.5">
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user, e.target.value as UserRole)}
                      disabled={isPending && pendingId === user.id}
                      className={cn(
                        "rounded-lg border px-2 py-1 text-xs font-medium",
                        user.role === "admin"
                          ? "border-violet-300 bg-violet-50 text-violet-700"
                          : user.role === "mod"
                            ? "border-blue-300 bg-blue-50 text-blue-700"
                            : "border-slate-200 text-slate-600"
                      )}
                    >
                      <option value="user">user</option>
                      <option value="mod">mod</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleLock(user)}
                        disabled={isPending && pendingId === user.id}
                        title="Sperren (Freigabe entziehen)"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600 disabled:opacity-50"
                      >
                        <Lock className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(user)}
                        disabled={isPending && pendingId === user.id}
                        title="Endgültig löschen"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
