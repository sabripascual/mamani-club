/**
 * Formatea centavos como moneda argentina: 12000050 → "$ 120.000,50".
 * - round: sin centavos (para promedios e indicadores).
 * - compact: abrevia millones con un decimal ("$ 1,4 M") para etiquetas de gráficos.
 */
export function formatMoney(cents: number | bigint, currency = "ARS", opts: { compact?: boolean; round?: boolean } = {}) {
  const value = Number(cents) / 100;
  const big = opts.compact && Math.abs(value) >= 1_000_000;
  const showCents = !opts.compact && !opts.round && Number(cents) % 100 !== 0;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    notation: big ? "compact" : "standard",
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: big ? 1 : showCents ? 2 : 0,
  }).format(value);
}

/**
 * Lee un importe escrito a la argentina y lo devuelve en centavos.
 * "120000", "120.000", "120.000,50", "$ 1.500,5" → centavos. Devuelve null si no es válido.
 * Regla: la coma es el separador decimal; los puntos son de miles.
 */
export function parseMoney(input: string): number | null {
  const s = input.replace(/[\s$]/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(s)) return null;
  const [int, dec = ""] = s.replace(/\./g, "").split(",");
  const cents = Number(int) * 100 + Number(dec.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

/** Centavos → texto editable ("120000,50" o "120000"). */
export function centsToInput(cents: number) {
  const int = Math.trunc(cents / 100);
  const dec = cents % 100;
  return dec ? `${int},${String(dec).padStart(2, "0")}` : String(int);
}
