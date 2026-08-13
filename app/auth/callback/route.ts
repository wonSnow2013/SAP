// =====================================================================
// GET /auth/callback · Route Handler
// Tauscht den Code aus dem Magic-Link gegen eine Supabase-Session und
// leitet danach ins Onboarding bzw. Dashboard weiter.
// =====================================================================

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/onboarding`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
