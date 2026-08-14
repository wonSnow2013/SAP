// =====================================================================
// /pending-approval · Server Component
// Sperrseite für Nutzer, deren Account noch nicht freigegeben wurde.
// =====================================================================

import { Clock3 } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/layout/SignOutButton";

export default async function PendingApprovalPage() {
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
          <Clock3 className="h-7 w-7 text-amber-600" />
        </div>
        <h1 className="mb-2 text-lg font-bold text-slate-900">
          Warten auf Freigabe
        </h1>
        <p className="text-sm text-slate-500">
          Dein Konto wurde erstellt und wartet auf die Freigabe durch einen
          Administrator.
          {auth.user?.email && (
            <>
              {" "}
              Du bist eingeloggt als <strong>{auth.user.email}</strong>.
            </>
          )}
        </p>
        <p className="mt-3 text-xs text-slate-400">
          Sobald du freigeschaltet bist, kannst du diese Seite einfach neu
          laden.
        </p>
        <div className="mt-6">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
