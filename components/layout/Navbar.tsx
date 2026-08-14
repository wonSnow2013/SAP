"use client";

// =====================================================================
// Navbar
// Konsistente Kopfzeile auf allen eingeloggten Seiten. Zeigt den
// Admin-Link nur für role 'admin'/'mod'. Aktive Route wird hervorgehoben.
// =====================================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dices, LayoutDashboard, UserCircle2, ShieldCheck, Menu, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/layout/SignOutButton";
import type { Profile } from "@/types";

interface NavbarProps {
  profile: Profile;
}

export function Navbar({ profile }: NavbarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isStaff = profile.role === "admin" || profile.role === "mod";

  const links = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/profile", label: "Profil", icon: UserCircle2 },
    ...(isStaff ? [{ href: "/admin/users", label: "Admin", icon: ShieldCheck }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-slate-900">
          <Dices className="h-5 w-5 text-violet-600" />
          Spieleabend-App
        </Link>

        {/* Desktop-Nav */}
        <nav className="hidden items-center gap-1 sm:flex">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                pathname.startsWith(href)
                  ? "bg-violet-50 text-violet-700"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 sm:flex">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ backgroundColor: profile.avatarColor }}
            title={profile.displayName}
          >
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatarUrl}
                alt={profile.displayName}
                className="h-7 w-7 rounded-full object-cover"
              />
            ) : (
              initials(profile.displayName)
            )}
          </span>
          <SignOutButton />
        </div>

        {/* Mobile Toggle */}
        <button
          className="sm:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Menü öffnen"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <nav className="flex flex-col gap-1 border-t border-slate-100 px-4 py-3 sm:hidden">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
                pathname.startsWith(href)
                  ? "bg-violet-50 text-violet-700"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
          <div className="mt-2 border-t border-slate-100 pt-2">
            <SignOutButton />
          </div>
        </nav>
      )}
    </header>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
