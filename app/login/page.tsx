"use client";

// =====================================================================
// /login · Client Component
// Magic-Link-Login über Supabase Auth. Nach Klick auf den Link in der
// E-Mail landet der Nutzer via /auth/callback wieder in der App.
// =====================================================================

import { useState } from "react";
import { Dices, Mail, CheckCircle2 } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
      return;
    }
    setStatus("sent");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <Dices className="h-7 w-7 text-violet-600" />
          <h1 className="text-xl font-bold text-slate-900">Spieleabend-App</h1>
        </div>

        {status === "sent" ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p className="text-sm text-slate-600">
              Wir haben dir einen Login-Link an <strong>{email}</strong> geschickt.
              Öffne dein Postfach und klick auf den Link.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-slate-500">
              Melde dich mit deiner E-Mail an – ganz ohne Passwort.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                E-Mail-Adresse
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="du@beispiel.de"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>

            {status === "error" && <p className="text-sm text-rose-600">{errorMsg}</p>}

            <button
              type="submit"
              disabled={status === "sending"}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
            >
              <Mail className="h-4 w-4" />
              {status === "sending" ? "Wird gesendet…" : "Login-Link senden"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
