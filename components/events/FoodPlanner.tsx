"use client";

// =====================================================================
// FoodPlanner
// Einfache Checkliste: Gruppenmitglieder tragen ein, was sie mitbringen.
// =====================================================================

import { useState, useTransition } from "react";
import { Plus, Pizza, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FoodItem, Profile } from "@/types";

interface FoodPlannerProps {
  eventId: string;
  items: FoodItem[];
  members: Profile[];
  currentUserId: string;
  onAddItem: (item: { itemName: string; category: FoodItem["category"] }) => Promise<void>;
  onAssign: (itemId: string, userId: string | null) => Promise<void>;
}

const CATEGORIES: FoodItem["category"][] = ["Snack", "Getränk", "Hauptgericht", "Sonstiges"];

export function FoodPlanner({
  items,
  members,
  currentUserId,
  onAddItem,
  onAssign,
}: FoodPlannerProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<FoodItem["category"]>("Snack");
  const [isPending, startTransition] = useTransition();

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    startTransition(async () => {
      await onAddItem({ itemName: name.trim(), category });
      setName("");
    });
  }

  const memberById = new Map(members.map((m) => [m.id, m]));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Pizza className="h-4 w-4" />
        Snacks & Getränke
      </h3>

      <ul className="mb-4 space-y-1.5">
        {items.map((item) => {
          const assignee = item.assignedTo ? memberById.get(item.assignedTo) : null;
          return (
            <li
              key={item.id}
              className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-slate-800">{item.itemName}</p>
                <p className="text-xs text-slate-400">{item.category}</p>
              </div>
              {assignee ? (
                <button
                  onClick={() => onAssign(item.id, null)}
                  className="flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-rose-50 hover:text-rose-700"
                >
                  {assignee.displayName}
                  <X className="h-3 w-3" />
                </button>
              ) : (
                <button
                  onClick={() => onAssign(item.id, currentUserId)}
                  className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 hover:border-violet-300 hover:text-violet-700"
                >
                  Ich bringe es mit
                </button>
              )}
            </li>
          );
        })}
        {items.length === 0 && (
          <p className="py-2 text-sm text-slate-400">Noch nichts eingetragen.</p>
        )}
      </ul>

      <form onSubmit={handleAdd} className="flex gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as FoodItem["category"])}
          className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
        >
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="z. B. Chips, Cola…"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={isPending}
          className={cn(
            "flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700",
            isPending && "opacity-50"
          )}
        >
          <Plus className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
