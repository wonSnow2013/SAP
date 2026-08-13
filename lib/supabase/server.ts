import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Erstellt einen Supabase-Client für Server Components / Server Actions.
 * Liest die Session aus den Next.js-Cookies, damit Row Level Security
 * (auth.uid()) korrekt greift.
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
        setAll(cookiesToSet) {
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
    }
  );
}
