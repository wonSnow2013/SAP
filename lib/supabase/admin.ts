import { createClient } from "@supabase/supabase-js";

/**
 * Supabase-Client mit Service-Role-Key. NUR serverseitig verwenden
 * (Server Actions / Route Handlers) - dieser Client umgeht RLS komplett.
 * Niemals in eine Client Component importieren oder den Key mit
 * NEXT_PUBLIC_ prefixen.
 *
 * Wird u. a. gebraucht, um Auth-User wirklich zu löschen
 * (supabase.auth.admin.deleteUser) - das kann der normale anon-Key nicht.
 */
export function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY oder NEXT_PUBLIC_SUPABASE_URL fehlt in den Umgebungsvariablen."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
