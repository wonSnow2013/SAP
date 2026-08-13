import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// =====================================================================
// Aktualisiert den Supabase-Session-Cookie bei jedem Request. Ohne das
// läuft die Session in Server Components irgendwann ab, weil dort keine
// Cookies geschrieben werden können (siehe lib/supabase/server.ts).
// =====================================================================

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Fehlende Konfiguration darf die gesamte App nicht lahmlegen (500 auf
  // jeder Route) - stattdessen Request unverändert durchlassen. Die
  // eigentlichen Seiten/Server Actions zeigen dann einen klaren Fehler,
  // statt dass die Middleware global crasht.
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

  try {
    await supabase.auth.getUser();
  } catch (err) {
    // Netzwerk-/Supabase-Fehler dürfen ebenfalls nicht die ganze App blockieren
    console.error("[middleware] Supabase auth.getUser() fehlgeschlagen:", err);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
