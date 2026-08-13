// =====================================================================
// / · Server Component
// Leitet eingeloggte Nutzer direkt zum Dashboard weiter, alle anderen
// zur Login-Seite.
// =====================================================================

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();

  redirect(auth.user ? "/dashboard" : "/login");
}
