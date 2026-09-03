"use client";

// =====================================================================
// GameLibraryManager
// Formular + Liste zur Verwaltung der globalen Spielebibliothek.
// Seite selbst ist middleware-geschützt (nur admin/mod), Mutationen sind
// zusätzlich per RLS auf is_staff_user() beschränkt.
// =====================================================================

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Dices, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createGame, updateGame, deleteGame } from "@/lib/actions";

interface GameRow {
  id: string;
  title: string;
  min_players: number;
  max_players: number;
  estimated_duration_minutes: number;
  image_url: string | null;
}

const emptyForm = {
  title: "",
  minPlayers: 2,
  maxPlayers: 4,
  estimatedDurationMinutes: 60,
  imageUrl: "",
};

export function GameLibraryManager({ initialGames }: { initialGames: GameRow[] }) {
  const [games, setGames] = useState(initialGames);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [isPending, startTransition] = useTransition();

  function startEdit(game: GameRow) {
    setEditingId(game.id);
    setForm({
      title: game.title,
      minPlayers: game.min_players,
      maxPlayers: game.max_players,
      estimatedDurationMinutes: game.estimated_duration_minutes,
      imageUrl: game.image_url ?? "",
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Bitte einen Spieltitel eingeben.");
      return;
    }
    if (form.maxPlayers < form.minPlayers) {
      toast.error("Max-Spieler muss >= Min-Spieler sein.");
      return;
    }

    startTransition(async () => {
      try {
        const payload = {
          title: form.title.trim(),
          minPlayers: form.minPlayers,
          maxPlayers: form.maxPlayers,
          estimatedDurationMinutes: form.estimatedDurationMinutes,
          imageUrl: form.imageUrl.trim() || undefined,
        };

        if (editingId) {
          await updateGame(editingId, payload);
          setGames((prev) =>
            prev.map((g) =>
              g.id === editingId
                ? {
                    ...g,
                    title: payload.title,
                    min_players: payload.minPlayers,
                    max_players: payload.maxPlayers,
                    estimated_duration_minutes: payload.estimatedDurationMinutes,
                    image_url: payload.imageUrl ?? null,
                  }
                : g
            )
          );
          toast.success("Spiel aktualisiert.");
        } else {
          await createGame(payload);
          toast.success("Spiel hinzugefügt.");
          window.location.reload();
        }
        resetForm();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
      }
    });
  }

  function handleDelete(game: GameRow) {
    if (!confirm(`"${game.title}" wirklich aus der Bibliothek löschen?`)) return;
    startTransition(async () => {
      try {
        await deleteGame(game.id);
        setGames((prev) => prev.filter((g) => g.id !== game.id));
        toast.success("Spiel gelöscht.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Löschen fehlgeschlagen.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Dices className="h-4 w-4" />
            {editingId ? "Spiel bearbeiten" : "Neues Spiel hinzufügen"}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
              Abbrechen
            </button>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Titel</label>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="z. B. Catan"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Min. Spieler</label>
            <input
              type="number"
              min={1}
              value={form.minPlayers}
              onChange={(e) => setForm({ ...form, minPlayers: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Max. Spieler</label>
            <input
              type="number"
              min={1}
              value={form.maxPlayers}
              onChange={(e) => setForm({ ...form, maxPlayers: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Dauer (Min.)</label>
            <input
              type="number"
              min={5}
              step={5}
              value={form.estimatedDurationMinutes}
              onChange={(e) =>
                setForm({ ...form, estimatedDurationMinutes: Number(e.target.value) })
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Bild-URL (optional)
          </label>
          <input
            value={form.imageUrl}
            onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            placeholder="https://…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {isPending ? "Speichert…" : editingId ? "Änderungen speichern" : "Spiel hinzufügen"}
        </button>
      </form>

      <div className="space-y-2">
        {games.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
            Noch keine Spiele in der Bibliothek.
          </p>
        )}
        {games.map((game) => (
          <div
            key={game.id}
            className={cn(
              "flex items-center justify-between rounded-xl border bg-white px-4 py-3",
              editingId === game.id ? "border-violet-300 bg-violet-50/40" : "border-slate-200"
            )}
          >
            <div>
              <p className="text-sm font-semibold text-slate-900">{game.title}</p>
              <p className="text-xs text-slate-500">
                {game.min_players}-{game.max_players} Spieler ·{" "}
                {game.estimated_duration_minutes} Min.
              </p>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => startEdit(game)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-violet-600"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleDelete(game)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
