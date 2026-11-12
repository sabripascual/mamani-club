export type Debt = { from: string; to: string; amount: number };

/**
 * Simplificación de deudas: a partir de quién le debe a quién, calcula el saldo
 * neto de cada persona y propone la menor cantidad razonable de transferencias
 * (como máximo n−1). Algoritmo greedy: la que más debe le paga a la que más le deben.
 *
 * Es SOLO una sugerencia: no modifica juntadas, partes ni pagos. Una moneda por vez.
 */
export function simplifyDebts(debts: Debt[]): Debt[] {
  const net = new Map<string, number>();
  for (const d of debts) {
    if (d.amount <= 0 || d.from === d.to) continue;
    net.set(d.from, (net.get(d.from) ?? 0) - d.amount);
    net.set(d.to, (net.get(d.to) ?? 0) + d.amount);
  }
  // Orden estable: por monto y, a igual monto, por id (resultado reproducible).
  const byAmount = (a: [string, number], b: [string, number]) => b[1] - a[1] || a[0].localeCompare(b[0]);
  const creditors = [...net].filter(([, v]) => v > 0).sort(byAmount);
  const debtors = [...net].filter(([, v]) => v < 0).map(([k, v]) => [k, -v] as [string, number]).sort(byAmount);

  const out: Debt[] = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i][1], creditors[j][1]);
    out.push({ from: debtors[i][0], to: creditors[j][0], amount: pay });
    debtors[i][1] -= pay;
    creditors[j][1] -= pay;
    if (debtors[i][1] === 0) i++;
    if (creditors[j][1] === 0) j++;
  }
  return out;
}
