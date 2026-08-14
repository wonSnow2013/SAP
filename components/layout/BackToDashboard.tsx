import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function BackToDashboard({ label = "Zurück zum Dashboard" }: { label?: string }) {
  return (
    <Link
      href="/dashboard"
      className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-violet-700"
    >
      <ChevronLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}
