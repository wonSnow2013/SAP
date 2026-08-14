// =====================================================================
// /admin/users · Server Component
// Zugriff ist bereits durch die Middleware auf role in ('admin','mod')
// beschränkt. Lädt alle Profile und rendert die interaktive Tabelle.
// =====================================================================

import { getAllUsersForAdmin } from "@/lib/actions";
import { AdminUserTable } from "@/components/admin/AdminUserTable";
import { BackToDashboard } from "@/components/layout/BackToDashboard";

export default async function AdminUsersPage() {
  const users = await getAllUsersForAdmin();

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <BackToDashboard />
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Benutzerverwaltung</h1>
      <p className="mb-6 text-sm text-slate-500">
        Neue Nutzer freigeben, Rollen vergeben oder Konten sperren/löschen.
      </p>
      <AdminUserTable initialUsers={users} />
    </main>
  );
}
