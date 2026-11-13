"use client";

import { useState } from "react";
import { Check, LocateFixed, MapPin } from "lucide-react";
import { Field } from "@/components/ui/field";
import { mapsUrl } from "@/components/maps-link";

/**
 * "¿Dónde?" con botón para marcarlo en el mapa: muestra el lugar en un mapa de Google
 * embebido (sin API paga), permite usar la ubicación actual del teléfono y confirmarla.
 * Lo confirmado es lo que se guarda al enviar el formulario.
 */
export function LocationField({ name, defaultValue, placeholder, error }: { name: string; defaultValue?: string | null; placeholder?: string; error?: string }) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(defaultValue?.trim() || null);
  const q = value.trim();

  const useMyLocation = () => {
    if (!navigator.geolocation) return setGeoError("Tu teléfono no permite compartir la ubicación.");
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setValue(`${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`);
        setConfirmed(null);
        setOpen(true);
        setLocating(false);
      },
      () => { setGeoError("No pudimos obtener tu ubicación. Revisá los permisos."); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <Field label="¿Dónde?" name={name} placeholder={placeholder} value={value} onChange={(e) => { setValue(e.target.value); setConfirmed(null); }} error={error} maxLength={200}
        hint="Opcional. Se abre en Google Maps." />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setOpen((o) => !o)} disabled={!q}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white/70 px-4 text-sm font-semibold text-rose-dark ring-1 ring-rose/30 hover:bg-white disabled:opacity-40">
          <MapPin className="size-4" /> {open ? "Ocultar mapa" : "Marcar en el mapa"}
        </button>
        <button type="button" onClick={useMyLocation} disabled={locating}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white/70 px-4 text-sm font-semibold text-graphite/70 ring-1 ring-graphite/10 hover:bg-white disabled:opacity-40">
          <LocateFixed className="size-4" /> {locating ? "Buscando…" : "Usar mi ubicación"}
        </button>
      </div>
      {geoError && <p className="text-sm text-rose-dark">{geoError}</p>}
      {!open && q && confirmed === q && (
        <p className="inline-flex items-center gap-1.5 self-start rounded-full bg-lime/70 px-3 py-1.5 text-xs font-semibold">
          <Check className="size-3.5" strokeWidth={3} /> Ubicación confirmada · se guarda con el formulario
        </p>
      )}
      {open && q && (
        <div className="overflow-hidden rounded-2xl ring-1 ring-graphite/10">
          <iframe title={`Mapa: ${q}`} src={`https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=15&output=embed`}
            className="h-56 w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          <div className="flex items-center justify-between gap-2 bg-white px-3 py-2">
            <a href={mapsUrl(q)} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-rose-dark">Abrir en Google Maps ↗</a>
            <button type="button" onClick={() => { setConfirmed(q); setOpen(false); }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-graphite px-4 text-xs font-semibold text-cream">
              <Check className="size-4" /> Confirmar ubicación
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
