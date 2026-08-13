// =====================================================================
// GET /api/events/[id]/ical
// Liefert eine .ics-Datei für "Zum Kalender hinzufügen".
// =====================================================================

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: event, error } = await supabase
    .from("events")
    .select("*, games(title), groups(name)")
    .eq("id", id)
    .single();

  if (error || !event) {
    return NextResponse.json({ error: "Event nicht gefunden." }, { status: 404 });
  }

  const dtStart = toIcalDateTime(event.event_date, event.start_time);
  const dtEnd = event.end_time
    ? toIcalDateTime(event.event_date, event.end_time)
    : toIcalDateTime(event.event_date, addHours(event.start_time, 3));

  const title = event.games?.title
    ? `Spielabend: ${event.games.title}`
    : "Spielabend";

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Spieleabend-App//DE",
    "BEGIN:VEVENT",
    `UID:${event.id}@spieleabend-app`,
    `DTSTAMP:${toIcalDateTime(new Date().toISOString().slice(0, 10), "12:00")}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcal(title)}`,
    `DESCRIPTION:${escapeIcal(`Spielabend der Gruppe ${event.groups?.name ?? ""}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="spielabend-${event.id}.ics"`,
    },
  });
}

function toIcalDateTime(date: string, time: string): string {
  return `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
}

function addHours(time: string, hours: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = (h + hours) % 24;
  return `${total.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function escapeIcal(text: string): string {
  return text.replace(/([,;])/g, "\\$1");
}
