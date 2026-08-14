import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// =====================================================================
// 1) Aktualisiert den Supabase-Session-Cookie bei jedem Request.
// 2) Setzt den Freigabe-Workflow durch: nicht freigegebene User werden
//    (außer auf ein paar erlaubten Routen) zu /pending-approval geschickt.
// 3) Schützt /admin: nur role 'admin' oder 'mod' dürfen rein.
// =====================================================================

// Routen, die auch OHNE Freigabe erreichbar sein müssen (Login-Flow,
// die Sperrseite selbst, statische/interne Next.js-Pfade).
const PUBLIC_PATHS = ["/login", "/auth/callback", "/pending-approval"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Fehlende Konfiguration darf die gesamte App nicht lahmlegen (500 auf
  // jeder Route) - stattdessen Request unverändert durchlassen.
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "[middleware] NEXT_PUBLIC_SUPABASE_URL oder NEXT_PUBLIC_SUPABASE_ANON_KEY fehlt in den Umgebungsvariablen."
    );
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[]
      ) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch (err) {
    console.error("[middleware] Supabase auth.getUser() fehlgeschlagen:", err);
    return response; // Netzwerkfehler dürfen die App nicht komplett blockieren
  }

  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // Nicht eingeloggt + geschützte Route -> zum Login
  if (!userId && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Eingeloggt: Freigabe- und Rollen-Status nachschlagen
  if (userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_approved")
      .eq("id", userId)
      .single();

    const isApproved = profile?.is_approved ?? false;
    const role = profile?.role ?? "user";

    // Nicht freigegeben -> nur die Sperrseite (und Login/Callback) erlauben
    if (!isApproved && !isPublicPath) {
      const url = request.nextUrl.clone();
      url.pathname = "/pending-approval";
      return NextResponse.redirect(url);
    }

    // Bereits freigegeben, landet aber auf /login oder /pending-approval
    // -> direkt ins Dashboard weiterleiten
    if (isApproved && (pathname === "/login" || pathname.startsWith("/pending-approval"))) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    // Admin-Bereich nur für admin/mod
    if (pathname.startsWith("/admin") && role !== "admin" && role !== "mod") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
