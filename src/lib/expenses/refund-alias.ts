/**
 * Alias al que hay que transferirle a alguien en una juntada: el que eligió en el
 * último gasto que pagó (alias de devolución) o, si no eligió, su alias principal.
 */
export function refundAliasFor(
  gastos: { paid_by: string; refund_alias: string | null; created_at: string }[],
  memberId: string,
  primary?: string | null,
): string | null {
  const chosen = gastos
    .filter((g) => g.paid_by === memberId && g.refund_alias)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.refund_alias;
  return chosen ?? primary ?? null;
}
