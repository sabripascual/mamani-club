import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { ResetData } from "./reset-client";

export const metadata: Metadata = { title: "Datos · MAMANÍ CLUB" };

/** Zona de mantenimiento: empezar las pruebas de cero sin tocar a las usuarias. */
export default async function AdminDataPage() {
  const supabase = await createClient();
  const count = async (table: string) => (await supabase.from(table).select("*", { count: "exact", head: true })).count ?? 0;
  const [juntadas, gastos, eventos, fotos, cuotitas, usuarias] = await Promise.all([
    count("juntadas"), count("expenses"), count("events"), count("photos"), count("cuotitas"), count("profiles"),
  ]);
  return (
    <>
      <h1 className="mb-1 font-display text-[1.8rem] font-semibold">Datos</h1>
      <p className="mb-6 text-sm text-graphite/60">Para empezar las pruebas de cero.</p>

      <Card className="mb-6">
        <p className="mb-3 font-semibold">Hoy hay</p>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          <li><strong>{juntadas}</strong> juntadas</li>
          <li><strong>{gastos}</strong> gastos</li>
          <li><strong>{eventos}</strong> eventos</li>
          <li><strong>{fotos}</strong> fotos</li>
          <li><strong>{cuotitas}</strong> cuotitas</li>
          <li><strong>{usuarias}</strong> usuarias</li>
        </ul>
      </Card>

      <Card className="ring-2 ring-rose/40">
        <h2 className="font-display text-xl font-semibold text-rose-dark">Borrar datos de prueba</h2>
        <div className="mt-2 mb-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="font-semibold">Se borra</p>
            <p className="text-graphite/70">Juntadas, gastos, invitadas, transferencias, eventos y respuestas, fotos (también los archivos), likes y comentarios, cuotitas, avisos de juntadas y la auditoría.</p>
          </div>
          <div>
            <p className="font-semibold">Se conserva</p>
            <p className="text-graphite/70">Usuarias y sus perfiles, alias, tarjetas y teléfonos con notificaciones; categorías, tipos de juntada, feriados, frases y el resto del historial de notificaciones.</p>
          </div>
        </div>
        <p className="mb-4 rounded-2xl bg-rose/15 p-3 text-sm font-semibold">⚠️ No se puede deshacer.</p>
        <ResetData />
      </Card>
    </>
  );
}
