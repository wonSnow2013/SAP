"use client";

// =====================================================================
// EventPlanner
// Fixiert einen Spielabend: Host mit Kapazität, automatisch passende
// Spielvorschläge (basierend auf zugesagter Personenzahl + Zeitfenster),
// Teilnehmer-RSVP in Echtzeit und ein einfacher Food-/Snack-Planer.
// =====================================================================

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Users,
  Clock,
  Dices,
  CalendarPlus,
  Check,
  X,
  HelpCircle,
  Loader2,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createEvent,
  respondToEvent,
  suggestGamesForEvent,
  deleteEvent,
} from "@/lib/actions";
import type { DayMatch, Game, GameEvent, Profile } from "@/types";

interface EventPlannerProps {
  groupId: string;
  dayMatch: DayMatch;
  members: Profile[];
  existingEvent?: GameEvent;
  currentUserId: string;
  /** Ob der aktuelle Nutzer dieses Event löschen darf (Admin/Mod/Ersteller/Host). */
  canDelete?: boolean;
}

export function EventPlanner({
  groupId,
  dayMatch,
  members,
  existingEvent,
  currentUserId,
  canDelete = false,
}: EventPlannerProps) {
  const router = useRouter();
  const [hostId, setHostId] = useState(existingEvent?.hostId ?? members[0]?.id ?? "");
  const [hostCapacity, setHostCapacity] = useState(existingEvent?.hostCapacity ?? 6);
  const [selectedGameId, setSelectedGameId] = useState(existingEvent?.gameId ?? "");
  const [suggestedGames, setSuggestedGames] = useState<Game[]>([]);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

  // Uhrzeit ist ein Vorschlag aus dem Match-Fenster, aber frei editierbar -
  // z. B. wenn die Gruppe lieber früher anfangen will als "nötig" wäre.
  const [startTime, setStartTime] = useState(
    existingEvent?.startTime ?? dayMatch.bestWindow?.startTime ?? "18:00"
  );
  const [endTime, setEndTime] = useState(
    existingEvent?.endTime ?? dayMatch.bestWindow?.endTime ?? "22:00"
  );

  const availableMinutes = useMemo(() => {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const minutes = eh * 60 + em - (sh * 60 + sm);
    return minutes > 0 ? minutes : 180;
  }, [startTime, endTime]);

  const acceptedCount =
    existingEvent?.participants.filter((p) => p.status === "accepted").length ??
    dayMatch.bestWindow?.participantIds.length ??
    members.length;

  useEffect(() => {
    suggestGamesForEvent(groupId, acceptedCount, availableMinutes).then(setSuggestedGames);
  }, [groupId, acceptedCount, availableMinutes]);

  function handleCreateEvent() {
    if (endTime <= startTime) {
      toast.error("Die Endzeit muss nach der Startzeit liegen.");
      return;
    }
    startTransition(async () => {
      try {
        const event = await createEvent({
          groupId,
          eventDate: dayMatch.date,
          startTime,
          endTime,
          hostId,
          hostCapacity,
          gameId: selectedGameId || undefined,
          matchScore: dayMatch.matchScore,
        });
        toast.success("Spielabend erfolgreich fixiert!");
        router.push(`/events/${event.id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fixieren fehlgeschlagen.");
      }
    });
  }

  function handleDeleteEvent() {
    if (!existingEvent) return;
    if (!confirm("Diesen Spielabend wirklich löschen?")) return;

    startDeleteTransition(async () => {
      try {
        await deleteEvent(existingEvent.id);
        toast.success("Spielabend gelöscht.");
        router.push("/dashboard");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Löschen fehlgeschlagen.");
      }
    });
  }

  return (
    <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6">
      <header className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Spielabend am{" "}
            {new Date(dayMatch.date + "T00:00:00").toLocaleDateString("de-DE", {
              weekday: "long",
              day: "2-digit",
              month: "long",
            })}
          </h2>
          <p className="mt-1 flex items-center gap-3 text-sm text-slate-500">
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {dayMatch.bestWindow?.startTime}–{dayMatch.bestWindow?.endTime}
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {acceptedCount}/{members.length} zugesagt
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
            Match {dayMatch.matchScore.toFixed(0)}
          </span>
          {existingEvent && canDelete && (
            <button
              onClick={handleDeleteEvent}
              disabled={isDeleting}
              title="Event löschen"
              className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
      </header>

      {/* Editierbare Uhrzeit */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Uhrzeit</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500">Von</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={!!existingEvent}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Bis</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              disabled={!!existingEvent}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
            />
          </div>
        </div>
        {!existingEvent && dayMatch.bestWindow && (
          <p className="mt-1.5 text-xs text-slate-400">
            Vorschlag basierend auf dem besten Überlapp-Fenster – du kannst die Zeit
            aber frei anpassen.
          </p>
        )}
      </section>

      {/* Host-Auswahl */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Wer hostet?</h3>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <button
              key={m.id}
              onClick={() => setHostId(m.id)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                hostId === m.id
                  ? "border-violet-400 bg-violet-50 text-violet-700"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
              )}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: m.avatarColor }}
              />
              {m.displayName}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <label className="text-sm text-slate-600">Max. Kapazität:</label>
          <input
            type="number"
            min={1}
            value={hostCapacity}
            onChange={(e) => setHostCapacity(Number(e.target.value))}
            className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm"
          />
          <span className="text-sm text-slate-400">Personen (z. B. Couch-Plätze)</span>
        </div>
      </section>

      {/* Spielauswahl mit automatischem Vorschlag */}
      <section>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Dices className="h-4 w-4" />
          Passende Spiele ({acceptedCount} Spieler, ~{Math.round(availableMinutes / 60)}h Zeit)
        </h3>
        {suggestedGames.length === 0 ? (
          <p className="text-sm text-slate-400">
            Keine passenden Spiele in der Bibliothek gefunden – trag welche in eurer
            Spiele-Bibliothek ein!
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {suggestedGames.map((game) => (
              <button
                key={game.id}
                onClick={() => setSelectedGameId(game.id)}
                className={cn(
                  "flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors",
                  selectedGameId === game.id
                    ? "border-violet-400 bg-violet-50"
                    : "border-slate-200 hover:border-slate-300"
                )}
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{game.title}</p>
                  <p className="text-xs text-slate-500">
                    {game.minPlayers}-{game.maxPlayers} Spieler ·{" "}
                    {game.durationMinutes} Min.
                  </p>
                </div>
                {selectedGameId === game.id && (
                  <Check className="h-4 w-4 text-violet-600" />
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* RSVP-Liste */}
      {existingEvent && (
        <RsvpList
          event={existingEvent}
          members={members}
          currentUserId={currentUserId}
        />
      )}

      {!existingEvent && (
        <button
          onClick={handleCreateEvent}
          disabled={isPending || !hostId}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CalendarPlus className="h-4 w-4" />
          )}
          {isPending ? "Wird fixiert…" : "Spielabend fixieren"}
        </button>
      )}
    </div>
  );
}

function RsvpList({
  event,
  members,
  currentUserId,
}: {
  event: GameEvent;
  members: Profile[];
  currentUserId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const myStatus = event.participants.find((p) => p.userId === currentUserId)?.status;

  function respond(status: "accepted" | "declined" | "maybe") {
    startTransition(() => respondToEvent(event.id, status));
  }

  const byUser = useMemo(() => {
    const map = new Map(event.participants.map((p) => [p.userId, p.status]));
    return map;
  }, [event.participants]);

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-slate-700">Zusagen</h3>
      <ul className="space-y-1.5">
        {members.map((m) => {
          const status = byUser.get(m.id) ?? "invited";
          return (
            <li
              key={m.id}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50"
            >
              <span className="flex items-center gap-2 text-sm text-slate-700">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: m.avatarColor }}
                />
                {m.displayName}
              </span>
              <StatusBadge status={status} />
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => respond("accepted")}
          disabled={isPending}
          className={cn(
            "flex flex-1 items-center justify-center gap-1 rounded-lg border py-2 text-sm font-medium",
            myStatus === "accepted"
              ? "border-emerald-400 bg-emerald-50 text-emerald-700"
              : "border-slate-200 text-slate-600 hover:border-slate-300"
          )}
        >
          <Check className="h-4 w-4" /> Zusagen
        </button>
        <button
          onClick={() => respond("maybe")}
          disabled={isPending}
          className={cn(
            "flex flex-1 items-center justify-center gap-1 rounded-lg border py-2 text-sm font-medium",
            myStatus === "maybe"
              ? "border-amber-400 bg-amber-50 text-amber-700"
              : "border-slate-200 text-slate-600 hover:border-slate-300"
          )}
        >
          <HelpCircle className="h-4 w-4" /> Vielleicht
        </button>
        <button
          onClick={() => respond("declined")}
          disabled={isPending}
          className={cn(
            "flex flex-1 items-center justify-center gap-1 rounded-lg border py-2 text-sm font-medium",
            myStatus === "declined"
              ? "border-rose-400 bg-rose-50 text-rose-700"
              : "border-slate-200 text-slate-600 hover:border-slate-300"
          )}
        >
          <X className="h-4 w-4" /> Absagen
        </button>
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    accepted: { label: "Zugesagt", cls: "bg-emerald-100 text-emerald-700" },
    declined: { label: "Abgesagt", cls: "bg-rose-100 text-rose-700" },
    maybe: { label: "Vielleicht", cls: "bg-amber-100 text-amber-700" },
    invited: { label: "Offen", cls: "bg-slate-100 text-slate-500" },
  }[status] ?? { label: status, cls: "bg-slate-100 text-slate-500" };

  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", config.cls)}>
      {config.label}
    </span>
  );
}
