import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

/**
 * Sugerencias de direcciones para "¿Dónde?". La búsqueda la hace el servidor (no el
 * teléfono) contra Photon (OpenStreetMap, gratis y sin clave), con prioridad cerca de
 * Buenos Aires. Solo para integrantes logueadas.
 */
type Feature = { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> };

function toPlace(f: Feature) {
  const p = f.properties;
  const street = [p.street, p.housenumber].filter(Boolean).join(" ");
  const main = [p.name, street].filter((x, i, a) => x && a.indexOf(x) === i).join(", ") || p.city || "";
  const detail = [p.district ?? p.locality, p.city, p.state].filter((x, i, a) => x && a.indexOf(x) === i && x !== main).join(", ");
  return { main, detail, label: [main, detail].filter(Boolean).join(", "), lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
}

export async function GET(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3 || q.length > 120) return NextResponse.json({ places: [] });
  try {
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lat=-34.6&lon=-58.44`, {
      headers: { "User-Agent": "MamaniClub/1.0 (app privada)", Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 86_400 }, // la misma búsqueda se reusa un día
    });
    if (!res.ok) return NextResponse.json({ places: [], error: `El buscador respondió ${res.status}` });
    const json = (await res.json()) as { features?: Feature[] };
    const seen = new Set<string>();
    const places = (json.features ?? []).map(toPlace).filter((p) => p.label && !seen.has(p.label) && seen.add(p.label)).slice(0, 5);
    return NextResponse.json({ places });
  } catch {
    return NextResponse.json({ places: [], error: "No pudimos buscar la dirección" });
  }
}
