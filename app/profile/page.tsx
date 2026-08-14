"use client";

// =====================================================================
// /profile · Client Component
// E-Mail (schreibgeschützt), Anzeigename, Profilfarbe, Avatar-Upload
// (oder Initialen-Fallback). Speichern zeigt Toast-Feedback.
// =====================================================================

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Upload, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { BackToDashboard } from "@/components/layout/BackToDashboard";

const AVATAR_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#8b5cf6", "#14b8a6"];

interface ProfileFormState {
  email: string;
  displayName: string;
  avatarColor: string;
  avatarUrl: string | null;
}

export default function ProfilePage() {
  const [state, setState] = useState<ProfileFormState | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase
        .from("profiles")
        .select("display_name, avatar_color, avatar_url")
        .eq("id", auth.user.id)
        .single();
      setState({
        email: auth.user.email ?? "",
        displayName: data?.display_name ?? "",
        avatarColor: data?.avatar_color ?? AVATAR_COLORS[0],
        avatarUrl: data?.avatar_url ?? null,
      });
    })();
  }, []);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!state) return;

    startTransition(async () => {
      const supabase = createBrowserSupabaseClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        toast.error("Session abgelaufen, bitte erneut einloggen.");
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: state.displayName.trim(),
          avatar_color: state.avatarColor,
        })
        .eq("id", auth.user.id);

      if (error) {
        toast.error("Speichern fehlgeschlagen: " + error.message);
        return;
      }
      toast.success("Profil gespeichert!");
    });
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !state) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Bitte eine Bilddatei auswählen.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Datei zu groß (max. 2 MB).");
      return;
    }

    setIsUploading(true);
    const supabase = createBrowserSupabaseClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setIsUploading(false);
      return;
    }

    const path = `${auth.user.id}/avatar.${file.name.split(".").pop()}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast.error("Upload fehlgeschlagen: " + uploadError.message);
      setIsUploading(false);
      return;
    }

    const { data: publicUrl } = supabase.storage.from("avatars").getPublicUrl(path);
    // Cache-Busting, damit das neue Bild sofort statt der alten Version angezeigt wird
    const bustedUrl = `${publicUrl.publicUrl}?t=${Date.now()}`;

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: bustedUrl })
      .eq("id", auth.user.id);

    setIsUploading(false);

    if (updateError) {
      toast.error("Speichern des Avatars fehlgeschlagen: " + updateError.message);
      return;
    }

    setState((s) => (s ? { ...s, avatarUrl: bustedUrl } : s));
    toast.success("Avatar aktualisiert!");
  }

  async function handleRemoveAvatar() {
    if (!state) return;
    const supabase = createBrowserSupabaseClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;

    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", auth.user.id);

    if (error) {
      toast.error("Entfernen fehlgeschlagen: " + error.message);
      return;
    }
    setState((s) => (s ? { ...s, avatarUrl: null } : s));
    toast.success("Avatar entfernt, Initialen werden angezeigt.");
  }

  if (!state) {
    return (
      <main className="mx-auto max-w-lg px-4 py-8">
        <p className="text-sm text-slate-400">Lädt…</p>
      </main>
    );
  }

  const initials = state.displayName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <BackToDashboard />
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Profil & Einstellungen</h1>

      <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div
            className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full text-lg font-semibold text-white"
            style={{ backgroundColor: state.avatarColor }}
          >
            {state.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={state.avatarUrl} alt="Avatar" className="h-16 w-16 object-cover" />
            ) : (
              initials || "?"
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-violet-400 disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              {isUploading ? "Lädt hoch…" : "Bild hochladen"}
            </button>
            {state.avatarUrl && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-rose-600"
              >
                <Trash2 className="h-3 w-3" />
                Entfernen (Initialen nutzen)
              </button>
            )}
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              E-Mail-Adresse
            </label>
            <input
              type="email"
              value={state.email}
              disabled
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
            />
            <p className="mt-1 text-xs text-slate-400">
              Änderung der E-Mail ist aktuell nicht selbst möglich – wende dich an einen Admin.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Anzeigename
            </label>
            <input
              value={state.displayName}
              onChange={(e) => setState({ ...state, displayName: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Profilfarbe (hebt deine Zeiten im Kalender hervor)
            </label>
            <div className="flex flex-wrap gap-2">
              {AVATAR_COLORS.map((color) => (
                <button
                  type="button"
                  key={color}
                  onClick={() => setState({ ...state, avatarColor: color })}
                  style={{ backgroundColor: color }}
                  className={cn(
                    "h-8 w-8 rounded-full transition-transform",
                    state.avatarColor === color &&
                      "scale-110 ring-2 ring-slate-400 ring-offset-2"
                  )}
                />
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
          >
            {isPending ? "Speichert…" : "Änderungen speichern"}
          </button>
        </form>
      </div>
    </main>
  );
}
