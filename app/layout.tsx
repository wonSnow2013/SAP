import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/layout/Navbar";
import type { Profile } from "@/types";

export const metadata: Metadata = {
  title: "Spieleabend-App",
  description: "Findet gemeinsam den perfekten Spielabend – ohne Chat-Chaos.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();

  let profile: Profile | null = null;
  if (auth.user) {
    const { data } = await supabase
      .from("profiles")
      .select("id, email, display_name, avatar_color, avatar_url, role, is_approved")
      .eq("id", auth.user.id)
      .single();
    if (data) {
      profile = {
        id: data.id,
        email: data.email,
        displayName: data.display_name,
        avatarColor: data.avatar_color,
        avatarUrl: data.avatar_url,
        role: data.role,
        isApproved: data.is_approved,
      };
    }
  }

  // Navbar nur zeigen, wenn eingeloggt UND freigegeben (auf /login und
  // /pending-approval wäre eine Navigation ohnehin nutzlos/verwirrend).
  const showNavbar = !!profile?.isApproved;

  return (
    <html lang="de">
      <body className="min-h-screen bg-slate-50 font-sans antialiased">
        {showNavbar && profile && <Navbar profile={profile} />}
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
