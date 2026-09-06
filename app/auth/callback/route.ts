import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await ensureProfileExists(supabase);
      // Kein Onboarding mehr nötig (kein Gruppen-System) - Middleware
      // kümmert sich darum, nicht freigegebene User zu /pending-approval
      // umzuleiten, alle anderen landen direkt im globalen Dashboard.
      return NextResponse.redirect(`${origin}/dashboard`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}

/**
 * Absicherung gegen "Alt-Accounts" (auth.users-Zeile existiert, aber
 * keine profiles-Zeile) - z. B. weil der Account vor Einführung des
 * handle_new_user()-Triggers angelegt wurde. Ohne das würde die Person
 * dauerhaft fälschlich als "nicht gefunden/nicht freigegeben" erscheinen,
 * weil der Trigger nur bei einem NEUEN Sign-up feuert, nicht bei jedem
 * Login. Greift nur, wenn wirklich noch kein Profil existiert - im
 * Normalfall (Trigger hat schon funktioniert) passiert hier nichts.
 *
 * WICHTIG: Anders als der DB-Trigger (der SECURITY DEFINER läuft und
 * daher alle profiles-Zeilen zählen kann) läuft dieser Code mit der
 * eingeschränkten Session des einloggenden Nutzers selbst. Eine
 * "bin ich der erste Nutzer?"-Zählung wäre hier durch RLS verfälscht
 * (ein nicht freigegebener Nutzer sieht keine fremden Profile, die
 * Zählung käme immer auf 0). Deshalb NIE automatisch zum Admin machen -
 * neue Alt-Accounts landen immer als normaler, nicht freigegebener
 * Nutzer und müssen regulär über /admin/users freigeschaltet werden.
 */
async function ensureProfileExists(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (existing) return;

  await supabase.from("profiles").insert({
    id: auth.user.id,
    email: auth.user.email,
    display_name: auth.user.email?.split("@")[0] || "Nutzer",
    role: "user",
    is_approved: false,
  });
}
