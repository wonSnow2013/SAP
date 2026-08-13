import { createBrowserClient } from "@supabase/ssr";

/** Supabase-Client für Client Components (Realtime-Subscriptions etc.). */
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
