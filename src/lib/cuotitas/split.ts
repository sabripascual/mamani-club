import { equalSplit } from "../money/split";

/**
 * Cuotas de una parte, igual que la base (cuotita_fill): cociente para todas y los
 * centavos que sobran, de a uno, a las primeras.
 */
export function splitInstallments(partCents: number, installments: number): number[] {
  if (installments < 1 || partCents <= 0) return [];
  const base = Math.floor(partCents / installments);
  const rest = partCents % installments;
  return Array.from({ length: installments }, (_, i) => base + (i < rest ? 1 : 0));
}

/** Vista previa: parte y cuotas de cada participante (la de quien pagó no se debe). */
export function previewCuotita(opts: {
  totalCents: number; installments: number; paidBy: string; split: "equal" | "custom";
  participants: string[]; custom?: Record<string, number>;
}) {
  const parts = opts.split === "equal"
    ? equalSplit(opts.totalCents, opts.participants)
    : new Map(opts.participants.map((id) => [id, opts.custom?.[id] ?? 0]));
  return [...parts].map(([memberId, part]) => ({
    memberId,
    part,
    owes: memberId !== opts.paidBy,
    cuotas: memberId === opts.paidBy ? [] : splitInstallments(part, opts.installments),
  }));
}
