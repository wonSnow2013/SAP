"use client";

// =====================================================================
// AvailabilityForm
// Zwei Tabs: (1) wiederkehrende Wochen-Verfügbarkeit, (2) konkretes
// Datum mit Zeitfenster, Präferenz oder Sperrtag-Markierung.
// =====================================================================

import { useState, useTransition } from "react";
import { CalendarX2, CalendarClock, Flame, ThumbsUp, Meh } from "lucide-react";
import { cn } from "@/lib/utils";
import { upsertRecurringAvailability, upsertDateAvailability } from "@/lib/actions";
import type { Preference } from "@/types";

const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

const PREFERENCE_OPTIONS: { value: Preference; label: string; icon: typeof Flame }[] = [
  { value: 1, label: "Wenn's sein muss", icon: Meh },
  { value: 2, label: "Gerne", icon: ThumbsUp },
  { value: 3, label: "Richtig Bock!", icon: Flame },
];

interface AvailabilityFormProps {
  groupId: string;
  onSaved?: () => void;
}

export function AvailabilityForm({ groupId, onSaved }: AvailabilityFormProps) {
  const [tab, setTab] = useState<"recurring" | "date">("date");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-5 flex gap-1 rounded-xl bg-slate-100 p-1">
        <TabButton active={tab === "date"} onClick={() => setTab("date")} icon={CalendarClock}>
          Konkretes Datum
        </TabButton>
        <TabButton active={tab === "recurring"} onClick={() => setTab("recurring")} icon={CalendarX2}>
          Wöchentlich
        </TabButton>
      </div>

      {tab === "date" ? (
        <DateAvailabilityTab groupId={groupId} onSaved={onSaved} />
      ) : (
        <RecurringAvailabilityTab groupId={groupId} onSaved={onSaved} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof CalendarClock;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors",
        active ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

// -----------------------------------------------------------------------
// Tab 1: Konkretes Datum
// -----------------------------------------------------------------------

function DateAvailabilityTab({ groupId, onSaved }: AvailabilityFormProps) {
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<"available" | "blocked" | "maybe">("available");
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("23:00");
  const [preference, setPreference] = useState<Preference>(2);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date) {
      setError("Bitte ein Datum wählen.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await upsertDateAvailability({
          groupId,
          date,
          status,
          startTime: status === "available" ? startTime : undefined,
          endTime: status === "available" ? endTime : undefined,
          preference: status === "available" ? preference : undefined,
          note: note || undefined,
        });
        onSaved?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler beim Speichern.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Datum</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
      </div>

      <div className="flex gap-2">
        {(
          [
            { value: "available", label: "Verfügbar" },
            { value: "maybe", label: "Vielleicht" },
            { value: "blocked", label: "Sperrtag" },
          ] as const
        ).map((opt) => (
          <button
            type="button"
            key={opt.value}
            onClick={() => setStatus(opt.value)}
            className={cn(
              "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              status === opt.value
                ? opt.value === "blocked"
                  ? "border-rose-400 bg-rose-50 text-rose-700"
                  : "border-violet-400 bg-violet-50 text-violet-700"
                : "border-slate-200 text-slate-500 hover:border-slate-300"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {status === "available" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Von</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Bis</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Wie sehr hast du Lust?
            </label>
            <div className="flex gap-2">
              {PREFERENCE_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setPreference(value)}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                    preference === value
                      ? "border-violet-400 bg-violet-50 text-violet-700"
                      : "border-slate-200 text-slate-500 hover:border-slate-300"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Notiz (optional)</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="z. B. 'kann erst ab 19 Uhr'"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
      >
        {isPending ? "Speichern…" : "Verfügbarkeit speichern"}
      </button>
    </form>
  );
}

// -----------------------------------------------------------------------
// Tab 2: Wiederkehrende Verfügbarkeit
// -----------------------------------------------------------------------

function RecurringAvailabilityTab({ groupId, onSaved }: AvailabilityFormProps) {
  const [weekday, setWeekday] = useState(2); // Dienstag
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("23:00");
  const [preference, setPreference] = useState<Preference>(2);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await upsertRecurringAvailability({ groupId, weekday, startTime, endTime, preference });
        onSaved?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler beim Speichern.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Wochentag</label>
        <select
          value={weekday}
          onChange={(e) => setWeekday(Number(e.target.value))}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {WEEKDAYS.map((day, idx) => (
            <option key={day} value={idx}>
              Jeden {day}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Ab</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Bis</label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">Standard-Lust</label>
        <div className="flex gap-2">
          {PREFERENCE_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              type="button"
              key={value}
              onClick={() => setPreference(value)}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                preference === value
                  ? "border-violet-400 bg-violet-50 text-violet-700"
                  : "border-slate-200 text-slate-500 hover:border-slate-300"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
      >
        {isPending ? "Speichern…" : "Regel hinzufügen"}
      </button>
    </form>
  );
}
