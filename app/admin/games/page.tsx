import { getAllGames } from "@/lib/actions";
import { GameLibraryManager } from "@/components/admin/GameLibraryManager";
import { BackToDashboard } from "@/components/layout/BackToDashboard";

export default async function AdminGamesPage() {
  const games = await getAllGames();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <BackToDashboard />
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Spielebibliothek</h1>
      <p className="mb-6 text-sm text-slate-500">
        Globale Spieleliste für alle – wird bei der Event-Erstellung zur Auswahl angeboten.
      </p>
      <GameLibraryManager initialGames={games} />
    </main>
  );
}
