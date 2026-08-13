"use client";

// =====================================================================
// /onboarding · Client Component
// Erster Schritt nach dem Login: eigenes Profil anlegen und entweder
// eine neue Gruppe gründen oder per Invite-Code einer bestehenden
// beitreten.
// =====================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Users, PlusCircle, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const AVATAR_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444"];

export default function OnboardingPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [displayName, setDisplayName] = useState("");
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const [groupName, setGroupName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!displayName.trim()) {
      setError("Bitte gib deinen Namen ein.");
      return;
    }

    startTransition(async () => {
      const supabase = createBrowserSupabaseClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setError("Session abgelaufen, bitte erneut einloggen.");
        return;
      }

      // Profil anlegen/aktualisieren
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: auth.user.id,
        display_name: displayName.trim(),
        avatar_color: avatarColor,
      });
      if (profileError) {
        setError(profileError.message);
        return;
      }

      if (mode === "create") {
        if (!groupName.trim()) {
          setError("Bitte gib einen Gruppennamen ein.");
          return;
        }
        const { data: group, error: groupError } = await supabase
          .from("groups")
          .insert({ name: groupName.trim(), created_by: auth.user.id })
          .select()
          .single();
        if (groupError || !group) {
          setError(groupError?.message ?? "Gruppe konnte nicht erstellt werden.");
          return;
        }
        const { error: memberError } = await supabase.from("group_members").insert({
          group_id: group.id,
          user_id: auth.user.id,
          role: "owner",
        });
        if (memberError) {
          setError(memberError.message);
          return;
        }
      } else {
        if (!inviteCode.trim()) {
          setError("Bitte gib einen Einladungscode ein.");
          return;
        }
        const { data: group, error: findError } = await supabase
          .from("groups")
          .select("id")
          .eq("invite_code", inviteCode.trim())
          .single();
        if (findError || !group) {
          setError("Kein Gruppe mit diesem Code gefunden.");
          return;
        }
        const { error: memberError } = await supabase.from("group_members").insert({
          group_id: group.id,
          user_id: auth.user.id,
          role: "member",
        });
        if (memberError) {
          setError(memberError.message);
          return;
        }
      }

      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-bold text-slate-900">Willkommen! 🎲</h1>
        <p className="mb-6 text-sm text-slate-500">
          Leg kurz dein Profil an und starte oder tritt einer Gruppe bei.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Dein Name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="z. B. Anna"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Avatar-Farbe</label>
            <div className="flex gap-2">
              {AVATAR_COLORS.map((color) => (
                <button
                  type="button"
                  key={color}
                  onClick={() => setAvatarColor(color)}
                  style={{ backgroundColor: color }}
                  className={cn(
                    "h-8 w-8 rounded-full transition-transform",
                    avatarColor === color && "ring-2 ring-offset-2 ring-slate-400 scale-110"
                  )}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setMode("create")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium",
                mode === "create" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"
              )}
            >
              <PlusCircle className="h-4 w-4" />
              Gruppe gründen
            </button>
            <button
              type="button"
              onClick={() => setMode("join")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium",
                mode === "join" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"
              )}
            >
              <LogIn className="h-4 w-4" />
              Beitreten
            </button>
          </div>

          {mode === "create" ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Gruppenname
              </label>
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="z. B. Die Würfelrunde"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Einladungscode
              </label>
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="von einem Gruppenmitglied erhalten"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          )}

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <button
            type="submit"
            disabled={isPending}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            <Users className="h-4 w-4" />
            {isPending ? "Wird erstellt…" : mode === "create" ? "Gruppe erstellen" : "Beitreten"}
          </button>
        </form>
      </div>
    </main>
  );
}
