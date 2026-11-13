"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, MapPin } from "lucide-react";
import { Field } from "@/components/ui/field";
import { mapsUrl } from "@/components/maps-link";

type Place = { label: string; detail: string; lat: number; lon: number };

/** Arma "Nombre, calle 123" + "Barrio, Ciudad" a partir de un resultado de Photon (OpenStreetMap). */
function toPlace(f: { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> }): Place {
  const p = f.properties;
  const street = [p.street, p.housenumber].filter(Boolean).join(" ");
  const main = [p.name, street].filter((x, i, a) => x && a.indexOf(x) === i).join(", ") || p.city || "";
  const detail = [p.district ?? p.locality, p.city, p.state].filter((x, i, a) => x && a.indexOf(x) === i && x !== main).join(", ");
  return { label: [main, detail].filter(Boolean).join(", "), detail, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
}

/**
 * "¿Dónde?" con sugerencias mientras escribís (Photon / OpenStreetMap, gratis y sin clave,
 * con prioridad cerca de Buenos Aires). Al elegir una dirección se muestra en el mapa y
 * se confirma. Lo que queda en el campo es lo que se guarda con el formulario.
 */
export function LocationField({ name, defaultValue, placeholder, error }: { name: string; defaultValue?: string | null; placeholder?: string; error?: string }) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [selected, setSelected] = useState<Place | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [confirmed, setConfirmed] = useState<string | null>(defaultValue?.trim() || null);
  const typed = useRef(false);
  const q = value.trim();

  // Busca 350 ms después de la última tecla (solo si la persona escribió).
  useEffect(() => {
    if (!typed.current || q.length < 3) { setResults([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5&lat=-34.6&lon=-58.44`, { signal: ctrl.signal });
        const json = await res.json();
        setResults(((json.features ?? []) as Parameters<typeof toPlace>[0][]).map(toPlace).filter((p) => p.label));
        setListOpen(true);
      } catch {
        // Sin conexión o búsqueda cancelada: se puede seguir escribiendo a mano.
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  const choose = (p: Place) => {
    typed.current = false;
    setValue(p.label);
    setSelected(p);
    setResults([]);
    setListOpen(false);
    setConfirmed(null);
    setMapOpen(true);
  };
  const mapQuery = selected && selected.label === value ? `${selected.lat},${selected.lon}` : q;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Field label="¿Dónde?" name={name} placeholder={placeholder} value={value} autoComplete="off" error={error} maxLength={200}
          onChange={(e) => { typed.current = true; setValue(e.target.value); setConfirmed(null); setSelected(null); }}
          onFocus={() => results.length && setListOpen(true)}
          onBlur={() => setTimeout(() => setListOpen(false), 150)}
          hint="Escribí la dirección o el lugar y elegí una opción." />
        {searching && <Loader2 className="absolute top-[2.65rem] right-4 size-4 animate-spin text-graphite/40" />}
        {listOpen && results.length > 0 && (
          <ul role="listbox" aria-label="Direcciones sugeridas"
            className="absolute inset-x-0 top-[5.4rem] z-30 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-graphite/10">
            {results.map((p) => (
              <li key={`${p.lat},${p.lon},${p.label}`}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(p)}
                  className="flex w-full items-start gap-2.5 px-4 py-3 text-left text-sm hover:bg-cream">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-rose-dark" />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{p.label.split(", ")[0]}</span>
                    <span className="block truncate text-xs text-graphite/55">{p.label.split(", ").slice(1).join(", ")}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {q && !mapOpen && confirmed !== q && (
        <button type="button" onClick={() => setMapOpen(true)}
          className="inline-flex h-10 items-center gap-1.5 self-start rounded-full bg-white/70 px-4 text-sm font-semibold text-rose-dark ring-1 ring-rose/30 hover:bg-white">
          <MapPin className="size-4" /> Ver en el mapa
        </button>
      )}
      {!mapOpen && q && confirmed === q && (
        <p className="inline-flex items-center gap-1.5 self-start rounded-full bg-lime/70 px-3 py-1.5 text-xs font-semibold">
          <Check className="size-3.5" strokeWidth={3} /> Ubicación confirmada · se guarda con el formulario
          <button type="button" onClick={() => setMapOpen(true)} className="ml-1 font-semibold text-rose-dark underline-offset-2 hover:underline">ver</button>
        </p>
      )}
      {mapOpen && q && (
        <div className="overflow-hidden rounded-2xl ring-1 ring-graphite/10">
          <iframe title={`Mapa: ${q}`} src={`https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=16&output=embed`}
            className="h-56 w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          <div className="flex items-center justify-between gap-2 bg-white px-3 py-2">
            <a href={mapsUrl(q)} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-rose-dark">Abrir en Google Maps ↗</a>
            <button type="button" onClick={() => { setConfirmed(q); setMapOpen(false); }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-graphite px-4 text-xs font-semibold text-cream">
              <Check className="size-4" /> Confirmar ubicación
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
