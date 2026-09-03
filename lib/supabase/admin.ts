import { createClient } from "@supabase/supabase-js";

/**
 * Supabase-Client mit Service-Role-Key. NUR serverseitig verwenden -
 * umgeht RLS komplett. Wird für supabase.auth.admin.deleteUser() gebraucht.
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
