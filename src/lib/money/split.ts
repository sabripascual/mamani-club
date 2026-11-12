/**
 * División igualitaria en centavos, idéntica a la de la base (compute_shares):
 * cociente para todas y los centavos sobrantes, de a uno, a las primeras por id.
 * Se usa solo para mostrar la vista previa; la base recalcula y es la que manda.
 */
export function equalSplit(amountCents: number, memberIds: string[]): Map<string, number> {
  const ids = [...new Set(memberIds)].sort();
  const n = ids.length;
  const out = new Map<string, number>();
  if (n === 0 || amountCents <= 0) return out;
  const base = Math.floor(amountCents / n);
  const rest = amountCents % n;
  ids.forEach((id, i) => out.set(id, base + (i < rest ? 1 : 0)));
  return out;
}
