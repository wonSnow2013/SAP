"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={isPending}
      className={
        className ??
        "flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-rose-600 disabled:opacity-50"
      }
    >
      <LogOut className="h-4 w-4" />
      {isPending ? "Wird abgemeldet…" : "Abmelden"}
    </button>
  );
}
