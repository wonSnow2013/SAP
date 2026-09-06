import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Erstellt einen Supabase-Client für Server Components / Server Actions.
 * Liest die Session aus den Next.js-Cookies, damit Row Level Security
 * (auth.uid()) korrekt greift.
 *
 * WICHTIG: `global.fetch` erzwingt explizit `cache: "no-store"` für JEDEN
 * Request an die Supabase-REST-API. Ohne das kann es passieren, dass z. B.
 * die Middleware nach einer Admin-Freigabe (is_approved = true) noch eine
 * zwischengespeicherte, veraltete Antwort sieht und Nutzer fälschlich auf
 * /pending-approval hängen bleiben. Sicherheitshalber explizit statt sich
 * auf Next.js-Standardverhalten zu verlassen.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Aufruf aus einer Server Component ohne Schreibrechte -> ignorieren
            // (Session-Refresh übernimmt dann die Middleware)
          }
        },
      },
      global: {
        fetch: (url, options = {}) => fetch(url, { ...options, cache: "no-store" }),
      },
    }
  );
}
