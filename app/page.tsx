import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// =====================================================================
// Fallback-Sicherheitsnetz: Falls Supabase (z. B. wegen einer fehlenden
// Redirect-URL im Dashboard) auf "/" statt "/auth/callback" umleitet,
// tauschen wir einen mitgeschickten "code"-Parameter trotzdem hier gegen
// eine Session. Der korrekte Weg bleibt /auth/callback - das hier fängt
// nur eine falsche Supabase-Konfiguration ab, damit der Login nicht
// komplett fehlschlägt.
// =====================================================================
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const supabase = await createServerSupabaseClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      redirect("/login?error=auth_failed");
    }
    redirect("/dashboard");
  }

  const { data: auth } = await supabase.auth.getUser();
  redirect(auth.user ? "/dashboard" : "/login");
}
