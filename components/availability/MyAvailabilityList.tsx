"use client";

// =====================================================================
// MyAvailabilityList
// Chronologische Übersicht aller eigenen Verfügbarkeiten (konkrete
// Termine + wiederkehrende Regeln), mit Bearbeiten/Löschen.
// =====================================================================

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2, Pencil, Moon, CalendarClock, CalendarX2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  deleteDateAvailability,
  deleteRecurringAvailability,
  updateDateAvailability,
} from "@/lib/actions";
import type { MyAvailabilityEntry, Preference } from "@/types";

const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const STATUS_LABEL: Record<string, string> = {
  available: "Verfügbar",
  blocked: "Sperrtag",
  maybe: "Vielleicht",
};

export function MyAvailabilityList({ initialEntries }: { initialEntries: MyAvailabilityEntry[] }) {
  const [entries, setEntries] = useState(initialEntries);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete(entry: MyAvailabilityEntry) {
    if (!confirm("Diesen Eintrag wirklich löschen?")) return;
    startTransition(async () => {
      try {
        if (entry.kind === "recurring") {
          await deleteRecurringAvailability(entry.id);
        } else {
          await deleteDateAvailability(entry.id);
        }
        setEntries((prev) => prev.filter((e) => e.id !== entry.id));
        toast.success("Eintrag gelöscht.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Löschen fehlgeschlagen.");
      }
    });
  }

  const dateEntries = entries.filter((e) => e.kind === "date-specific");
  const recurringEntries = entries.filter((e) => e.kind === "recurring");

  if (entries.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
        Noch keine Verfügbarkeiten eingetragen.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {dateEntries.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <CalendarClock className="h-4 w-4" />
            Kommende Termine
          </h3>
          <div className="space-y-2">
            {dateEntries.map((entry) =>
              editingId === entry.id ? (
                <EditDateEntryForm
                  key={entry.id}
                  entry={entry}
                  onCancel={() => setEditingId(null)}
                  onSaved={(updated) => {
                    setEntries((prev) => prev.map((e) => (e.id === entry.id ? updated : e)));
                    setEditingId(null);
                  }}
                />
              ) : (
                <DateEntryRow
                  key={entry.id}
                  entry={entry}
                  isPending={isPending}
                  onEdit={() => setEditingId(entry.id)}
                  onDelete={() => handleDelete(entry)}
                />
              )
            )}
          </div>
        </section>
      )}

      {recurringEntries.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <CalendarX2 className="h-4 w-4" />
            Wiederkehrende Regeln
          </h3>
          <div className="space-y-2">
            {recurringEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    Jeden {WEEKDAYS[entry.weekday ?? 0]}, {entry.startTime}–{entry.endTime} Uhr
                    {entry.endTime <= entry.startTime && (
                      <span className="ml-1.5 inline-flex items-center gap-1 text-xs text-violet-600">
                        <Moon className="h-3 w-3" />
                        Folgetag
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(entry)}
                  disabled={isPending}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function DateEntryRow({
  entry,
  isPending,
  onEdit,
  onDelete,
}: {
  entry: MyAvailabilityEntry;
  isPending: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const startDate = entry.startAt ? new Date(entry.startAt) : null;
  const spansNextDay =
    entry.endAt && startDate && new Date(entry.endAt).toDateString() !== startDate.toDateString();

  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div>
        <p className="text-sm font-medium text-slate-900">
          {startDate?.toLocaleDateString("de-DE", {
            weekday: "short",
            day: "2-digit",
            month: "2-digit",
          })}
          {" · "}
          <span className={cn(entry.status === "blocked" ? "text-rose-600" : "text-slate-700")}>
            {STATUS_LABEL[entry.status ?? "available"]}
          </span>
          {entry.status === "available" && (
            <>
              {" "}
              {entry.startTime}–{entry.endTime} Uhr
              {spansNextDay && (
                <span className="ml-1.5 inline-flex items-center gap-1 text-xs text-violet-600">
                  <Moon className="h-3 w-3" />
                  Folgetag
                </span>
              )}
            </>
          )}
        </p>
        {entry.note && <p className="text-xs text-slate-400">{entry.note}</p>}
      </div>
      <div className="flex gap-1">
        {entry.status !== "blocked" && (
          <button
            onClick={onEdit}
            disabled={isPending}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-violet-600 disabled:opacity-50"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={onDelete}
          disabled={isPending}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function EditDateEntryForm({
  entry,
  onCancel,
  onSaved,
}: {
  entry: MyAvailabilityEntry;
  onCancel: () => void;
  onSaved: (updated: MyAvailabilityEntry) => void;
}) {
  const startDate = entry.startAt ? new Date(entry.startAt).toISOString().slice(0, 10) : "";
  const [date, setDate] = useState(startDate);
  const [startTime, setStartTime] = useState(entry.startTime);
  const [endTime, setEndTime] = useState(entry.endTime);
  const [preference, setPreference] = useState<Preference>(entry.preference ?? 2);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      try {
        await updateDateAvailability(entry.id, {
          date,
          startTime,
          endTime,
          status: "available",
          preference,
        });
        onSaved({
          ...entry,
          startAt: `${date}T${startTime}:00`,
          startTime,
          endTime,
          preference,
        });
        toast.success("Eintrag aktualisiert.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
      }
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-violet-300 bg-violet-50/40 px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">Eintrag bearbeiten</p>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
        <input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
        <input
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>
      {endTime <= startTime && (
        <p className="flex items-center gap-1 text-xs text-violet-600">
          <Moon className="h-3 w-3" />
          Geht über Mitternacht – endet am Folgetag.
        </p>
      )}
      <button
        onClick={handleSave}
        disabled={isPending}
        className="w-full rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {isPending ? "Speichert…" : "Speichern"}
      </button>
    </div>
  );
}
