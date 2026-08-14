// =====================================================================
// /availability · Server Component
// Bindet das Verfügbarkeits-Formular an die Gruppe des Nutzers.
// =====================================================================

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AvailabilityForm } from "@/components/availability/AvailabilityForm";
import { BackToDashboard } from "@/components/layout/BackToDashboard";

export default async function AvailabilityPage() {
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: membership } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", auth.user.id)
    .limit(1)
    .single();

  if (!membership) redirect("/onboarding");

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <BackToDashboard />
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Verfügbarkeit eintragen</h1>
      <AvailabilityForm groupId={membership.group_id} />
    </main>
  );
}
