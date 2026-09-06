import { redirect } from "next/navigation";
import { Clock3 } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/layout/SignOutButton";

// =====================================================================
// Prüft is_approved UNABHÄNGIG von der Middleware nochmal direkt hier
// (gleicher no-store-Client, aber ein zweiter, unabhängiger Codepfad).
// Falls die Middleware aus irgendeinem Grund eine veraltete/falsche
// Antwort bekommen hat, korrigiert sich das hier selbst - der Nutzer
// wird sofort weitergeleitet statt auf der Sperrseite hängen zu bleiben.
// =====================================================================
export default async function PendingApprovalPage() {
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();

  if (auth.user) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, is_approved")
      .eq("id", auth.user.id)
      .single();

    if (profile?.is_approved) {
      redirect("/dashboard");
    }

    // Diagnose-Ausgabe (nur sichtbar, wenn NICHT freigegeben - hilft beim
    // Debuggen, ob z. B. die falsche user_id geprüft wird oder die
    // profiles-Zeile fehlt/einen Fehler wirft).
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
            <Clock3 className="h-7 w-7 text-amber-600" />
          </div>
          <h1 className="mb-2 text-lg font-bold text-slate-900">Warten auf Freigabe</h1>
          <p className="text-sm text-slate-500">
            Dein Konto wurde erstellt und wartet auf die Freigabe durch einen Administrator.
            {" "}
            Du bist eingeloggt als <strong>{auth.user.email}</strong>.
          </p>
          <p className="mt-3 text-xs text-slate-400">
            Sobald du freigeschaltet bist, kannst du diese Seite einfach neu laden.
          </p>
          <details className="mt-4 rounded-lg bg-slate-50 p-2 text-left text-xs text-slate-400">
            <summary className="cursor-pointer select-none">Diagnose-Infos</summary>
            <p className="mt-1 break-all">user_id: {auth.user.id}</p>
            <p className="mt-1">profile gefunden: {profile ? "ja" : "nein"}</p>
            <p className="mt-1">is_approved (live gelesen): {String(profile?.is_approved ?? "n/a")}</p>
            {error && <p className="mt-1 text-rose-500">DB-Fehler: {error.message}</p>}
          </details>
          <div className="mt-6">
            <SignOutButton />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
          <Clock3 className="h-7 w-7 text-amber-600" />
        </div>
        <h1 className="mb-2 text-lg font-bold text-slate-900">Warten auf Freigabe</h1>
        <p className="text-sm text-slate-500">
          Dein Konto wurde erstellt und wartet auf die Freigabe durch einen Administrator.
        </p>
        <div className="mt-6">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
